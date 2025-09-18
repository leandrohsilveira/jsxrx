
import { asArray } from "./util/array.js"
import { _jsx } from "./vdom/render.js"

/**
 * @param {{ children: * }} props 
 */
export function Fragment({ children }) {
  return _jsx('fragment', '', null, ...asArray(children))
}

export {
  _jsx as jsx,
  _jsx as jsxs
}
