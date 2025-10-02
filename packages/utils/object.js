/**
 * @typedef { Record<string, unknown> } Obj
 */

import { assert } from "./assert.js"

/**
 * @param {*} a
 * @param {*} b
 * @param {(a: *, b: *) => boolean} [comparator]
 */
export function shallowEqual(a, b, comparator = (a, b) => a === b) {
  if (a === b) return true
  if (Array.isArray(a) && Array.isArray(b))
    return a.every((item, index) => item === b[index])
  if (Array.isArray(a) || Array.isArray(b)) return false
  if (typeof a !== "object" || typeof b !== "object") return false
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)

  if (keysA.length !== keysB.length) return false

  for (const key of keysA) {
    if (!comparator(a[key], b[key])) return false
  }

  return true
}

/**
 * @param {*} a
 * @param {*} b
 * @returns {string[]}
 */
export function shallowDiff(a, b) {
  const keys = combinedKeys(a, b)

  return keys.filter(key => a[key] !== b[key])
}

/**
 * @param {Obj} obj1
 * @param {Obj} obj2
 * @returns {string[]}
 */
export function combinedKeys(obj1, obj2) {
  return Array.from(new Set([...Object.keys(obj1), ...Object.keys(obj2)]))
}

/**
 * @param {*} a
 * @param {*} b
 */
export function strictCompareKeys(a, b) {
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)

  return aKeys.every((aKey, index) => aKey === bKeys[index])
}
