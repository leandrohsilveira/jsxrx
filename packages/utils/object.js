/**
 * @typedef { Record<string, unknown> } Obj
 */

/**
 * @template {Obj} T
 * @param {T} a 
 * @param {T} b 
 * @param {(a: *, b: *) => boolean} [comparator]
 */
export function shallowEqual(a, b, comparator = (a, b) => a === b) {
  if (a === b) return true
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)

  if (keysA.length !== keysB.length) return false

  for (const key of keysA) {
    if (!comparator(a[key], b[key])) return false
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
 * @param {Obj} obj1 
 * @param {Obj} obj2 
 * @returns {string[]}
 */
export function combinedKeys(obj1, obj2) {
  return Array.from(
    new Set([
      ...Object.keys(obj1),
      ...Object.keys(obj2),
    ])
  )
}
