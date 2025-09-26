/**
 * @template T
 * @overload
 * @param {T | T[]} input
 * @returns {T[]}
 */
/**
 * @template T
 * @overload
 * @param {T | T[] | null | undefined} input
 * @returns {T[] | null}
 */
/**
 * @template T
 * @param {T | T[] | null | undefined} input
 * @returns {T[] | null}
 */
export function asArray(input) {
  if (input === null || input === undefined) return null
  if (Array.isArray(input)) return input
  return [input]
}
