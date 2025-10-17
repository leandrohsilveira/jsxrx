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
  let lastElement = position.lastElement
  while (
    position.previous &&
    (!lastElement || !renderer.hasChild(position.parent, lastElement))
  ) {
    position = position.previous
  }
  return {
    ...position,
    get lastElement() {
      const lastElement = position.lastElement
      if (!lastElement || !renderer.hasChild(position.parent, lastElement))
        return undefined
      return lastElement
    },
  }
}
