/**
 * @import { Observable } from "rxjs"
 */

import { isObservable, of } from "rxjs"

/**
 * @template T
 * @param {T | Observable<T>} value
 */
export function asObservable(value) {
  return isObservable(value) ? value : of(value)
}
