/**
 * @import { Observable } from "rxjs"
 * @import { ComponentInstance, ElementNode, ElementPosition, IRenderComponentNode, IRenderElementNode, IRenderer, IRenderFragmentNode, IRenderSuspenseNode, IRenderText, Ref, SuspensionContext, SuspensionController } from "../jsx.js"
 * @import { VChildren, VNode, VNodeComponent, VNodeObservable, VNodeWithChildren, VRoot } from "./types.js"
 */

import { asArray, assert, shallowDiff } from "@jsxrx/utils"
import {
  BehaviorSubject,
  combineLatest,
  debounceTime,
  distinctUntilChanged,
  filter,
  isObservable,
  map,
  Subject,
  Subscription,
  switchMap,
  take,
} from "rxjs"
import { VDOMType } from "../constants/vdom.js"
import { ContextMap } from "../context.js"
import { Input, isObservableDelegate, isRef, pending } from "../observable.js"
import { findPreviousLastElement } from "../renderer/positioning.js"
import { isRenderNode } from "./render.js"

/**
 * @template T
 * @template E
 * @param {IRenderer<T, E>} renderer
 * @param {E | null | undefined} element
 * @returns {VRoot}
 */
export function createRoot(renderer, element) {
  assert(element, "Root element must not be null")

  return {
    /**
     * @param {ElementNode} node
     */
    mount(node) {
      const subscription = new Subscription()

      subscription.add(renderer.subscribe())

      const rootSuspensionContext = createSuspensionContext()

      const rootNode = createNode(renderer, "root", node, {
        context: new ContextMap(),
        suspension: rootSuspensionContext.downstream(),
      })

      subscription.add(
        rootSuspensionContext.suspended$
          .pipe(filter(suspended => suspended))
          .subscribe(() => {
            console.warn(
              "Application root received a suspension notification, that means some child component has been suspended and not captured by any Suspense",
            )
          }),
      )
      subscription.add(rootNode.mount())

      rootNode.placeIn({
        parent: element,
      })

      return subscription
    },
  }
}

/**
 * @template T
 * @template E
 * @param {IRenderer<T, E>} renderer
 * @param {string} parentId
 * @param {ElementNode} node
 * @param {ComponentInstance} instance
 * @returns {VNode<T, E>}
 */
function createNode(renderer, parentId, node, instance) {
  if (node === null || node === undefined) {
    return createNullNode(renderer)
  }
  if (isRenderNode(node)) {
    switch (node.type) {
      case VDOMType.ELEMENT:
        return createElementNode(renderer, node, instance)
      case VDOMType.FRAGMENT:
        return createFragmentNode(renderer, node, instance)
      case VDOMType.COMPONENT:
        return createComponentNode(renderer, node, instance)
      case VDOMType.SUSPENSE:
        return createSuspenseNode(renderer, node, instance)
    }
  }
  if (isObservable(node))
    return createObservableNode(
      renderer,
      `${parentId}:observable`,
      node,
      instance,
    )
  if (Array.isArray(node))
    return createChildrenNode(
      renderer,
      `${parentId}:array`,
      node,
      instance,
      "indexAsDefaultKey",
    )
  return createTextNode(renderer, node)
}

/**
 * @template T
 * @template E
 * @param {IRenderer<T, E>} renderer
 * @returns {VNode<T, E, null | undefined>}
 */
function createNullNode(renderer) {
  /** @type {ElementPosition<T, E> | null} */
  let currentPosition = null
  return {
    key: null,
    type: VDOMType.NULL,
    get placed() {
      return currentPosition !== null
    },
    get lastElement() {
      if (!currentPosition) return null
      const previousPosition = findPreviousLastElement(
        renderer,
        currentPosition,
      )
      return previousPosition?.lastElement ?? null
    },
    mount() {
      return new Subscription()
    },
    update() {},
    placeIn(position) {
      currentPosition = position
    },
    remove() {
      currentPosition = null
    },
  }
}

/**
 * @template T
 * @template E
 * @param {IRenderer<T, E>} renderer
 * @param {IRenderText} value
 * @returns {VNode<T, E, IRenderText>}
 */
