/**
 * @import { Observable } from "rxjs"
 * @import { ComponentInstance, ElementPlacement, Inputs, IRenderComponentNode, IRenderElementNode, IRenderer, IRenderFragmentNode, IRenderNode, IRenderTextNode, Obj } from "../jsx"
 * @import { IVDOMChildrenBase, IVDOMNode } from "./types.js"
 */

import { assert, shallowDiff, shallowEqual } from "@jsxrx/utils"
import {
  BehaviorSubject,
  combineLatest,
  debounceTime,
  distinctUntilChanged,
  filter,
  isObservable,
  map,
  merge,
  of,
  shareReplay,
  Subscription,
  switchMap,
  tap,
} from "rxjs"
import { VDOMType } from "../constants/vdom"
import { ContextMap } from "../context"
import {
  compareProps,
  compareRenderNode,
  isRenderNode,
  toRenderNode,
} from "./render"

/**
 * @template T
 * @template E
 * @param {IRenderer<T, E>} renderer
 * @param {IRenderNode} node
 * @param {ElementPlacement} placement
 * @param {ComponentInstance} instance
 * @returns {IVDOMNode<T, E>}
 */
export function createVDOMNode(renderer, node, placement, instance) {
  switch (node.type) {
    case VDOMType.COMPONENT:
      return new VDOMComponentNode(renderer, node, placement, instance)
    case VDOMType.ELEMENT:
      return new VDOMElementNode(renderer, node, placement, instance)
    case VDOMType.TEXT:
      return new VDOMTextNode(renderer, node, placement)
    case VDOMType.FRAGMENT:
      return new VDOMFragmentNode(renderer, node, placement, instance)
  }
}

/**
 * @template {Obj} P
 * @template {P} IP
 * @implements {Inputs<P & IP>}
 */
class Input {
  /**
   * @param {ComponentInstance} instance
   * @param {P} props
   * @param {IP} [defaultProps]
   */
  constructor({ context }, props, defaultProps) {
    this.context = context
    this.#pending$ = new BehaviorSubject(true)
    this.#props$ = new BehaviorSubject(props)
    this.defaultProps = defaultProps
    this.pending$ = this.#pending$.pipe(debounceTime(1), distinctUntilChanged())
    this.props$ = /** @type {Observable<P & IP>} */ (
      this.#props$.pipe(
        switchMap(props =>
          combineLatest(
            Object.fromEntries(
              Object.entries(props).map(([key, value]) => {
                if (isObservable(value)) return [key, value]
                return [key, of(value)]
              }),
            ),
          ),
        ),
        debounceTime(1),
        distinctUntilChanged(compareProps),
      )
    )
    this.#set(props)
  }

  #pending$
  #props$

  /** @type {Record<string | symbol, Observable<*>>} */
  #map = {}

  props = /** @type {Inputs<P & IP>['props']} */ (
    new Proxy(this.#map, {
      get: (target, prop) => {
        if (prop in target) {
          return target[prop].pipe(
            source$ =>
              merge(
                source$.pipe(
                  filter(value => isObservable(value)),
                  switchMap(value => value),
                ),
                source$.pipe(filter(value => !isObservable(value))),
              ),
            distinctUntilChanged((a, b) => {
              if (isRenderNode(a) && isRenderNode(b))
                return compareRenderNode(a, b)
              return a === b
            }),
            debounceTime(1),
          )
        }
        return of(/** @type {*} */ (this.defaultProps)?.[prop])
      },
      ownKeys: target => Object.keys(target),
    })
  )

  /**
   * @param {P} props
   */
  apply(props) {
    this.#props$.next(props)
  }

  /**
   * @param {P} values
   */
  #set(values) {
    this.#pending$.next(true)
    for (const [key, value] of Object.entries(values)) {
      if (!this.#map[key]) {
        this.#map[key] = isObservable(value)
          ? value
          : new BehaviorSubject(value)
        continue
      }
      if (this.#map[key] instanceof BehaviorSubject) {
        assert(
          !isObservable(value),
          `Can't switch from normal value to observable value of prop: ${key}`,
        )
        this.#map[key].next(value)
        continue
      }
      if (isObservable(this.#map[key]) && isObservable(value)) {
        assert(
          this.#map[key] === value,
          `Can't change observable value of prop: ${key}`,
        )
      }
    }
  }

  asObservable() {
    return this.props$.pipe(
      map(props => Object.keys(props)),
      distinctUntilChanged(shallowEqual),
      map(() => this),
    )
  }

  done() {
    this.#pending$.next(false)
  }
}

