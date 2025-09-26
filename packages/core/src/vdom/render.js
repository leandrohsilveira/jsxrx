/**
 * @import { Component, IRenderComponentNode, IRenderElementNode, IRenderTextNode, Obj, IRenderNode, IRenderFragmentNode, default as JsxRx, ElementNode } from "../jsx"
 */

import { asArray, shallowEqual } from "@jsxrx/utils"
import { VDOMType } from "../constants/vdom.js"

/**
 * @template {Obj} P
 * @template {keyof import("../jsx-runtime.js").JSX.IntrinsicElements} T
 * @param {string} id 
 * @param {Component<P>} input 
 * @param {P | null} props 
 * @param {ElementNode} children 
 */
/**
 * @template {Obj} P
 * @template {keyof import("../jsx-runtime.js").JSX.IntrinsicElements} T
 * @param {string} id 
 * @param {T} input 
 * @param {import("../jsx-runtime.js").JSX.IntrinsicElements[T] | null} props 
 * @param {ElementNode} children 
 */
/**
 * @template {Obj} P
 * @template {keyof import("../jsx-runtime.js").JSX.IntrinsicElements} T
 * @param {string} id 
 * @param {T | Component<P>} input 
 * @param {*} props 
 * @param {ElementNode | null | undefined} children 
 */
export function _jsx(id, input, props, children) {
  if (typeof input === 'string') return new RenderElementNode(id, input, props, ...(asArray(children) ?? []).map(toRenderNode))
  return new RenderComponentNode(id, input, children === undefined ? props : { ...props, children })
}

/**
 * @param {string} id 
 * @param {ElementNode} children 
 */
export function _fragment(id, children) {
  return new RenderFragmentNode(id, ...(asArray(children) ?? []).map(toRenderNode))
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
 * @param {ElementNode} value
 * @param {number | string} [index=0] 
 * @returns {IRenderNode}
 */
/**
 * @overload
 * @param {ElementNode | null} value
 * @param {number | string} [index=0] 
 * @returns {IRenderNode | null}
 */
/**
 * @param {ElementNode | null} value
 * @param {number | string} [index=0] 
 * @returns {IRenderNode | null}
 */
export function toRenderNode(value, index = 0) {
  if (value === null) return null
  if (Array.isArray(value)) return new RenderFragmentNode(`fragment:${index}`, ...value.map(toRenderNode))
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
   * @param {string | null} text 
   */
  constructor(id, text) {
    this.id = id
    this.text = text
  }

  type = VDOMType.TEXT

  /**
   * @param {IRenderNode} node 
   */
  compareTo(node) {
    if (node === null || node === undefined) return false
    if (node.id !== this.id) return false
    if (node.type !== VDOMType.TEXT) return false
    return node.text === this.text
  }

  /**
   * @static
   * @param {string | number | bigint | boolean | undefined | null} value
   * @param {number | string} [index=0] 
   */
  static of(value, index = 0) {
    return new RenderTextNode(`${index}:text`, value !== null && value !== undefined ? String(value) : null)
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

  /**
   * @param {IRenderNode} node 
   */
  compareTo(node) {
    if (node === null || node === undefined) return false
    if (node.id !== this.id) return false
    if (node.type !== VDOMType.ELEMENT) return false
    if (!shallowEqual(node.props, this.props)) return false
    return shallowEqual(node.children, this.children, compareRenderNode)
  }

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


  /**
   * @param {IRenderNode} node 
   */
  compareTo(node) {
    if (node === null || node === undefined) return false
    if (node.id !== this.id) return false
    if (node.type !== VDOMType.COMPONENT) return false
    return compareProps(node.props, this.props)
  }
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

  /**
   * @param {IRenderNode} node 
   */
  compareTo(node) {
    if (node === null || node === undefined) return false
    if (node.id !== this.id) return false
    if (node.type !== VDOMType.FRAGMENT) return false
    return shallowEqual(node.children, this.children, compareRenderNode)
  }
}

/**
 * @param {Obj} a
 * @param {Obj} b
 */
export function compareProps(a, b) {
  return shallowEqual(a, b, (a, b) => {
    if (isRenderNode(a) && isRenderNode(b)) return compareRenderNode(a, b)
    return a === b
  })
}

/**
 * @param {IRenderNode | null} a
 * @param {IRenderNode | null} b
 * @returns {boolean}
 */
export function compareRenderNode(a, b) {
  if (a === b) return true
  if (a === null || b === null) return false
  if (a.id !== b.id) return false
  if (a.type !== b.type) return false
  return a.compareTo(b)
}
