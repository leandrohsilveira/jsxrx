/**
 * @import { Observable } from "rxjs"
 * @import { Component, IRenderComponentNode, IRenderElementNode, IRenderTextNode, Obj, IRenderNode, IRenderFragmentNode, ElementNode, IRenderObservableNode, IRenderSuspenseNode } from "../jsx"
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
 * @param {ElementNode} children
 * @param {*} key
 */
export function _jsx(id, input, props, children, key) {
  if (typeof input === "string")
    return new RenderElementNode(genId(id, key), input, props, children, key)
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
  return new RenderFragmentNode(id, asArray(children) ?? [], key)
}

/**
 * @param {string} id
 * @param {{ fallback: ElementNode }} props
 * @param {ElementNode} children
 * @param {*} key
 */
export function _suspense(id, { fallback }, children, key) {
  return new RenderSuspenseNode(id, fallback, children, key)
}

/**
 * @param {unknown} value
 * @returns {value is IRenderNode}
 */
export function isRenderNode(value) {
  return (
    value instanceof RenderElementNode ||
    value instanceof RenderComponentNode ||
    value instanceof RenderFragmentNode ||
    value instanceof RenderSuspenseNode
  )
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
   * @param {ElementNode} children
   * @param {*} key
   */
  constructor(id, tag, props, children, key) {
    this.id = id
    this.tag = tag
    this.key = key
    this.props = props ?? {}
    this.children = asArray(children) ?? []
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
    this.name = component.displayName ?? component.name
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
   * @param {ElementNode} children
   * @param {*} key
   */
  constructor(id, children, key) {
    this.id = id
    this.key = key
    this.children = asArray(children) ?? []
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
 * @class
 * @implements {IRenderSuspenseNode}
 */
export class RenderSuspenseNode {
  /**
   * @param {string} id
   * @param {ElementNode} fallback
   * @param {ElementNode} children
   * @param {*} key
   */
  constructor(id, fallback, children, key) {
    this.id = id
    this.fallback = fallback
    this.children = children
    this.key = key
  }

  type = VDOMType.SUSPENSE

  /**
   * @param {IRenderNode} node
   */
  compareTo(node) {
    if (node === null || node === undefined) return false
    if (node.id !== this.id) return false
    if (node.type !== VDOMType.SUSPENSE) return false
    if (!shallowEqual(node.fallback, this.fallback, compareRenderNode))
      return false
    return shallowEqual(node.children, this.children, compareRenderNode)
  }
}

/**
 * @template {Obj} [T=Obj]
 * @param {T} a
 * @param {T} b
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
