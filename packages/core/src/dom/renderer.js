/**
 * @import { IRenderer, ElementPosition } from "../jsx.js"
 */

import { Subscription } from "rxjs"
import { findPreviousLastElement } from "../renderer/positioning.js"

/**
 * @class
 * @implements {IRenderer<Text, Element>}
 */
export class DOMRenderer {
  /**
   * @param {string} text
   */
  createTextNode(text) {
    return document.createTextNode(text)
  }

  /**
   * @param {string} tag
   */
  createElement(tag) {
    return document.createElement(tag)
  }

  /**
   * @param {string} text
   * @param {Text} node
   */
  setText(text, node) {
    node.textContent = text
  }

  /**
   * @param {Element} element
   * @param {string} name
   * @param {unknown} value
   */
  setProperty(element, name, value) {
    const el = /** @type {*} */ (element)
    el[name] = value
  }

  /**
   * @param {Element} element
   * @param {string} name
   * @param {() => void} listener
   * @returns {() => void}
   */
  listen(element, name, listener) {
    const eventName = name.replace(/^on/, "").toLowerCase()
    element.addEventListener(eventName, listener)
    return () => {
      element.removeEventListener(eventName, listener)
    }
  }

  /**
   * @param {string[]} names
   * @returns {{ props: string[], events: string[] }}
   */
  determinePropsAndEvents(names) {
    return names.reduce(
      ({ props, events }, name) => {
        if (/^on.*/.test(name)) return { props, events: [...events, name] }
        return { props: [...props, name], events }
      },
      {
        props: /** @type {string[]} */ ([]),
        events: /** @type {string[]} */ ([]),
      },
    )
  }

  /**
   * @param {Text | Element} node
   * @param {ElementPosition<Text, Element>} position
   */
  place(node, position) {
    const previous = findPreviousLastElement(this, position)
    if (previous.lastElement) {
      return previous.lastElement.after(node)
    }
    return previous.parent.prepend(node)
  }

  /**
   * @param {Text | Element} node
   * @param {ElementPosition<Text, Element>} position
   */
  move(node, position) {
    this.place(node, position)
  }

  /**
   * @param {Text | Element} node
   * @param {Element} parent
   */
  remove(node, parent) {
    if (node.parentNode === parent) parent.removeChild(node)
  }

  /**
   * @param {Text | Element} node
   * @returns {Element | null}
   */
  getParent(node) {
    return node.parentElement
  }

  subscribe() {
    return new Subscription()
  }
}
