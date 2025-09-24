/**
 * @import { Component, IRenderComponentNode, IRenderElementNode, IRenderTextNode, Obj, IRenderNode, Element, IRenderFragmentNode } from "../jsx"
 */

import { VDOMType } from "../constants/vdom.js"

/**
 * @template {Obj} P
 * @template {keyof import("../jsx-runtime.js").JSX.IntrinsicElements} T
 * @param {string} id 
 * @param {Component<P>} input 
 * @param {P | null} props 
 * @param {...(Element | null)} children 
 */
/**
 * @template {Obj} P
 * @template {keyof import("../jsx-runtime.js").JSX.IntrinsicElements} T
 * @param {string} id 
 * @param {T} input 
 * @param {import("../jsx-runtime.js").JSX.IntrinsicElements[T] | null} props 
 * @param {...(Element | null)} children 
 */
/**
 * @template {Obj} P
 * @template {keyof import("../jsx-runtime.js").JSX.IntrinsicElements} T
 * @param {string} id 
 * @param {T | Component<P>} input 
 * @param {*} props 
 * @param {...(Element | null)} children 
 */
export function _jsx(id, input, props, ...children) {
  if (typeof input === 'string') return new RenderElementNode(id, input, props, ...children.map(toRenderNode))
  return new RenderComponentNode(id, input, props)
}

/**
 * @param {string} id 
 * @param {...(Element | null)} children 
 */
export function _fragment(id, ...children) {
  return new RenderFragmentNode(id, ...children.map(toRenderNode))
}

/**
 * @param {unknown} value 
 * @returns {value is IRenderNode}
 */
export function isRenderNode(value) {
  return value instanceof RenderTextNode || value instanceof RenderElementNode || value instanceof RenderComponentNode || value instanceof RenderFragmentNode
}

/**
 * @overload
 * @param {Element} value
 * @param {number | string} [index=0] 
 * @returns {IRenderNode}
 */
/**
 * @overload
 * @param {Element | null} value
 * @param {number | string} [index=0] 
 * @returns {IRenderNode | null}
 */
/**
 * @param {Element | null} value
 * @param {number | string} [index=0] 
 * @returns {IRenderNode | null}
 */
export function toRenderNode(value, index = 0) {
  if (value === null) return null
  return isRenderNode(value) ? value : RenderTextNode.of(value, index)
}

/**
 * @class
 * @implements {IRenderTextNode}
 */
export class RenderTextNode {

  /**
   * @constructor
   * @param {string} id 
   * @param {string} text 
   */
  constructor(id, text) {
    this.id = id
    this.text = text
  }

  type = VDOMType.TEXT

  /**
   * @static
   * @param {string | number | boolean} value
   * @param {number | string} [index=0] 
   */
  static of(value, index = 0) {
    return new RenderTextNode(`${index}:text`, String(value))
  }
}

/**
 * @class
 * @template {keyof import("../jsx-runtime.js").JSX.IntrinsicElements} T
 * @implements {IRenderElementNode<T>}
 */
export class RenderElementNode {

  /**
   * @constructor
   * @param {string} id 
   * @param {T} tag 
   * @param {import("../jsx-runtime.js").JSX.IntrinsicElements[T] | null} props
   * @param {...(IRenderNode | null)} children 
   */
  constructor(id, tag, props, ...children) {
    this.id = id
    this.tag = tag
    this.props = /** @type {import("../jsx-runtime.js").JSX.IntrinsicElements[T]} */(props ?? {})
    this.children = Object.fromEntries(
      children.filter(child => child !== null).map(child => [child.id, child])
    )
  }

  type = VDOMType.ELEMENT
}

/**
 * @class
 * @template {Obj} P
 * @implements {IRenderComponentNode<P>}
 */
export class RenderComponentNode {

  /**
   * @param {string} id 
   * @param {Component<P>} component 
   * @param {P | null} props 
   */
  constructor(id, component, props) {
    this.id = id
    this.component = component
    this.props = /** @type {P} */(props ?? {})
    this.name = component.displayName ?? 'anonymous'
  }

  type = VDOMType.COMPONENT
}

/**
 * @class
 * @implements {IRenderFragmentNode}
 */
export class RenderFragmentNode {

  /**
   * @param {string} id 
   * @param {...(IRenderNode | null)} children 
   */
  constructor(id, ...children) {
    this.id = id
    this.children = Object.fromEntries(
      children.filter(child => child !== null).map(child => [child.id, child])
    )
  }

  type = VDOMType.FRAGMENT
}
