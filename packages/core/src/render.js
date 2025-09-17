/**
 * @import { Subscription } from "rxjs"
 * @import { IRenderNode } from "./types.js"
 */

import { of } from "rxjs"
import { VDOMType } from "./constants/vdom.js"
import { DOMRenderer } from "./dom/renderer.js"
import { assert } from "./util/assert.js"
import { createVDOMNode } from "./vdom/vdom.js"

/**
 * @param {IRenderNode | null} node
 * @param {Element} target 
 * @returns {Subscription}
 */
export function render(node, target) {
  assert(target !== null, "Root dom element must not be null")

  const node$ = of(node)

  const vdom = createVDOMNode(
    new DOMRenderer(),
    node?.type ?? VDOMType.COMPONENT,
    node$
  )

  return vdom.subscribe({ parent: target })
}