function createTextNode(renderer, value) {
  /** @type {T | null} */
  let node = null
  /** @type {ElementPosition<T, E> | null} */
  let currentPosition = null
  let placed = false

  return {
    type: VDOMType.TEXT,
    key: null,
    get placed() {
      return placed
    },
    get lastElement() {
      return node
    },
    mount() {
      node = renderer.createTextNode(String(value))
      return new Subscription(() => {
        remove()
        node = null
        currentPosition = null
      })
    },
    update(next) {
      assert(node, "text node element must not be null when updating")
      if (next !== value) {
        renderer.setText(String(next), node)
        value = next
      }
    },
    placeIn,
    remove,
  }

  /**
   * @param {ElementPosition<T, E>} position
   */
  function placeIn(position) {
    if (placed && position === currentPosition) return
    assert(node, "text node element must not be null when placing it in DOM")
    renderer.place(node, position)
    currentPosition = position
    placed = true
  }

  function remove() {
    if (!placed) return
    assert(node, "text node element must not be null when unmounting")
    assert(
      currentPosition,
      "text node element current position must not be null when unmounting",
    )
    renderer.remove(node, currentPosition.parent)
    placed = false
  }
}

/**
 * @template T
 * @template E
 * @param {IRenderer<T, E>} renderer
 * @param {IRenderElementNode} node
 * @param {ComponentInstance} instance
 * @returns {VNodeWithChildren<T, E, IRenderElementNode>}
 */
function createElementNode(renderer, node, instance) {
  /** @type {E | null} */
  let element = null
  /** @type {ElementPosition<T, E> | null} */
  let currentPosition = null
  /** @type {{ events: Record<string, Subscription>, props: Record<string, Subscription>, suspensions: Record<string, Subscription>, ref: Subscription | null, children: Subscription | null }} */
  let subscriptions = {
    ref: null,
    children: null,
    events: {},
    props: {},
    suspensions: {},
  }
  /** @type {Record<string, BehaviorSubject<Observable<unknown>>>} */
  let observables = {}
  /** @type {Record<string, () => void>} */
  let listeners = {}

  /** @type {VChildren<T, E> | null} */
  let children = null

  let placed = false

  /** @type {Record<string, SuspensionController>} */
  let propsSuspensions = {}

  /** @type {Ref<T> | null} */
  let ref = null

  return {
    type: VDOMType.ELEMENT,
    name: node.tag,
    key: node.key ?? null,
    get placed() {
      return placed
    },
    get lastElement() {
      return element
    },
    get children() {
      return children
    },
    mount() {
      element = renderer.createElement(node.tag)
      updateProps(null, node.props)
      children = createChildrenNode(
        renderer,
        node.id,
        node.children,
        downstream(),
      )
      subscriptions.children = children.mount()

      children.placeIn({
        parent: element,
      })

      return new Subscription(() => {
        remove()
        children = null
        element = null
        ref?.current.next(null)
        subscriptions.children?.unsubscribe()
        subscriptions.ref?.unsubscribe()
        Array.of(
          ...Object.values(subscriptions.events),
          ...Object.values(subscriptions.props),
          ...Object.values(subscriptions.suspensions),
        ).forEach(sub => sub.unsubscribe())
        instance.suspension.complete()
        Object.values(propsSuspensions).map(suspension => suspension.complete())
        propsSuspensions = {}
      })
    },
    update(nextNode) {
      assert(
        children,
        "element children node must not be null while updating element!",
      )
      updateProps(node.props, nextNode.props)
      children.update(nextNode.children)
    },
    placeIn,
    remove,
  }

  /**
   * @param {Record<string, unknown> | null} current
   * @param {Record<string, unknown> | null} next
   */
  function updateProps(current, next) {
    if (current === null && next === null) return
    const changedProps = shallowDiff(current ?? {}, next ?? {})
    const { props, events } = renderer.determinePropsAndEvents(changedProps)
    for (const name of props) {
      const value = next?.[name] ?? null
      if (name === "ref") {
        if (isRef(value)) {
          ref?.current.complete()
          subscriptions.ref?.unsubscribe()
          subscriptions.ref = null
          ref = value
          value.current.next(element)
        } else if (isObservable(value)) {
          ref?.current.complete()
          subscriptions.ref?.unsubscribe()
          subscriptions.ref = value.subscribe(value => {
            assert(
              isRef(value),
              "element ref prop must be instance of Ref or its observable must emit refs",
            )
            ref = value
            value.current.next(element)
          })
        }
        continue
      }
      if (isObservableDelegate(value)) {
        propsSuspensions[name] ??= instance.suspension.downstream()
        const suspension = propsSuspensions[name]
        subscriptions.suspensions[name]?.unsubscribe()
        subscriptions.suspensions[name] = pending(value).subscribe(pending =>
          pending ? suspension.suspend() : suspension.resume(),
        )
      }
      if (isObservable(value)) {
        observables[name] ??= new BehaviorSubject(value)
        if (subscriptions.props[name]) {
          observables[name].next(value)
        }
        subscriptions.props[name] ??= observables[name]
          .pipe(switchMap(source => source))
          .subscribe(value => {
            assert(element, "element should not be null when setting props")
            renderer.setProperty(element, name, value)
          })
        continue
      }
      if (observables[name] && subscriptions.props[name]) {
        delete observables[name]
        subscriptions.props[name].unsubscribe()
        delete subscriptions.props[name]
      }
      assert(element, "element should not be null when setting props")
      renderer.setProperty(element, name, value)
    }
    for (const name of events) {
      const value = next?.[name]
      if (isObservable(value)) {
        listeners[name] = (...args) =>
          value.pipe(take(1)).subscribe(value => {
            if (typeof value === "function") value(...args)
          })
      } else if (typeof value === "function") {
        listeners[name] = /** @type {() => void} */ (value)
      } else if (listeners[name]) {
        delete listeners[name]
      }

      if (listeners[name] && !subscriptions.events[name]) {
        assert(element, "element should not be null when attaching listeners")
        subscriptions.events[name] = new Subscription(
          renderer.listen(element, name, (...args) =>
            listeners[name]?.(...args),
          ),
        )
      } else if (!listeners[name] && subscriptions.events[name]) {
        subscriptions.events[name].unsubscribe()
        delete subscriptions.events[name]
      }
    }
  }

  /**
   * @param {ElementPosition<T, E>} position
   */
  function placeIn(position) {
    if (placed && position === currentPosition) return
    assert(element, "text node element must not be null when placing it in DOM")
    renderer.place(element, position)
    currentPosition = position
    placed = true
  }

  function remove() {
    if (!placed) return
    assert(element, "element must not be null while removing it from DOM!")
    assert(
      currentPosition,
      "element current position must not be null removing it from DOM!",
    )
    renderer.remove(element, currentPosition.parent)
    placed = false
  }

  function downstream() {
    return {
      ...instance,
      suspension: instance.suspension.downstream(),
    }
  }
}

