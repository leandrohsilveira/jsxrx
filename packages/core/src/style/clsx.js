/**
 * @import { Observable } from "rxjs"
 * @import { ClassValue } from "./types.js"
 */

import { clsx } from "clsx"
import { combineLatest, isObservable, map, of, switchMap } from "rxjs"

/**
 * @param {...ClassValue} tokens
 * @returns {Observable<string>}
 */
export function classes(...tokens) {
  return combineLatest(
    tokens.map(token => {
      if (isObservable(token))
        return /** @type {Observable<*>} */ (token).pipe(
          switchMap(tokens => classes(tokens)),
        )
      if (Array.isArray(token)) return classes(...token)
      if (typeof token === "object" && token !== null)
        return combineLatest(
          Object.fromEntries(
            Object.entries(token).map(([tokens, test]) => {
              if (isObservable(test)) return [tokens, test]
              return [tokens, of(test)]
            }),
          ),
        )
      return of(token)
    }),
  ).pipe(map(tokens => clsx(...tokens)))
}

/**
 * @template {string} T
 * @param {Observable<T> | T} input
 * @param {Record<T, ClassValue>} variantMap
 * @param {ClassValue} [defaultStyles]
 * @returns {Observable<string>}
 */
export function variants(input, variantMap, defaultStyles) {
  const input$ = isObservable(input) ? input : of(input)
  return input$.pipe(
    switchMap(input => classes(variantMap[input] ?? defaultStyles)),
  )
}
