/**
 * @import { Element, ElementNode } from "./jsx.js"
 */

import { assert } from "@jsxrx/utils"
import { Subscription } from "rxjs"
import { ContextMap } from "./context.js"
import { DOMRenderer } from "./dom/renderer.js"
import { toRenderNode } from "./vdom/render.js"
import { createVDOMNode } from "./vdom/vdom.js"

/**
 * @param {ElementNode} element
 * @param {*} target 
 * @returns {Promise<Subscription>}
 */
export async function render(element, target) {
  assert(target !== null, "Root dom element must not be null")

  const subscription = new Subscription()

  const node = toRenderNode(element)

  if (node === null) return subscription

  const vdom = createVDOMNode(
    new DOMRenderer(),
    node,
    { parent: target },
    { context: new ContextMap() }
  )

  subscription.add(await vdom.subscribe())

  return subscription
}

