/**
 * @import { Observable } from "rxjs"
 * @import { ComponentInstance, ElementNode, ElementPlacement, IRenderElementNode, IRenderer } from "../jsx.js"
 */

import { assert, shallowDiff } from "@jsxrx/utils"
import {
  BehaviorSubject,
  isObservable,
  Subscription,
  withLatestFrom,
} from "rxjs"
import { isRenderNode } from "./render.js"
import { VDOMType } from "../constants/vdom.js"

/**
 * @template T
 * @template E
 * @param {IRenderer<T, E>} renderer
 * @param {E | null | undefined} element
 *
 */
export function createRoot(renderer, element) {
  assert(element, "Root element must not be null")

  return {
    /**
     * @param {ElementNode} node
     */
    mount(node) {
      const rootNode = createNode(renderer, node)
      return rootNode.mount({ parent: element })
    },
  }
}

/**
 * @template T
 * @template E
 * @param {IRenderer<T, E>} renderer
 * @param {ElementNode} node
 */
function createNode(renderer, node) {
  if (node === null || node === undefined) {
    // TODO: it is really possible that just returning null will be better
    return {
      mount() {
        return new Subscription()
      },
    }
  }
  if (isRenderNode(node)) {
    switch (node.type) {
      case VDOMType.ELEMENT:
        return createElementNode(renderer, node)
      default:
        throw new Error(
          `Render nodes of type ${node.type} are not implemented yet`,
        )
    }
  }
  if (isObservable(node))
    throw new Error("Observables nodes are not implemented yet")
  if (Array.isArray(node))
    throw new Error("Array nodes are not implemented yet")
  return createTextNode(renderer, node)
}

/**
 * @template T
 * @template E
 * @param {IRenderer<T, E>} renderer
 * @param {string | number | bigint | boolean} value
 */
function createTextNode(renderer, value) {
  return {
    /**
     * @param {ElementPlacement<T, E>} placement
     */
    mount(placement) {
      const node = renderer.createTextNode(String(value))
      renderer.place(node, placement)
      return new Subscription(() => {
        renderer.remove(node, placement.parent)
      })
    },
  }
}

/**
 * @template T
 * @template E
 * @param {IRenderer<T, E>} renderer
 * @param {IRenderElementNode} node
 */
function createElementNode(renderer, node) {
  /** @type {E | null} */
  let element = null
  /** @type {{ events: Record<string, Subscription>, props: Record<string, Subscription> }} */
  let subscriptions = {
    events: {},
    props: {},
  }
  /** @type {Record<string, BehaviorSubject<Observable<unknown>>>} */
  let observables = {}
  /** @type {Record<string, () => void>} */
  let listeners = {}
  return {
    /**
     * @param {ElementPlacement<T, E>} placement
     */
    mount(placement) {
      element = renderer.createElement(node.tag)
      setProps(null, node.props)
      renderer.place(element, placement)
      return new Subscription(() => {
        assert(element, "element must not be null while unsubscribing!")
        renderer.remove(element, placement.parent)
        element = null
        Array.of(
          ...Object.values(subscriptions.events),
          ...Object.values(subscriptions.props),
        ).forEach(sub => sub.unsubscribe())
      })
    },
  }

  /**
   * @param {Record<string, unknown> | null} current
   * @param {Record<string, unknown> | null} next
   */
  function setProps(current, next) {
    if (current === null && next === null) return
    const changedProps = shallowDiff(current ?? {}, next ?? {})
    const { props, events } = renderer.determinePropsAndEvents(changedProps)
    for (const name of props) {
      const value = next?.[name] ?? null
      if (isObservable(value)) {
        observables[name] ??= new BehaviorSubject(value)
        subscriptions.props[name] ??= observables[name].subscribe(value => {
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
      if (typeof value === "function") {
        listeners[name] = /** @type {() => void} */ (value)
        if (!subscriptions.events[name]) {
          assert(element, "element should not be null when attaching listeners")
          subscriptions.events[name] = new Subscription(
            renderer.listen(element, name, (...args) =>
              listeners[name]?.(...args),
            ),
          )
        }
      } else if (listeners[name] && subscriptions.events[name]) {
        delete listeners[name]
        subscriptions.events[name].unsubscribe()
        delete subscriptions.events[name]
      }
    }
  }
}
