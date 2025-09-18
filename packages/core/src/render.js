/**
 * @import { Subscription } from "rxjs"
 * @import { Element } from "./jsx.js"
 */

import { of } from "rxjs"
import { VDOMType } from "./constants/vdom.js"
import { DOMRenderer } from "./dom/renderer.js"
import { assert } from "./util/assert.js"
import { createVDOMNode } from "./vdom/vdom.js"
import { toRenderNode } from "./vdom/render.js"

/**
 * @param {Element} element
 * @param {*} target 
 * @returns {Subscription}
 */
export function render(element, target) {
  assert(target !== null, "Root dom element must not be null")

  const node = toRenderNode(element)

  const node$ = of(node)

  const vdom = createVDOMNode(
    new DOMRenderer(),
    node?.type ?? VDOMType.COMPONENT,
    node$
  )

  return vdom.subscribe({ parent: target })
}

