import { DOMRenderer } from "@jsxrx/core/dom"
import { BatchRenderer, createRoot } from "@jsxrx/core/renderer"
import { screen } from "@testing-library/dom"
import { lastValueFrom, Subject, Subscription, take, timer } from "rxjs"

let globalSubscription = new Subscription()

const renderer = new BatchRenderer(new DOMRenderer(), 10)

const flush$ = new Subject()

renderer.subscribe(flush$)

/**
 * @param {import('@jsxrx/core').ElementNode} node
 * @param {import("./types.js").RenderOptions} [options={}]
 */
export function render(node, { container, root } = {}) {
  container ??= document.createElement("div")
  root ??= document.body

  const rootNode = createRoot(renderer, container)

  const subscription = rootNode.mount(node)

  subscription.add(() => globalSubscription.remove(subscription))
  subscription.add(() => root.removeChild(container))

  globalSubscription.add(subscription)

  root.appendChild(container)

  return {
    ...screen,
    root,
    container,
    subscription,
    unmount() {
      subscription.unsubscribe()
    },
  }
}

/**
 * @param {() => Promise<void>} fn
 */
export async function act(fn) {
  const flush = lastValueFrom(flush$.pipe(take(1)))
  await fn()
  await flush
}

export function waitForNextBatchCompleted() {
  return lastValueFrom(flush$.pipe(take(1)))
}

/**
 * @param {number} time
 */
export function wait(time) {
  return lastValueFrom(timer(time))
}

export async function cleanup() {
  globalSubscription.unsubscribe()
  await waitForNextBatchCompleted()
  globalSubscription = new Subscription()
}
