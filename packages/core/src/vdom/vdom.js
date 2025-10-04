/**
 * @import { Observable } from "rxjs"
 * @import { ComponentInstance, ElementNode, ElementPosition, IRenderComponentNode, IRenderElementNode, IRenderer, IRenderFragmentNode, IRenderSuspenseNode, IRenderText, SuspensionContext, SuspensionController } from "../jsx.js"
 * @import { VChildren, VNode, VNodeComponent, VNodeObservable, VNodeWithChildren, VRenderEvent, VRoot } from "./types.js"
 */

import { asArray, assert, shallowDiff } from "@jsxrx/utils"
import {
  BehaviorSubject,
  bufferTime,
  debounceTime,
  distinctUntilChanged,
  filter,
  isObservable,
  map,
  shareReplay,
  Subject,
  Subscription,
  switchMap,
  take,
} from "rxjs"
import { VDOMType } from "../constants/vdom.js"
import { ContextMap } from "../context.js"
import {
  ElementRef,
  Input,
  isObservableDelegate,
  pending,
} from "../observable.js"
import { isRenderNode } from "./render.js"
import { BatchRenderer } from "./batch-renderer.js"
import { VRenderEventType } from "../constants/render.js"

/**
 * @template T
 * @template E
 * @param {IRenderer<T, E>} renderer
 * @param {E | null | undefined} element
 * @returns {VRoot}
 */
