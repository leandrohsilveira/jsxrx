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
    /** @type {*} */ ;(element)[name] = value
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
  async place(node, placement) {
    const parent = placement.parent
    const previous = await placement.previous?.()
    if (previous) {
      console.debug(`Renderer.place => afterTarget`, { node, target: previous })
      return previous.after(node)
    }
    const next = await placement.next?.()
    if (next) {
      console.debug(`Renderer.place => beforeTarget`, { node, target: next })
      return next.before(node)
    }

    console.debug(`Renderer.place => parent => prepentChild`, {
      node,
      target: parent,
    })
    return parent.prepend(node)
  }

  /**
   * @param {Text | Element} node
   * @returns {ElementPlacement<Text, Element>}
   */
  getPlacement(node) {
    assert(node.parentElement, "Node should have a parent element")
    return {
      parent: node.parentElement,
      async next() {
        return /** @type {Text | Element | null} */ (node.nextSibling)
      },
      async previous() {
        return /** @type {Text | Element | null} */ (node.previousSibling)
      },
    }
  }

  /**
   * @param {Text | Element} node
   * @param {ElementPlacement<Text, Element>} placement
   */
  async move(node, placement) {
    this.remove(node, placement.parent)
    await this.place(node, placement)
    console.debug(`Renderer.move => elementMoved`, { node, placement })
  }

  /**
   * @param {Text | Element} node
   * @param {Element} parent
   */
  remove(node, parent) {
    parent.removeChild(node)
  }
}
