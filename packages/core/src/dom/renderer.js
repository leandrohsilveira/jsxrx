/**
 * @import { IRenderer, ElementPlacement } from "../jsx.js"
 */

import { assert } from "@jsxrx/utils"

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
   * @param {ElementPlacement<Text, Element>} placement
   */
  place(node, placement) {
    const parent = placement.parent
    const previous = placement.previous?.()
    if (previous) {
      return previous.after(node)
    }
    return parent.prepend(node)
  }

  /**
   * @param {Text | Element} node
   * @param {Element} parent
   * @returns {ElementPlacement<Text, Element>}
   */
  getPlacement(node, parent) {
    assert(
      node.parentElement ?? parent,
      `Node ${node} should have a parent element`,
    )
    return {
      parent: node.parentElement ?? parent,
      next() {
        return /** @type {Text | Element | null} */ (node.nextSibling)
      },
      previous() {
        return /** @type {Text | Element | null} */ (node.previousSibling)
      },
    }
  }

  /**
   * @param {Text | Element} node
   * @param {ElementPlacement<Text, Element>} placement
   */
  move(node, placement) {
    this.remove(node, placement.parent)
    this.place(node, placement)
  }

  /**
   * @param {Text | Element} node
   * @param {Element} parent
   */
  remove(node, parent) {
    if (node.parentNode === parent) parent.removeChild(node)
  }
}