/**
 * @template T
 * @template E
 * @param {IRenderer<T, E>} renderer
 * @param {IRenderFragmentNode} node
 * @param {ComponentInstance} instance
 * @returns {VNodeWithChildren<T, E, IRenderFragmentNode>}
 */
function createFragmentNode(renderer, node, instance) {
  /** @type {VChildren<T, E> | null} */
  let children = null

  return {
    type: VDOMType.FRAGMENT,
    key: node.key ?? null,
    get placed() {
      return children?.placed ?? false
    },
    get children() {
      return children
    },
    get lastElement() {
      return children?.lastElement ?? null
    },
    mount() {
      children = createChildrenNode(renderer, node.id, node.children, instance)
      return children.mount()
    },
    update(nextNode) {
      assert(children, "children must not be null while updating fragment node")
      children.update(nextNode.children)
    },
    placeIn(position) {
      assert(
        children,
        "children must not be null while placing its elements into DOM!",
      )
      children.placeIn(position)
    },
    remove() {
      assert(
        children,
        "children must not be null while removing its elements from DOM!",
      )
      children.remove()
    },
  }
}

/**
 * @template T
 * @template E
 * @param {IRenderer<T, E>} renderer
 * @param {string} parentId
 * @param {ElementNode} render
 * @param {ComponentInstance} instance
 * @param {'indexAsDefaultKey' | 'noDefaultKey'} [defaultKey="noDefaultKey"]
 * @returns {VChildren<T, E>}
 */
