/**
 * @import { ElementNode } from "./jsx.js"
 */

import { assert } from "@jsxrx/utils"
import { ContextMap } from "./context.js"
import { DOMRenderer } from "./dom/renderer.js"
import { toRenderNode } from "./vdom/render.js"
import { createVDOMNode } from "./vdom/vdom.js"

/**
 * @param {ElementNode} element
 * @param {*} target 
 * @returns {import("./vdom/types.js").IVDOMNode<Text, Element>}
 */
export function render(element, target) {
  assert(target !== null, "The target dom element must not be null")

  const node = toRenderNode(element)

  assert(node !== null, "The root VDOM Element must not be null")

  return createVDOMNode(
    new DOMRenderer(),
    node,
    { parent: target },
    { context: new ContextMap() }
  )
}

