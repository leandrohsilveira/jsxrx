/**
 * @import { ElementNode } from "./jsx.js";
 */

import { Fragment } from "./fragment.js"
import { Suspense } from "./suspense.js"
import { _fragment, _jsx, _suspense } from "./vdom/render.js"

export { Fragment }

/**
 * @param {*} tag
 * @param {*} props
 * @param {unknown} key
 * @param {boolean} _isStatic
 * @param {{ fileName: string, lineNumber: number, columnNumber: number }} source
 * @returns {ElementNode}
 */
export function jsxDEV(tag, { children, ...props }, key, _isStatic, source) {
  try {
    if (tag === Fragment)
      return _fragment(genId("fragment", source), children, key)
    if (tag === Suspense)
      return _suspense(genId("suspense", source), props, children, key)
    const name = typeof tag === "string" ? tag : "component"
    return _jsx(genId(name, source), tag, props, children, key)
  } catch (error) {
    const cause = error instanceof Error && error.cause
    console.error(`Error encountered while rendering ${tag}`, {
      error,
      cause,
      source,
    })
    throw error
  }
}

/**
 * @param {string} name
 * @param {import("./jsx-dev-runtime.js").JSXSource} source
 */
function genId(name, { lineNumber, columnNumber }) {
  return `${lineNumber}:${columnNumber}:${name}`
}
