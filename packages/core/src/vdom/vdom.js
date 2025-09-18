/**
 * @import { Observable } from "rxjs"
 * @import { ElementPlacement, IRenderComponentNode, IRenderElementNode, IRenderer, IRenderNode, IRenderTextNode, Obj, Props } from "../jsx.js"
 * @import { IVDOMType } from "../constants/types.js"
 */

import { first, map, shareReplay, switchMap, Subscription, combineLatest, isObservable, of, filter } from "rxjs"
import { VDOMType } from "../constants/vdom.js"
import { assert } from "../util/assert.js"
import { shallowDiff } from "../util/object.js"

/**
 * @template [T=unknown]
 * @template [E=unknown]
 * @param {IRenderer<T, E>} renderer 
 * @param {IVDOMType} type 
 * @param {Observable<*>} node$ 
 */
export function createVDOMNode(renderer, type, node$) {
  switch (type) {
    case VDOMType.TEXT:
      return new VDOMTextNode(renderer, node$)
    case VDOMType.ELEMENT:
      return new VDOMElementNode(renderer, node$)
    case VDOMType.COMPONENT:
      return new VDOMComponentNode(renderer, node$)
  }
}

/**
 * @template [T=unknown]
 * @template [E=unknown]
 */
class VDOMTextNode {

  /**
   * @param {IRenderer<T, E>} renderer 
   * @param {Observable<IRenderTextNode>} node$ 
   */
  constructor(renderer, node$) {
    this.#node$ = node$.pipe(shareReplay())
    this.#renderer = renderer
  }

  text = ''
  type = VDOMType.TEXT
  #node$
  #renderer

  /** @type {T | null} */
  element = null

  /**
   * @param {ElementPlacement<T, E>} placement 
   */
  subscribe(placement) {
    const subscription = new Subscription()

    subscription.add(
      this.#node$.subscribe(node => {
        if (node === null) return
        if (!this.element) {
          this.element = this.#renderer.createTextNode(node.text)
          this.#renderer.place(this.element, placement)
          subscription.add(
            () => {
              console.log('removing text node', this.element)
              if (this.element) this.#renderer.remove(this.element, placement.parent)
            }
          )
          return
        }
        if (this.text !== node.text) {
          this.text = node.text
          this.#renderer.setText(node.text, this.element)
        }
      })
    )

    return subscription
  }

}

/**
 * @template [T=unknown]
 * @template [E=unknown]
 */
class VDOMElementNode {

  /**
   * @param {IRenderer<T, E>} renderer 
   * @param {Observable<IRenderElementNode>} node$
   */
  constructor(renderer, node$) {
    this.#node$ = node$.pipe(shareReplay())
    this.#renderer = renderer
  }

  type = VDOMType.ELEMENT

  #node$
  #renderer
  /** @type {E | null} */
  element = null

  /** @type {Obj} */
  props = {}

  /** @type {Record<string, IRenderNode>} */
  children = {}

  /** @type {Record<string, Subscription>} */
  #subscriptions = {}

  /** @type {Record<string, VDOMTextNode<T, E> | VDOMElementNode<T, E> | VDOMComponentNode<*, T, E> | null>} */
  vdom = {}

  /** @type {Record<string, () => void>} */
  #events = {}