/**
 * @abstract
 * @template {IRenderElementNode | IRenderFragmentNode} N
 * @template T
 * @template E
 * @implements {IVDOMChildrenBase<N, T, E>}
 */
class VDOMChildrenBase {
  /**
   * @param {IRenderer<T, E>} renderer
   * @param {ComponentInstance} instance
   */
  constructor(renderer, instance) {
    this.#renderer = renderer
    this.instance = instance
  }

  #renderer

  /** @type {Record<string, Subscription>} */
  #subscriptions = {}

  /** @type {Record<string, IRenderNode>} */
  children = {}

  /**
   * @abstract
   * @param {Record<string, IVDOMNode<T, E>>} _vdom
   * @param {{ previous: string | null, next: string | null }} _simblings
   * @param {ElementPlacement<T, E>} _parentPlacement
   * @returns {ElementPlacement<T, E>}
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  createChildPlacement(_vdom, _simblings, _parentPlacement) {
    throw new Error(
      "Abstract method: should be implemented by extending classes",
    )
  }

  /**
   * @param {Record<string, IVDOMNode<T, E>>} vdom
   * @param {N} node
   * @param {ElementPlacement<T, E>} placement
   */
  async handleChildren(vdom, node, placement) {
    const { added, removed, keys, simblings } = detectChildrenChanges(
      node.children,
      this.children,
    )

    for (const id of removed) {
      assert(vdom[id], `VDOM Element with id "${id}" not found`)
      assert(
        this.#subscriptions[id],
        `VDOM Subscription with id "${id}" not found`,
      )
      this.#subscriptions[id].unsubscribe()
      console.debug("Removed VDOM element", id)
      delete vdom[id]
      delete this.#subscriptions[id]
    }

    for (const id of keys) {
      const { previous, next } = simblings[id]
      const childPlacement = this.createChildPlacement(
        vdom,
        { previous, next },
        placement,
      )
      if (added.has(id)) {
        assert(!vdom[id], `There is already a VDOM Element with id "${id}"`)
        vdom[id] = createVDOMNode(
          this.#renderer,
          node.children[id],
          childPlacement,
          this.instance,
        )
        this.#subscriptions[id] = await vdom[id].subscribe()
        console.debug("Added VDOM element", id)
        continue
      }

      assert(vdom[id], `VDOM Element with id "${id}" not found`)
      vdom[id].apply(node.children[id], childPlacement)
    }

    this.children = node.children

    return keys
  }

  unsubscribeChildren() {
    Object.values(this.#subscriptions).forEach(subscription =>
      subscription.unsubscribe(),
    )
    this.#subscriptions = {}
    this.children = {}
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
    this.#element = renderer.createTextNode(node.text ?? "")
    this.#stream = new BehaviorSubject({ node, placement })
  }

  #element
  #stream
  #renderer
  name = "text"
  placed = false

  async firstElement() {
    return this.#element
  }

  async lastElement() {
    return this.#element
  }

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
        this.#stream.subscribe(async ({ node, placement }) => {
          if (!this.placed) {
            await this.#renderer.place(this.#element, placement)
            console.debug(`Placed Text Node ${this.id}`, this.#element)
            this.placed = true
            subscription.add(() => {
              this.#renderer.remove(this.#element, placement.parent)
              console.debug(`Removed Text Node ${this.id}`)
            })
            resolve(null)
          }
          if (node.text !== this.text) {
            this.#renderer.setText(node.text ?? "", this.#element)
            this.text = node.text
          }
        }),
      ),
    )

    return subscription
  }
}
/**
 * @template T
 * @template E
 * @implements {IVDOMNode<T, E>}
 * @extends {VDOMChildrenBase<IRenderElementNode, T, E>}
 */
