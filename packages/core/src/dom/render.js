/**
 * @import { Logger } from "../logger.js"
 */

import { BatchRenderer } from "../vdom/batch-renderer.js"
import { createRoot as createAbstractRoot } from "../vdom/vdom.js"
import { DOMRenderer } from "./renderer.js"

/**
 * @param {Element | null | undefined} element
 * @param {Object} [options]
 * @param {number} [options.batchTime]
 * @param {Logger} [options.logger]
 */
export function createRoot(element, { batchTime = 10, logger } = {}) {
  const renderer = new DOMRenderer()
  if (batchTime <= 0) return createAbstractRoot(renderer, element)
  return createAbstractRoot(
    new BatchRenderer(renderer, batchTime, { logger }),
    element,
  )
}
