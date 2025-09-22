/**
 * @import { ElementPlacement, IRenderComponentNode, IRenderElementNode, IRenderer, IRenderNode, IRenderTextNode, Obj } from "../jsx"
 * @import { IVDOMNode } from "./types.js"
 */

import { BehaviorSubject, Subscription } from "rxjs"
import { shallowDiff } from "../util/object"
import { VDOMType } from "../constants/vdom"
import { assert } from "../util/assert"


/**
 * @template T
 * @template E
 * @param {IRenderer<T, E>} renderer 
 * @param {IRenderNode<*, *>} node 
 * @param {ElementPlacement} placement 
 * @returns {IVDOMNode<T, E>}
 */
export function createVDOMNode(renderer, node, placement) {
  switch (node.type) {
    case VDOMType.COMPONENT:
      return new VDOMComponentNode(renderer, node, placement)
    case VDOMType.ELEMENT:
      return new VDOMElementNode(renderer, node, placement)
    case VDOMType.TEXT:
      return new VDOMTextNode(renderer, node, placement)
  }
}


/**
 * @template T
 * @template E
 * @implements {IVDOMNode<T, E>}
 */
export class VDOMTextNode {

  /**
   * @param {IRenderer<T, E>} renderer 
   * @param {IRenderTextNode} node 
   * @param {ElementPlacement} placement 
   */
  constructor(renderer, node, placement) {
    this.#renderer = renderer
    this.id = node.id
    this.text = node.text
    this.element = renderer.createTextNode(node.text)
    this.#stream = new BehaviorSubject({ node, placement })

  }

  #stream
  #renderer
  name = 'text'
  placed = false

  /**
   * @param {IRenderTextNode} node 
   * @param {ElementPlacement} placement
   */
  apply(node, placement) {
    this.#stream.next({ node, placement })
  }

  async subscribe() {
    const subscription = new Subscription()
    await new Promise(resolve =>
      subscription.add(
        this.#stream.subscribe(({ node, placement }) => {
          if (!this.placed) {
            this.#renderer.place(this.element, placement)
            this.placed = true
            subscription.add(
              () => {
                this.#renderer.remove(this.element, placement.parent)
              }
            )
            resolve(null)
          }
          if (node.text !== this.text) {
            this.#renderer.setText(node.text, this.element)
            this.text = node.text
          }
        })
      )
    )

    return subscription
  }
}
/**
 * @template T
 * @template E
 * @implements {IVDOMNode<T, E>}
 */
export class VDOMElementNode {

  /**
   * @param {IRenderer<T, E>} renderer 
   * @param {IRenderElementNode<*>} node 
   * @param {ElementPlacement} placement 
   */
  constructor(renderer, node, placement) {
    this.#renderer = renderer
    this.id = node.id
    this.name = node.tag
    this.element = renderer.createElement(node.tag)
    this.#stream$ = new BehaviorSubject({ node, placement })
  }

  /** @type {Record<string, *>} */
  props = {}

  /** @type {Record<string, IRenderNode>} */
  children = {}

  placed = false

  /** @type {Record<string, () => void>} */
  #events = {}

  /** @type {Promise<Record<string, IVDOMNode<T, E>>>} */
  #vdom = Promise.resolve({})

  /** @type {Record<string, Subscription>} */
  #subscriptions = {}

  #renderer
  #stream$

  /**
   * @param {IRenderElementNode<*>} node 
   * @param {ElementPlacement} placement 
   */
  apply(node, placement) {
    this.#stream$.next({ node, placement })
  }

