/**
 * @import { Obj } from "../types.js"
 */

/**
 * @template {Obj} T
 * @param {T} a 
 * @param {T} b 
 */
export function shallowEqual(a, b) {
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)

  if (keysA.length !== keysB.length) return false

  for (const key of keysA) {
    if (a[key] !== b[key]) return false
  }

  return true
}

/**
 * @param {Obj} a 
 * @param {Obj} b 
 * @returns {string[]}
 */
export function shallowDiff(a, b) {
  const keys = combinedKeys(a, b)

  return keys.filter(key => a[key] !== b[key])
}

/**
 * @template {Obj} T
 * @param {T} obj1 
 * @param {T} obj2 
 * @returns {(keyof T)[]}
 */
export function combinedKeys(obj1, obj2) {
  return Array.from(
    new Set([
      ...Object.keys(obj1),
      ...Object.keys(obj2),
    ])
  )
}