function createChildrenNode(
  renderer,
  parentId,
  render,
  instance,
  defaultKey = "noDefaultKey",
) {
  /** @type {Record<string, Subscription>} */
  const subscriptions = {}

  /** @type {Record<string, VNode<T, E>>} */
  let nodes = {}

  /** @type {VNode<T, E>[]} */
  let positions = []

  /** @type {ElementPosition<T, E> | null} */
  let firstPosition = null

  /** @type {ElementNode[]} */
  let children = []

  let placed = false

  return {
    type: VDOMType.CHILDREN,
    key: null,
    get placed() {
      return placed
    },
    get nodes() {
      return nodes
    },
    get lastElement() {
      return positions.at(-1)?.lastElement ?? null
    },
    mount() {
      children = asArray(render)
      for (let index = 0; index < children.length; index++) {
        const child = children[index]
        const id = genId(parentId, child, defaultKey, index)
        const node = createNode(renderer, id, child, downstream())
        nodes = { ...nodes, [id]: node }
        subscriptions[id] = node.mount()
      }
      return new Subscription(() => {
        nodes = {}
        Object.values(subscriptions).forEach(sub => sub.unsubscribe())
        instance.suspension.complete()
      })
    },
    update(nextRender) {
      assert(
        firstPosition,
        "children node first element position must not be null while updating!",
      )
      let currentPosition = firstPosition
      const nextChildren = asArray(nextRender)

      /** @type {Set<string>} */
      const nextIds = new Set()
      nextChildren.forEach(node =>
        nextIds.add(genId(parentId, node, defaultKey)),
      )

      positions = []

      for (let n = 0, p = 0; n < nextChildren.length || p < children.length; ) {
        const next = nextChildren[n]
        const current = children[p]
        const nextId = genId(parentId, next, defaultKey, n)
        const currentId = genId(parentId, current, defaultKey, p)
        const node = nodes[currentId]
        assert(
          node,
          `There must be a vdom node to the current render node id. Missing node id: ${currentId}`,
        )
        if (currentId === nextId) {
          node.update(next)
          positions.push(node)
          currentPosition = nextPosition(currentPosition, n)
          n++
          p++
          continue
        }
        if (!nodes[nextId]) {
          // ids don't match, because the next node does not exist yet.
          const newNode = createNode(renderer, nextId, next, downstream())
          nodes = { ...nodes, [nextId]: newNode }
          subscriptions[nextId] = newNode.mount()
          newNode.placeIn(currentPosition)
          positions.push(newNode)
          currentPosition = nextPosition(currentPosition, n)
          n++
          continue
        }
        if (!nextIds.has(currentId)) {
          // ids don't match, the current node does not exist on next render
          assert(
            subscriptions[currentId],
            "the existing node must have a subscription!",
          )

          subscriptions[currentId].unsubscribe()
          delete nodes[currentId]
          delete subscriptions[currentId]
          p++
          continue
        }
        // ids don't match, both current and next render nodes exists, they need to be swapped.
        nodes[currentId].remove()
        nodes[nextId].placeIn(currentPosition)
        positions.push(nodes[nextId])
        currentPosition = nextPosition(currentPosition, n)
        n++
        p++
      }
      children = nextChildren
    },
    placeIn(position) {
      if (placed && position === firstPosition) return
      assert(
        children,
        "children must not be null while placing elements into DOM!",
      )
      firstPosition = position
      let currentPosition = firstPosition
      positions = []
      for (let index = 0; index < children.length; index++) {
        const child = children[index]
        const id = genId(parentId, child, defaultKey, index)
        const node = nodes[id]
        assert(
          node,
          `there must exist a VDOM node to the children node with id ${id}`,
        )
        positions.push(node)
        node.placeIn(currentPosition)
        currentPosition = nextPosition(currentPosition, index)
      }
      placed = true
    },
    remove() {
      if (!placed) return
      assert(
        children,
        "children must not be null while placing elements into DOM!",
      )
      for (let index = 0; index < children.length; index++) {
        const child = children[index]
        const id = genId(parentId, child, defaultKey, index)
        const node = nodes[id]
        assert(
          node,
          `there must exist a VDOM node to the children node with id ${id}`,
        )
        node.remove()
      }
      placed = false
    },
  }

  /**
   * @param {ElementPosition<T, E>} currentPosition
   * @param {number} index
   * @returns {ElementPosition<T, E>}
   */
  function nextPosition(currentPosition, index) {
    return {
      ...currentPosition,
      get lastElement() {
        return positions[index]?.lastElement ?? undefined
      },
    }
  }

  function downstream() {
    return {
      ...instance,
      suspension: instance.suspension.downstream(),
    }
  }
}

/**
 * @template T
 * @template E
 * @param {IRenderer<T, E>} renderer
 * @param {string} parentId
 * @param {Observable<ElementNode>} input$
 * @param {ComponentInstance} instance
 * @returns {VNodeObservable<T, E>}
 */