  async subscribe() {
    const subscription = new Subscription()
    await new Promise(resolve =>
      subscription.add(
        this.#stream$.subscribe(async ({ node, placement }) => {
          const vdom = await this.#vdom

          /** @type {PromiseWithResolvers<Record<string, IVDOMNode<T, E>>>} */
          const rendering = Promise.withResolvers()
          this.#vdom = rendering.promise

          const changedProps = shallowDiff(node.props, this.props)
          if (changedProps.length > 0) {
            const { props, events } = this.#renderer.determinePropsAndEvents(changedProps)
            for (const name of props) {
              this.#renderer.setProperty(this.element, name, node.props[name])
            }
            for (const name of events) {
              this.#events[name]?.()
              this.#events[name] = this.#renderer.listen(this.element, name, node.props[name])
            }
          }

          const { added, removed, keys, simblings } = detectChildrenChanges(node.children, this.children)

          for (const id of removed) {
            assert(vdom[id], `VDOM Element with id "${id}" not found`)
            assert(this.#subscriptions[id], `VDOM Subscription with id "${id}" not found`)
            this.#subscriptions[id].unsubscribe()
            console.debug('Removed VDOM element', id)
            delete vdom[id]
            delete this.#subscriptions[id]
          }

          for (const id of keys) {
            if (added.has(id)) {
              assert(!vdom[id], `There is already a VDOM Element with id "${id}"`)
              const { previous, next } = simblings[id]
              vdom[id] = createVDOMNode(this.#renderer, node.children[id], {
                parent: this.element,
                next: () => {
                  if (!next) return null
                  return vdom[next]?.element ?? null
                },
                previous: () => {
                  if (!previous) return null
                  return vdom[previous]?.element ?? null
                }
              })
              this.#subscriptions[id] = await vdom[id].subscribe()
              console.debug('Added VDOM element', id)
            } else {
              assert(vdom[id], `VDOM Element with id "${id}" not found`)
              vdom[id].apply(node.children[id], placement)
            }
          }

          this.children = node.children

          if (!this.placed) {
            this.placed = true
            this.#renderer.place(this.element, placement)
            subscription.add(
              () => {
                this.#stream$.complete()
                this.#renderer.remove(this.element, placement.parent)
                Object.values(this.#events).map(unsubscribe => unsubscribe())
                Object.values(this.#subscriptions).forEach(subscription => subscription.unsubscribe())
                this.#vdom = Promise.resolve({})
                this.children = {}
              }
            )
            resolve(null)
          }

          rendering.resolve(vdom)

        })
      )

    )

    return subscription
  }

}


/**
 * @template T
 * @template E
 * @implements {IVDOMNode<T, E>}
 */
export class VDOMComponentNode {
  /**
   * @param {IRenderer<T, E>} renderer 
   * @param {IRenderComponentNode<*>} node
   * @param {ElementPlacement} placement 
   */
  constructor(renderer, node, placement) {
    this.#renderer = renderer
    this.id = node.id
    this.name = node.name
    this.props = node.props
    this.placement = placement
    this.#props$ = new BehaviorSubject(node.props)
    this.#stream$ = node.component(this.#props$)
  }

  #renderer
  #props$
  #stream$

  /** @type {Promise<Subscription> | null} */
  #subscription = null

  /** @type {IVDOMNode<T, E> | null} */
  child = null

  get element() {
    return this.child?.element ?? null
  }

  /**
   * @param {IRenderComponentNode<*>} node 
   */
  apply(node) {
    this.#props$.next(node.props)
  }

  async subscribe() {
    const subscription = new Subscription()
    await new Promise(resolve =>
      subscription.add(
        this.#stream$.subscribe(async node => {
          if (!this.child && !node) return
          if (this.child && (!node || node.id !== this.child.id)) {
            const componentSub = await this.#subscription
            assert(componentSub, `Component child subscription not found for component ${this.name} (${this.id})`)
            componentSub.unsubscribe()
            subscription.remove(componentSub)
            this.child = null
            this.#subscription = null
          }
          if (!this.child && node) {
            this.child = createVDOMNode(this.#renderer, node, this.placement)
            this.#subscription = this.child.subscribe()
            subscription.add(await this.#subscription)
            subscription.add(() => {
              this.#props$.complete()
              console.debug('Component VDOM Node destroyed', this)
            })
            resolve(null)
            return
          }
          if (this.child && node) {
            this.child.apply(node, this.placement)
          }
        })
      )
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
  /** @type {Set<string>} */
  const added = new Set()
  /** @type {Set<string>} */
  const removed = new Set()
  /** @type {Record<string, { next: string | null, previous: string | null }>} */
  const simblings = {}

  for (const key of all) {
    if (!(key in nextState) && key in previousState) {
      removed.add(key)
      continue
    }

    if (key in nextState && !(key in previousState)) {
      added.add(key)
      continue
    }
  }

  for (let i = 0; i < keys.length; i++) {
    const previous = i > 0 ? keys[i - 1] : null
    const key = keys[i]
    const next = keys[i + 1] ?? null

    simblings[key] = { next, previous }
  }

  return {
    added,
    removed: Array.from(removed),
    keys,
    previous,
    simblings
  }

}