  /**
   * @param {ElementPlacement<T, E>} placement 
   */
  subscribe(placement) {
    const subscription = new Subscription()

    subscription.add(
      this.#node$.subscribe(node => {
        if (node === null) return
        const element = this.element ?? this.#renderer.createElement(node.tag)

        const propsDiff = shallowDiff(node.props, this.props)
        if (propsDiff.length > 0) {
          const { props, events } = this.#renderer.determinePropsAndEvents(propsDiff)
          for (const prop of props) this.#renderer.setProperty(element, prop, node.props[prop])
          for (const event of events) {
            this.#events[event]?.()
            this.#events[event] = this.#renderer.listen(element, event, node.props[event])
          }
        }
        this.props = node.props

        const { removed, added, simblings } = detectChildrenChanges(node.children, this.children)

        for (const id of removed) {
          const subscription = this.#subscriptions[id]
          assert(subscription, "VDOM References must have an subscription")
          subscription.unsubscribe()
          delete this.#subscriptions[id]
          delete this.vdom[id]
        }

        for (const id of added) {
          const child = node.children[id]
          const { previous, next } = simblings[id]
          this.vdom[id] = createVDOMNode(this.#renderer, child.type, this.#node$.pipe(map(node => node?.children?.[id] ?? null)))
          this.#subscriptions[id] = this.vdom[id].subscribe({
            parent: element,
            previous: () => {
              return previous ? this.vdom[previous]?.element ?? null : null
            },
            next: () => {
              return next ? this.vdom[next]?.element ?? null : null
            }
          })
        }

        this.children = node.children

        if (!this.element) {
          this.#renderer.place(element, placement)
          this.element = element
          subscription.add(
            () => {
              console.log('removing element node', this.element)
              Object.values(this.#events).forEach(unsub => unsub())
              if (this.element) this.#renderer.remove(this.element, placement.parent)
              Object.values(this.#subscriptions).forEach(subscription => subscription.unsubscribe())
            }
          )
        }
      })
    )
    return subscription
  }

}

/**
 * @template {Obj} [P = *]
 * @template [T=unknown]
 * @template [E=unknown]
 */
export class VDOMComponentNode {

  /**
   * @param {IRenderer<T, E>} renderer 
   * @param {Observable<IRenderComponentNode<P>>} node$ 
   */
  constructor(renderer, node$) {
    this.#renderer = renderer
    this.props$ = node$.pipe(
      filter(node => node !== null),
      switchMap(({ props }) =>
        combineLatest(
          Object.fromEntries(
            Object.entries(props).map(([key, value]) => [
              key,
              isObservable(value) ? value : of(value)
            ])
          )
        )
      ),
    )
    this.#node$ = node$.pipe(
      filter(node => node !== null),
      first(),
      switchMap(({ component }) =>
        component(/** @type {Observable<Props<P>>} */(this.props$))
      ),
      shareReplay()
    )
  }

  #renderer
  #node$

  /** @type {VDOMTextNode<T, E> | VDOMElementNode<T, E> | VDOMComponentNode<*, T, E> | null} */
  child = null

  /** @type {Subscription | null} */
  subscription = null

  /** @type {T | E | null} */
  element = null

  /**
   * @param {ElementPlacement<T, E>} placement 
   */
  subscribe(placement) {
    const subscription = new Subscription()

    subscription.add(
      this.#node$.subscribe(node => {
        if (node === null && !this.child) return;
        if (node === null || (this.id && node.id !== this.id)) {
          this.subscription?.unsubscribe()
          this.child = null
        }
        if (node !== null && !this.child) {
          this.id = node.id
          this.child = createVDOMNode(this.#renderer, node.type, this.#node$)
          this.element = this.child.element
          this.subscription = this.child.subscribe(placement)
          subscription.add(() => console.debug('Destroying component', node.id))
          subscription.add(this.subscription)
        }
      })
    )

    return subscription
  }
}

/**
 * @param {Obj} nextState 
 * @param {Obj} previousState 
 */
function detectChildrenChanges(nextState, previousState) {
  const keys = Object.keys(nextState)
  const previous = Object.keys(previousState)
  const all = new Set([...keys, ...previous])
  const added = []
  const removed = []
  const remaining = []
  /** @type {Record<string, { next: string | null, previous: string | null }>} */
  const simblings = {}

  for (const key of all) {
    if (key in nextState && !(key in previousState)) {
      added.push(key)
      continue
    }
    if (!(key in nextState) && key in previousState) {
      removed.push(key)
      continue
    }
    remaining.push(key)
  }

  for (let i = 0; i < keys.length; i++) {
    const previous = i > 0 ? keys[i - 1] : null
    const key = keys[i]
    const next = keys[i + 1] ?? null

    simblings[key] = { next, previous }
  }

  return {
    added,
    removed,
    remaining,
    keys,
    previous,
    simblings
  }

}
