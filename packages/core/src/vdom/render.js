/**
 * @import { Component, IRenderComponentNode, IRenderElementNode, IRenderTextNode, Obj, IRenderNode, IRenderFragmentNode, ElementNode } from "../jsx"
 */

import { asArray, shallowEqual } from "@jsxrx/utils"
import { VDOMType } from "../constants/vdom.js"

/**
 * @template P
 * @template {keyof import("../jsx-runtime.js").JSX.IntrinsicElements} T
 * @param {string} id
 * @param {Component<P>} input
 * @param {P | null} props
 * @param {ElementNode} children
 */
/**
 * @template P
 * @template {keyof import("../jsx-runtime.js").JSX.IntrinsicElements} T
 * @param {string} id
 * @param {T} input
 * @param {import("../jsx-runtime.js").JSX.IntrinsicElements[T] | null} props
 * @param {ElementNode} children
 */
/**
 * @template P
 * @template {keyof import("../jsx-runtime.js").JSX.IntrinsicElements} T
 * @param {string} id
 * @param {T | Component<P>} input
 * @param {*} props
 * @param {ElementNode | null | undefined} children
 * @param {*} key
 */
export function _jsx(id, input, props, children, key) {
  if (typeof input === "string")
    return new RenderElementNode(
      genId(id, key),
      input,
      props,
      (asArray(children) ?? []).map(toRenderNode),
      key,
    )
  return new RenderComponentNode(
    genId(id, key),
    input,
    children === undefined ? props : { ...props, children },
    key,
  )
}

/**
 * @param {string} id
 * @param {*} key
 */
function genId(id, key) {
  if (key === null || key === undefined) return id
  return `${id}:${key}`
}

/**
 * @param {string} id
 * @param {ElementNode} children
 * @param {*} key
 */
export function _fragment(id, children, key) {
  return new RenderFragmentNode(
    id,
    (asArray(children) ?? []).map(toRenderNode),
    key,
  )
}

/**
 * @param {unknown} value
 * @returns {value is IRenderNode}
 */
export function isRenderNode(value) {
  return (
    value instanceof RenderTextNode ||
    value instanceof RenderElementNode ||
    value instanceof RenderComponentNode ||
    value instanceof RenderFragmentNode
  )
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
  if (Array.isArray(value))
    return new RenderFragmentNode(
      `fragment:${index}`,
      value.map(toRenderNode),
      index,
    )
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
    return new RenderTextNode(
      `text:${index}`,
      value !== null && value !== undefined ? String(value) : null,
    )
  }
}

/**
 * @class
 * @implements {IRenderElementNode}
 */
export class RenderElementNode {
  /**
   * @constructor
   * @param {string} id
   * @param {string} tag
   * @param {Record<string, *>} props
   * @param {(IRenderNode | null)[]} children
   * @param {*} key
   */
  constructor(id, tag, props, children, key) {
    this.id = id
    this.tag = tag
    this.key = key
    this.props = props ?? {}
    this.children = Object.fromEntries(
      children.filter(child => child !== null).map(child => [child.id, child]),
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
 * @implements {IRenderComponentNode}
 */
export class RenderComponentNode {
  /**
   * @param {string} id
   * @param {Component<*>} component
   * @param {Record<string, *>} props
   * @param {*} key
   */
  constructor(id, component, props, key) {
    this.id = id
    this.component = component
    this.key = key
    this.props = props ?? {}
    this.name = component.displayName ?? "anonymous"
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
   * @param {(IRenderNode | null)[]} children
   * @param {*} key
   */
  constructor(id, children, key) {
    this.id = id
    this.key = key
    this.children = Object.fromEntries(
      children.filter(child => child !== null).map(child => [child.id, child]),
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
    if (a === b) return true
    if (isRenderNode(a) && isRenderNode(b)) return compareRenderNode(a, b)
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false
      return a.every((item, index) => compareRenderNode(item, b[index]))
    }
    return false
  })
}

/**
 * @param {*} a
 * @param {*} b
 * @returns {boolean}
 */
export function compareRenderNode(a, b) {
  if (a === b) return true
  if (a === null || b === null) return false
  if (!isRenderNode(a) || !isRenderNode(b)) return false
  if (a.id !== b.id) return false
  if (a.type !== b.type) return false
  return a.compareTo(b)
}
