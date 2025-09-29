import { _fragment, _jsx } from "./vdom/render.js"
import { Fragment } from "./fragment.js"

/**
 * @param {string} id
 * @param {*} input
 * @param {*} props
 * @param {*} key
 */
export function jsx(id, input, { children, ...props } = {}, key) {
  return jsxs(id, input, children ? { children, ...props } : props, key)
}

/**
 * @param {string} id
 * @param {*} input
 * @param {*} props
 * @param {*} key
 */
export function jsxs(id, input, { children, ...props } = {}, key) {
  if (input === Fragment) return _fragment(`fragment:${id}`, children, key)
  return _jsx(id, input, props, children, key)
}

export { Fragment }
