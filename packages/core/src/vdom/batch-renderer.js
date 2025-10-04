/**
 * @import { ElementPosition, IRenderer } from "../jsx.js"
 * @import { VRenderEvent } from "./types.js"
 * @import { Subject } from "rxjs"
 */

import { VRenderEventType } from "../constants/render.js"

/**
 * @template T
 * @template E
 * @implements {IRenderer<T, E>}
 */
export class BatchRenderer {
  /**
   * @param {IRenderer<T, E>} renderer
   * @param {Subject<VRenderEvent<T, E>>} publisher$
   */
  constructor(renderer, publisher$) {
    this.#renderer = renderer
    this.#publisher$ = publisher$
  }

  #renderer
  #publisher$

  /**
   * @param {string} text
   */
  createTextNode(text) {
    return this.#renderer.createTextNode(text)
  }
  /**
   * @param {string} tag
   */
  createElement(tag) {
    return this.#renderer.createElement(tag)
  }

  /**
   * @param {string} text
   * @param {T} node
   */
  setText(text, node) {
    return this.#renderer.setText(text, node)
  }

  /**
   * @param {E} element
   * @param {string} name
   * @param {unknown} value
   */
  setProperty(element, name, value) {
    return this.#renderer.setProperty(element, name, value)
  }

  /**
   * @param {E} element
   * @param {string} name
   * @param {() => void} listener
   */
  listen(element, name, listener) {
    return this.#renderer.listen(element, name, listener)
  }
  /**
   * @param {string[]} names
   */
  determinePropsAndEvents(names) {
    return this.#renderer.determinePropsAndEvents(names)
  }
  /**
   * @param {T | E} node
   * @param {ElementPosition<T, E>} position
   */
  place(node, position) {
    this.#publisher$.next({
      event: VRenderEventType.PLACE,
      payload: node,
      position,
    })
  }

  /**
   * @param {T | E} node
   * @param {E} target
   */
  remove(node, target) {
    this.#publisher$.next({
      event: VRenderEventType.REMOVE,
      payload: node,
      position: {
        parent: target,
      },
    })
  }
}