export class VDOMElementNode extends VDOMChildrenBase {
  /**
   * @param {IRenderer<T, E>} renderer
   * @param {IRenderElementNode} node
   * @param {ElementPlacement<T, E>} placement
   * @param {ComponentInstance} instance
   */
  constructor(renderer, node, placement, instance) {
    super(renderer, instance)
    this.#renderer = renderer
    this.id = node.id
    this.name = node.tag
    this.#element = renderer.createElement(node.tag)
    this.#stream$ = new BehaviorSubject({ node, placement })
  }

  /** @type {Record<string, *>} */
  props = {}

  placed = false

  /** @type {Record<string, () => void>} */
  #events = {}

  /** @type {Promise<Record<string, IVDOMNode<T, E>>>} */
  #vdom = Promise.resolve({})

  #element
  #renderer
  #stream$

  async firstElement() {
    await this.#vdom
    return this.#element
  }

  async lastElement() {
    await this.#vdom
    return this.#element
  }

  /**
   * @param {IRenderElementNode} node
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
            const { props, events } =
              this.#renderer.determinePropsAndEvents(changedProps)
            for (const name of props) {
              this.#renderer.setProperty(this.#element, name, node.props[name])
            }
            for (const name of events) {
              this.#events[name]?.()
              this.#events[name] = this.#renderer.listen(
                this.#element,
                name,
                node.props[name],
              )
            }
          }

          await this.handleChildren(vdom, node, placement)

          if (!this.placed) {
            this.placed = true
            await this.#renderer.place(this.#element, placement)
            console.debug(
              `Placed element ${this.id} (tag: ${this.name})`,
              this.#element,
            )
            subscription.add(async () => {
              await this.#vdom
              this.#stream$.complete()
              this.#renderer.remove(this.#element, placement.parent)
              Object.values(this.#events).map(unsubscribe => unsubscribe())
              this.unsubscribeChildren()
              this.#vdom = Promise.resolve({})
              console.debug(
                `Removed element ${this.id} (tag: ${this.name})`,
                this.#element,
              )
            })
            resolve(null)
          }
          {
            detectAndMove(this.#renderer, this.#element, placement)
          }

          rendering.resolve(vdom)
        }),
      ),
    )

    return subscription
  }

  /**
   * @param {Record<string, IVDOMNode<T, E>>} vdom
   * @param {{ previous: string | null, next: string | null }} simblings
   * @returns {ElementPlacement<T, E>}
   */
  createChildPlacement(vdom, { next, previous }) {
    return {
      parent: this.#element,
      next: async () => {
        if (!next) return null
        return (await vdom[next]?.firstElement()) ?? null
      },
      previous: async () => {
        if (!previous) return null
        return (await vdom[previous]?.lastElement()) ?? null
      },
    }
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
   * @param {IRenderComponentNode} node
   * @param {ElementPlacement<T, E>} placement
   * @param {ComponentInstance} upstream
   */
  constructor(renderer, node, placement, upstream) {
    assert(
      upstream.context instanceof ContextMap,
      "component upstream instance context property should be instance of ContextMap class",
    )
    this.instance = { context: upstream.context.downstream() }
    this.#renderer = renderer
    this.id = node.id
    this.name = node.name
    this.props = node.props
    this.input = new Input(upstream, node.props)
    this.placement = placement
    this.#stream$ = node.component(this.input.asObservable()).pipe(
      debounceTime(1),
      map(toRenderNode),
      tap(() => this.input.done()),
      distinctUntilChanged(compareRenderNode),
      tap(() => console.debug(`${node.name} rendered`)),
      shareReplay(),
    )
  }

  /** @type {ComponentInstance} */
  instance
  #renderer
  #stream$

  /** @type {Promise<Subscription> | null} */
  #subscription = null

  /** @type {IVDOMNode<T, E> | null} */
  child = null

  async firstElement() {
    await this.#subscription
    return (await this.child?.firstElement()) ?? null
  }

  async lastElement() {
    await this.#subscription
    return (await this.child?.lastElement()) ?? null
  }

  /**
   * @param {IRenderComponentNode} node
   * @param {ElementPlacement<T, E>} placement
   */
  apply(node, placement) {
    this.props = node.props
    this.input.apply(node.props)
    this.placement = placement
  }