export function createRoot(renderer, element) {
  assert(element, "Root element must not be null")

  /** @type {Subject<VRenderEvent<T, E>>} */
  const publisher$ = new Subject()

  const batch = new BatchRenderer(renderer, publisher$)

  return {
    /**
     * @param {ElementNode} node
     */
    mount(node) {
      const subscription = new Subscription()

      subscription.add(
        publisher$
          .pipe(
            bufferTime(10),
            filter(events => events.length > 0),
          )
          .subscribe(events => {
            console.debug("[Batch] Render Events: BEGIN", events)
            for (const event of events) {
              switch (event.event) {
                case VRenderEventType.PLACE:
                  console.debug(
                    "[BATCH] Render Events: Placing",
                    event.payload,
                    event.position,
                  )
                  renderer.place(event.payload, event.position)
                  break
                case VRenderEventType.REMOVE:
                  console.debug(
                    "[BATCH] Render Events: Removing",
                    event.payload,
                    event.position,
                  )
                  renderer.remove(event.payload, event.position.parent)
                  break
              }
            }
            console.debug("[Batch] Render Events: COMPLETED", events)
          }),
      )

      const rootSuspensionContext = createSuspensionContext()

      const rootNode = createNode(batch, "root", node, {
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
    // TODO: it is really possible that just returning null will be better

    return {
      key: null,
      get firstElement() {
        return null
      },
      get lastElement() {
        return null
      },
      mount() {
        return new Subscription()
      },
      update() {},
      placeIn() {},
      remove() {},
    }
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
    key: null,
    get firstElement() {
      return node
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
  /** @type {{ events: Record<string, Subscription>, props: Record<string, Subscription>, suspensions: Record<string, Subscription>, children: Subscription | null }} */
  let subscriptions = {
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

  return {
    key: node.key ?? null,
    get firstElement() {
      return element
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
        subscriptions.children?.unsubscribe()
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
        if (value instanceof ElementRef) {
          observables[name].complete()
          subscriptions.props[name]?.unsubscribe()
          delete subscriptions.props[name]
          delete observables[name]
          value.set(element)
        } else if (isObservable(value)) {
          observables[name] ??= new BehaviorSubject(value)
          if (subscriptions.props[name]) {
            observables[name].next(value)
          }
          subscriptions.props[name] ??= observables[name]
            .pipe(switchMap(source => source))
            .subscribe(value => {
              assert(element, "element should not be null when setting ref")
              if (value instanceof ElementRef) value.set(element)
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
    key: node.key ?? null,
    get children() {
      return children
    },
    get firstElement() {
      return children?.firstElement ?? null
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

  /** @type {ElementPosition<T, E> | null} */
  let firstPosition = null

  /** @type {T | E | null} */
  let firstElement = null
  /** @type {T | E | null} */
  let lastElement = null

  /** @type {ElementNode[]} */
  let children = []

  let placed = false

  return {
    key: null,
    get nodes() {
      return nodes
    },
    get firstElement() {
      return firstElement
    },
    get lastElement() {
      return lastElement
    },
    mount() {
      children = asArray(render)
      for (let index = 0; index < children.length; index++) {
        const child = children[index]
        const id = genId(parentId, child, defaultKey, index)
        const node = createNode(renderer, id, child, downstream())
        nodes = { ...nodes, [id]: node }
        subscriptions[id] = node.mount()
        if (index === 0) firstElement = node.firstElement
        if (index === children.length - 1) lastElement = node.lastElement
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
          currentPosition = {
            ...currentPosition,
            previous: currentPosition,
            get lastElement() {
              return node.lastElement ?? undefined
            },
          }
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
          currentPosition = {
            ...currentPosition,
            previous: currentPosition,
            get lastElement() {
              return newNode.lastElement ?? undefined
            },
          }
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
        currentPosition = {
          ...currentPosition,
          previous: currentPosition,
          get lastElement() {
            return nodes[nextId].lastElement ?? undefined
          },
        }
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
      for (let index = 0; index < children.length; index++) {
        const child = children[index]
        const id = genId(parentId, child, defaultKey, index)
        const node = nodes[id]
        assert(
          node,
          `there must exist a VDOM node to the children node with id ${id}`,
        )
        node.placeIn(currentPosition)
        currentPosition = {
          ...currentPosition,
          previous: currentPosition,
          get lastElement() {
            return node.lastElement ?? undefined
          },
        }
      }
      placed = true
    },
    remove() {
      if (!placed) return
      assert(
        children,
        "children must not be null while placing elements into DOM!",
      )
      assert(
        firstPosition,
        "children node first element position must not be null when removing elements from DOM!",
      )
      let currentPosition = firstPosition
      for (let index = 0; index < children.length; index++) {
        const child = children[index]
        const id = genId(parentId, child, defaultKey, index)
        const node = nodes[id]
        assert(
          node,
          `there must exist a VDOM node to the children node with id ${id}`,
        )
        node.remove()
        currentPosition = {
          ...currentPosition,
          previous: currentPosition,
          get lastElement() {
            return node.lastElement ?? undefined
          },
        }
      }
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
  /** @type {ElementPosition<T, E> | null} */
  let currentPosition = null

  const subject$ = new BehaviorSubject(input$)
  const source$ = subject$.pipe(
    switchMap(input$ => input$),
    distinctUntilChanged(),
    shareReplay(),
  )
  const pending$ = subject$.pipe(switchMap(input$ => pending(input$)))

  let placed = false

  return {
    get key() {
      return latest?.key ?? null
    },
    get latest() {
      return latest
    },
    get firstElement() {
      return latest?.firstElement ?? null
    },
    get lastElement() {
      return latest?.lastElement ?? null
    },
    mount() {
      const subscription = new Subscription()
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
            latest = createNode(renderer, id, node, downstream())
            latestSubscription = latest.mount()
            subscription.add(latestSubscription)
            return
          }
          const nextId = genId(parentId, node, "noDefaultKey")
          if (nextId !== id) {
            assert(
              currentPosition,
              "observable node's current position must not be null when replacing vdom nodes",
            )
            assert(
              latestSubscription,
              "observable node's latest render subscription must not be null when replacing vdom nodes",
            )
            id = nextId
            subscription.remove(latestSubscription)
            latestSubscription.unsubscribe()
            latest = createNode(renderer, id, node, downstream())
            latestSubscription = latest.mount()
            latest.placeIn(currentPosition)
            subscription.add(latestSubscription)
            return
          }
          latest.update(node)
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
      if (placed && position === currentPosition) return
      placed = true
      source$
        .pipe(
          take(1),
          filter(() => placed),
        )
        .subscribe(() => {
          if (placed && position === currentPosition) return
          assert(
            latest,
            "observable node latest vdom must not be null when placing elements into DOM!",
          )
          currentPosition = position
          latest.placeIn(currentPosition)
        })
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
    get content() {
      return content
    },
    get firstElement() {
      return content?.firstElement ?? null
    },
    get lastElement() {
      return content?.lastElement ?? null
    },
    mount() {
      const render = node.component(input)

      content = createNode(renderer, node.id, render, downstream())

      subscription = content.mount()

      return new Subscription(() => subscription?.unsubscribe())
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
    },
    remove() {
      if (!placed) return
      assert(
        content,
        "component node vdom content must not be null while remove elements from DOM!",
      )
      content.remove()
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
  /** @type {ElementPosition<T, E> | null} */
  let currentPosition = null
  /** @type {VNode<T, E> | null} */
  let fallback = null
  /** @type {VNode<T, E> | null} */
  let current = null

  const context = createSuspensionContext()

  return {
    get key() {
      return node.key ?? null
    },
    get firstElement() {
      return current?.firstElement ?? null
    },
    get lastElement() {
      return current?.lastElement ?? null
    },

    mount() {
      fallback = createNode(renderer, node.id, node.fallback, instance)
      children = createNode(
        renderer,
        node.id,
        node.children,
        downstream(context),
      )
      current = fallback
      const subscription = new Subscription()
      subscription.add(fallback.mount())
      subscription.add(children.mount())
      subscription.add(() => {
        current = null
        fallback = null
        children = null
      })
      subscription.add(
        context.suspended$
          .pipe(distinctUntilChanged(), debounceTime(10))
          .subscribe(suspended => {
            assert(
              fallback,
              "suspense node's fallback VDOM must not be null on suspend event",
            )
            assert(
              children,
              "suspense node's children VDOM must not be null on suspend event",
            )
            if (current) current.remove()
            if (suspended) current = fallback
            else current = children
            if (currentPosition) current.placeIn(currentPosition)
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
      assert(
        current,
        "suspense current vdom node must not be null when updating",
      )
      currentPosition = position
      current.placeIn(position)
    },
    remove() {
      assert(current, "current vdom node must not be null")
      current.remove()
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
