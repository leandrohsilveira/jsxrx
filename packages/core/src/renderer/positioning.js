/**
 * @import { IRenderer, ElementPosition } from "../jsx.js"
 */

/**
 * @template T
 * @template E
 * @param {IRenderer<T, E>} renderer
 * @param {ElementPosition<T, E>} position
 */
export function findPreviousLastElement(renderer, position) {
  let previous = position.lastElement
  while (
    (previous === undefined ||
      renderer.getParent(previous) !== position.parent) &&
    position.previous
  ) {
    position = position.previous
  }
  return position
}