  async subscribe() {
    const subscription = new Subscription()
    await new Promise(resolve =>
      subscription.add(
        this.#stream$.subscribe(async node => {
          if (!this.child && !node) return
          if (this.child && (!node || node.id !== this.child.id)) {
            const componentSub = await this.#subscription
            assert(
              componentSub,
              `Component child subscription not found for component ${this.name} (${this.id})`,
            )
            componentSub.unsubscribe()
            subscription.remove(componentSub)
            this.child = null
            this.#subscription = null
          }
          if (!this.child && node) {
            this.child = createVDOMNode(
              this.#renderer,
              node,
              this.placement,
              this.instance,
            )
            this.#subscription = this.child.subscribe()
            subscription.add(await this.#subscription)
            subscription.add(() => {
              // TODO: add unmount logic
              console.debug("Component VDOM Node destroyed", this)
            })
            resolve(null)
            console.debug(
              `VDOM Component Child added: ${this.child.id} (${this.child.name})`,
            )
            return
          }
          if (this.child && node) {
            this.child.apply(node, this.placement)
          }
        }),
      ),
    )
    return subscription
  }
}

/**
 * @template T
 * @template E
 * @implements {IVDOMNode<T, E>}
 * @extends {VDOMChildrenBase<IRenderFragmentNode, T, E>}
 */
export class VDOMFragmentNode extends VDOMChildrenBase {
  /**
   * @param {IRenderer<T, E>} renderer
   * @param {IRenderFragmentNode} node
   * @param {ElementPlacement<T, E>} placement
   * @param {ComponentInstance} instance
   */
  constructor(renderer, node, placement, instance) {
    super(renderer, instance)
    this.id = node.id
    this.#stream$ = new BehaviorSubject({ node, placement })
  }

  name = "Fragment"

  #stream$

  /** @type {Promise<Record<string, IVDOMNode<T, E>>>} */
  #vdom = Promise.resolve({})

  /** @type {string[]} */
  #keys = []

  placed = false

  async firstElement() {
    const vdom = await this.#vdom
    return (await vdom[this.#keys[0]]?.firstElement()) ?? null
  }

  async lastElement() {
    const vdom = await this.#vdom
    if (this.#keys.length === 0) return null
    return (
      (await vdom[this.#keys[this.#keys.length - 1]]?.lastElement()) ?? null
    )
  }

  /**
   * @param {IRenderFragmentNode} node
   * @param {ElementPlacement<T, E>} placement
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

          this.#keys = await this.handleChildren(vdom, node, placement)

          if (!this.placed) {
            this.placed = true
            subscription.add(() => {
              this.#stream$.complete()
              this.unsubscribeChildren()
              this.#vdom = Promise.resolve({})
              this.#keys = []
            })
            resolve(null)
          }

          rendering.resolve(vdom)
        }),
      ),
    )

    return subscription
  }

  /**
   * @param {Record<string, IVDOMNode<T, E>>} vdom
   * @param {{ previous: string | null, next: string | null }} simblings
   * @param {ElementPlacement<T, E>} placement
   * @returns {ElementPlacement<T, E>}
   */
  createChildPlacement(vdom, { previous, next }, placement) {
    return {
      parent: placement.parent,
      next: async () => {
        if (!next) return (await placement.next?.()) ?? null
        return (
          (await vdom[next]?.firstElement()) ??
          (await placement.next?.()) ??
          null
        )
      },
      previous: async () => {
        if (!previous) return (await placement.previous?.()) ?? null
        return (
          (await vdom[previous]?.lastElement()) ??
          (await placement.previous?.()) ??
          null
        )
      },
    }
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
    simblings,
  }
}

/**
 * @template T
 * @template E
 * @template {T | E} EL
 * @param {IRenderer<T, E>} renderer
 * @param {EL} element
 * @param {ElementPlacement<T, E>} placement
 */
async function detectAndMove(renderer, element, placement) {
  const current = renderer.getPlacement(element)
  const currentPrev = (await current.previous?.()) ?? null
  const currentNext = (await current.next?.()) ?? null

  const newPlacementPrev = (await placement.previous?.()) ?? null
  const newPlacementNext = (await placement.next?.()) ?? null

  if (currentPrev !== newPlacementPrev) {
    return await renderer.move(element, {
      parent: placement.parent,
      previous: placement.previous,
    })
  }
  if (currentNext && currentNext !== newPlacementNext) {
    return await renderer.move(element, {
      parent: placement.parent,
      next: placement.next,
    })
  }
}
