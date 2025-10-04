import { createRoot as createAbstractRoot } from "../vdom/vdom.js"
import { DOMRenderer } from "./renderer.js"

/**
 * @param {Element | null | undefined} element
 */
export function createRoot(element) {
  return createAbstractRoot(new DOMRenderer(), element)
}
