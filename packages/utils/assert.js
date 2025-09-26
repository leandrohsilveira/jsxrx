/**
 *
 * @param {unknown} value
 * @param {string | Error} error
 * @returns {asserts value}
 */
export function assert(value, error) {
  if (!value) throwError(error)
}

/**
 *
 * @param {string | Error} error
 * @returns {never}
 */
function throwError(error) {
  if (error instanceof Error) throw error
  throw new Error(error ?? "Assertion failed")
}
