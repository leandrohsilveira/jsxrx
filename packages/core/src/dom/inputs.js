/**
 * @import { Ref } from "../jsx.js"
 * @import { Observable } from "rxjs"
 */

import {
  combineLatest,
  fromEvent,
  isObservable,
  NEVER,
  of,
  switchMap,
} from "rxjs"
import { fromRef } from "../component.js"

/**
 * @template {EventTarget} T
 * @overload
 * @param {T} ref$
 * @param {Observable<string> | string} name$
 * @param {Observable<boolean>} while$
 * @returns {Observable<Event>}
 */
/**
 * @template {EventTarget} T
 * @overload
 * @param {Ref<T> | Observable<T> | Observable<Ref<T>>} ref$
 * @param {Observable<string> | string} name$
 * @param {Observable<boolean>} [while$]
 * @returns {Observable<Event>}
 */
/**
 * @template {EventTarget} T
 * @param {Ref<T> | Observable<T | Ref<T>> | T} ref
 * @param {Observable<string> | string} name$
 * @param {Observable<boolean>} [while$]
 * @returns {Observable<Event>}
 */
export function fromRefEvent(ref, name$, while$ = of(true)) {
  const ref$ = fromRef(ref)
  return combineLatest({
    ref: ref$,
    name: isObservable(name$) ? name$ : of(name$),
    while: while$,
  }).pipe(
    switchMap(input => {
      if (input.ref !== null && input.while)
        return fromEvent(input.ref, input.name)
      return NEVER
    }),
  )
}
