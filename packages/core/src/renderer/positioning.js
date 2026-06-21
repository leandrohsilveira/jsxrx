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
  return {
    ...position,
    get lastElement() {
      let current = position
      do {
        let lastElement = current.lastElement

        if (lastElement && renderer.hasChild(current.parent, lastElement))
          return lastElement

        if (current.previous) current = current.previous
      } while (current.previous)
      return undefined
    },
  }
}
