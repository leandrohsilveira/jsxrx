/**
 * @import { ElementNode } from "./jsx.js";
 */

import { Fragment } from './fragment.js'
import { asArray } from "@jsxrx/utils";
import { _fragment, _jsx } from "./vdom/render.js";

export { Fragment }

/**
 * @param {*} tag 
 * @param {*} props 
 * @param {unknown} key 
 * @param {boolean} _isStatic 
 * @param {{ fileName: string, lineNumber: number, columnNumber: number }} source 
 * @returns {ElementNode}
 */
export function jsxDEV(
  tag,
  { children, ...props },
  key,
  _isStatic,
  source
) {
  try {
    if (tag === Fragment) return _fragment(genId('fragment', source, key), asArray(children))
    const name = typeof tag === 'string' ? tag : 'component'
    return _jsx(genId(name, source, key), tag, props, asArray(children))
  } catch (error) {
    const cause = error instanceof Error && error.cause;
    console.error(`Error encountered while rendering ${tag}`, {
      error,
      cause,
      source,
    });
    throw error;
  }
}

/**
 * @param {string} name 
 * @param {import("./jsx-dev-runtime.js").JSXSource} source
 * @param {unknown} key 
 */
function genId(name, { lineNumber, columnNumber }, key) {
  return String(key ?? `${lineNumber}:${columnNumber}:${name}`)
}