function createObservableNode(renderer, parentId, input$, instance) {
  /** @type {string | null} */
  let id = null
  /** @type {VNode<T, E> | null} */
  let latest = null
  /** @type {Subscription | null} */
  let latestSubscription = null

  const subject$ = new BehaviorSubject(input$)
  const source$ = subject$.pipe(
    switchMap(input$ => input$),
    distinctUntilChanged(),
  )
  const selfPending$ = new BehaviorSubject(true)
  const inputPending$ = subject$.pipe(switchMap(input$ => pending(input$)))
  const pending$ = combineLatest([selfPending$, inputPending$]).pipe(
    map(pendings => pendings.some(pending => pending)),
    distinctUntilChanged(),
  )

  /** @type {Subject<VNode<T, E> | null>} */
  const latest$ = new Subject()
  /** @type {Subject<ElementPosition<T, E>>} */
  const position$ = new Subject()
  const placement$ = combineLatest({
    node: latest$,
    position: position$,
  }).pipe(
    distinctUntilChanged(
      (a, b) => a.node === b.node && a.position === b.position,
    ),
  )

  let placed = false

  return {
    type: VDOMType.OBSERVABLE,
    get placed() {
      return placed
    },
    get name() {
      return latest?.name
    },
    get key() {
      return latest?.key ?? null
    },
    get latest() {
      return latest
    },
    get lastElement() {
      return latest?.lastElement ?? null
    },
    mount() {
      const subscription = new Subscription()
      subscription.add(
        placement$.subscribe(({ node, position }) => {
          if (node === latest) return
          latest?.remove()
          node?.placeIn(position)
          latest = node
        }),
      )
      subscription.add(
        pending$.subscribe(isPending => {
          if (isPending) return instance.suspension.suspend()
          return instance.suspension.resume()
        }),
      )
      subscription.add(
        source$.subscribe(node => {
          if (latest === null) {
            id = genId(parentId, node, "noDefaultKey")
            const content = createNode(renderer, id, node, downstream())
            latestSubscription = content.mount()
            subscription.add(latestSubscription)
            selfPending$.next(false)
            latest$.next(content)
            return
          }
          const nextId = genId(parentId, node, "noDefaultKey")
          if (nextId !== id) {
            assert(
              latestSubscription,
              "observable node's latest render subscription must not be null when replacing vdom nodes",
            )
            id = nextId
            subscription.remove(latestSubscription)
            latestSubscription.unsubscribe()
            const content = createNode(renderer, id, node, downstream())
            latestSubscription = content.mount()
            latest$.next(content)
            subscription.add(latestSubscription)
            return
          }
          latest?.update(node)
        }),
      )

      subscription.add(() => {
        instance.suspension.complete()
      })

      return subscription
    },
    update(next) {
      subject$.next(next)
    },
    placeIn(position) {
      position$.next(position)
    },
    remove() {
      if (!placed) return
      latest?.remove()
      placed = false
    },
  }

  function downstream() {
    return {
      ...instance,
      suspension: instance.suspension.downstream(),
    }
  }
}

/**
 * @template T
 * @template E
 * @param {IRenderer<T, E>} renderer
 * @param {IRenderComponentNode} node
 * @param {ComponentInstance} instance
 * @returns {VNodeComponent<T, E>}
 */
function createComponentNode(renderer, node, instance) {
  /** @type {VNode<T, E> | null} */
  let content = null
  const props$ = new BehaviorSubject(node.props)
  const input = new Input(props$, instance)
  /** @type {Subscription | null} */
  let subscription = null
  /** @type {ElementPosition<T, E> | null} */
  let currentPosition = null

  let placed = false

  return {
    key: node.key ?? null,
    type: VDOMType.COMPONENT,
    get placed() {
      return placed
    },
    get name() {
      return node.name
    },
    get content() {
      return content
    },
    get lastElement() {
      return content?.lastElement ?? null
    },
    mount() {
      const render = node.component(input)

      content = createNode(renderer, node.id, render, downstream())

      subscription = content.mount()

      return new Subscription(() => {
        subscription?.unsubscribe()
        props$.complete()
        input.subscription.unsubscribe()
      })
    },
    update(nextNode) {
      assert(
        currentPosition,
        "component current position must not be null at update stage",
      )
      assert(
        subscription,
        "component subscription must not be null at update stage",
      )
      if (node.component !== nextNode.component) {
        subscription.unsubscribe()

        props$.next(nextNode.props)

        const render = nextNode.component(input)

        content = createNode(renderer, nextNode.id, render, downstream())

        subscription = content.mount()

        content.placeIn(currentPosition)

        return
      }
      node = nextNode

      props$.next(nextNode.props)
    },
    placeIn(position) {
      if (placed && position === currentPosition) return
      assert(
        content,
        "component node vdom content must not be null while placing elements into DOM!",
      )
      content.placeIn(position)
      currentPosition = position
      placed = true
    },
    remove() {
      if (!placed) return
      assert(
        content,
        "component node vdom content must not be null while remove elements from DOM!",
      )
      content.remove()
      placed = false
    },
  }

  /**
   * @returns {ComponentInstance}
   */
  function downstream() {
    assert(
      instance.context instanceof ContextMap,
      "component instance.context must be instance of ContextMap!",
    )
    return {
      suspension: instance.suspension,
      context: instance.context.downstream(),
    }
  }
}

