/**
 * @import { Obj, IRenderer, ElementPlacement } from "../jsx.js"
 */

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
    /** @type {*} */(element)[name] = value
  }

  /**
   * @param {Element} element 
   * @param {string} name 
   * @param {() => void} listener 
   * @returns {() => void}
   */
  listen(element, name, listener) {
    const eventName = name.replace(/^on/, '').toLowerCase()
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
      { props: /** @type {string[]} */([]), events: /** @type {string[]} */([]) }
    )
  }

  /**
   * @param {Text | Element} node 
   * @param {ElementPlacement<Text, Element>} placement
   */
  place(node, placement) {
    const parent = placement.parent
    const previous = placement.previous?.()
    if (previous && parent.contains(previous)) {
      return previous.after(node)
    }
    const next = placement.next?.()
    if (next && parent.contains(next)) {
      return next.before(node)
    }
    return parent.prepend(node)
  }

  /**
   * @param {Text | Element} node 
   * @param {Element} target 
   */
  remove(node, target) {
    target.removeChild(node)
  }
}
