import { _fragment, _jsx, _suspense } from "./vdom/render.js"
import { Fragment } from "./fragment.js"
import { Suspense } from "./suspense.js"

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
  if (input === Suspense)
    return _suspense(`suspense:${id}`, props, children, key)
  if (input === Fragment) return _fragment(`fragment:${id}`, children, key)
  return _jsx(id, input, props, children, key)
}

export { Fragment }