/**
 * @template T
 * @template E
 * @param {IRenderer<T, E>} renderer
 * @param {IRenderSuspenseNode} node
 * @param {ComponentInstance} instance
 * @returns {VNode<T, E, IRenderSuspenseNode>}
 */
function createSuspenseNode(renderer, node, instance) {
  /** @type {VNode<T, E> | null} */
  let children = null
  /** @type {VNode<T, E> | null} */
  let fallback = null
  /** @type {VNode<T, E> | null} */
  let current = null

  const context = createSuspensionContext()

  /** @type {Subject<VNode<T, E> | null>} */
  const node$ = new Subject()
  /** @type {Subject<ElementPosition<T, E>>} */
  const position$ = new Subject()
  const source$ = combineLatest({
    node: node$,
    position: position$,
  }).pipe(
    distinctUntilChanged(
      (a, b) => a.node === b.node && a.position === b.position,
    ),
  )

  return {
    type: VDOMType.SUSPENSE,
    get name() {
      return current?.name
    },
    get placed() {
      return current?.placed ?? false
    },
    get key() {
      return node.key ?? null
    },
    get lastElement() {
      return current?.lastElement ?? null
    },

    mount() {
      const subscription = new Subscription()
      subscription.add(
        source$
          .pipe(
            distinctUntilChanged(
              (a, b) => a.node === b.node && a.position === b.position,
            ),
          )
          .subscribe(({ node, position }) => {
            if (node === current) return
            current?.remove()
            current = null
            if (node) {
              current = node
              current.placeIn(position)
            }
          }),
      )
      fallback = createNode(renderer, node.id, node.fallback, instance)
      children = createNode(
        renderer,
        node.id,
        node.children,
        downstream(context),
      )
      subscription.add(fallback.mount())
      subscription.add(children.mount())
      subscription.add(() => {
        current = null
        fallback = null
        children = null
      })
      subscription.add(
        context.suspended$.pipe(distinctUntilChanged()).subscribe(suspended => {
          assert(
            fallback,
            "suspense node's fallback VDOM must not be null on suspend event",
          )
          assert(
            children,
            "suspense node's children VDOM must not be null on suspend event",
          )
          const next = suspended ? fallback : children
          node$.next(next)
        }),
      )
      return subscription
    },
    update(nextNode) {
      assert(
        fallback,
        "suspense node's fallback VDOM must not be null when updating",
      )
      assert(
        children,
        "suspense node's children VDOM must not be null when updating",
      )
      fallback.update(nextNode.fallback)
      children.update(nextNode.children)
    },
    placeIn(position) {
      position$.next(position)
    },
    remove() {
      node$.next(null)
    },
  }

  /**
   * @param {SuspensionContext} context
   */
  function downstream(context) {
    return {
      ...instance,
      suspension: context.downstream(),
    }
  }
}

/**
 * @param {string} parentId
 * @param {ElementNode} node
 * @param {'indexAsDefaultKey' | 'noDefaultKey'} defaultKey
 * @param {number} [index]
 */
function genId(parentId, node, defaultKey, index) {
  const id = isRenderNode(node) ? node.id : `${parentId}:inline`
  const key = isRenderNode(node)
    ? (node.key ?? (defaultKey === "indexAsDefaultKey" ? index : null))
    : index
  if (key === undefined) return id
  return `${id}:${key}`
}

/**
 * @returns {SuspensionContext}
 */
function createSuspensionContext() {
  /** @type {Set<symbol>} */
  const symbols = new Set()
  const control$ = new BehaviorSubject(symbols)

  return {
    suspended$: control$.pipe(
      map(suspensions => suspensions.size > 0),
      debounceTime(1),
      distinctUntilChanged(),
    ),
    downstream,
    complete() {
      symbols.clear()
      control$.complete()
    },
  }

  function downstream() {
    const symbol = Symbol()
    return {
      suspend() {
        symbols.add(symbol)
        control$.next(symbols)
      },
      resume() {
        symbols.delete(symbol)
        control$.next(symbols)
      },
      complete() {
        symbols.delete(symbol)
        control$.next(symbols)
      },
      downstream,
    }
  }
}
