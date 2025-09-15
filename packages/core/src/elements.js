import { shallowEqual } from "./util/object.js";

/**
 * @template {import("./types").Obj} T
 * @param {string} id 
 * @param {string | import("./types").Component<T>} controller
 * @param {T | null} props 
 * @param {...import("./types").JsxRxNode} children 
 * @return {import("./types").JsxRxNode}
 */
export function _jsx(id, controller, props, ...children) {
  if (typeof controller === 'string') return createElement(id, controller, props, ...children)
  return createComponent(id, controller, props)
}

/**
 * @template {import("./types").Obj} T
 * @param {string} id 
 * @param {import("./types").Component<T>} component 
 * @param {Record<string, unknown> | null} props 
 * @returns {import("./types").JsxRxComponent<T>}
 */
export function createComponent(id, component, props) {
  return {
    id,
    type: 'component',
    component,
    props: /** @type {T} */(props ?? {}),
  }
}

/**
 * @param {string} id 
 * @param {string} tag 
 * @param {Record<string, unknown> | null} props 
 * @param {...import("./types").JsxRxNode} children 
 * @return {import("./types").JsxRxElement}
 */
export function createElement(id, tag, props, ...children) {
  return {
    id,
    tag,
    props: props ?? {},
    children,
    type: 'element'
  }
}

/**
 * @param {string | number} index 
 * @param {string | number | boolean} text 
 * @returns {import("./types").JsxRxText}
 */
export function createText(index, text) {
  return {
    id: `${index}:text`,
    type: 'text',
    text: String(text)
  }
}

/**
 * @param {import("./types").JsxRxNode} node 
 * @param {string | number} index 
 * @returns {import("./types").JsxRxTreeNode}
 */
export function toTreeNode(node, index) {
  return isNode(node) ? node : createText(index, String(node))
}

/**
 * @param {import("./types").JsxRxNode} rendered 
 * @param {import("./types").JsxRxNode} current 
 * @param {Set<string>} ids 
 */
export function diff(rendered, current, ids) {
  if (!isNode(rendered) || !isNode(current))
    return rendered === current ? 'unchanged' : 'replace'
  if (rendered.id !== current.id && !ids.has(current.id) && !ids.has(rendered.id))
    return 'replace'



  /** @type {*} */
  const changes = {}

  if (!shallowEqual(rendered.props, current.props))
    return changes
}

/**
 * @param {unknown} value 
 * @returns {value is import("./types").JsxRxElement}
 */
export function isNode(value) {
  return typeof value === 'object' && value !== null && 'type' in value && 'id' in value
}
