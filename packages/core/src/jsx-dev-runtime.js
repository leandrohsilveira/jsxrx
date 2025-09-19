/**
 * @import { Element } from "./jsx.js";
 */

import { asArray } from "./util/array.js";
import { _jsx } from "./vdom/render.js";

export { Fragment } from "./jsx-runtime.js";

/**
 * @param {*} tag 
 * @param {*} props 
 * @param {unknown} key 
 * @param {boolean} _isStatic 
 * @param {{ fileName: string, lineNumber: number, columnNumber: number }} source 
 * @returns {Element}
 */
export function jsxDEV(
  tag,
  { children = [], ...props },
  key,
  _isStatic,
  { fileName, lineNumber, columnNumber }
) {
  try {
    const name = typeof tag === 'string' ? tag : 'component'
    return _jsx(String(`${lineNumber}:${columnNumber}:${name}:${key ?? 0}`), tag, props, ...asArray(children))
  } catch (error) {
    const cause = error instanceof Error && error.cause;
    console.error(`Error encountered while rendering ${tag}`, {
      error,
      cause,
      source: { fileName, lineNumber, columnNumber },
    });
    throw error;
  }
}
