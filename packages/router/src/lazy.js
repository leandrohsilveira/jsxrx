/**
 * @import { RouteResolverInput } from "./types.js"
 */

import { assert } from "@jsxrx/utils"
import { from, map, Observable } from "rxjs"

/**
 * @template {{ [key: string]: unknown }} T
 * @template {keyof T} N
 * @param {() => Promise<T>} importer
 * @param {N} name
 * @returns {Observable<T[N]>}
 */
export function lazyResolver(importer, name) {
  return new Observable(subscriber => {
    return from(importer())
      .pipe(
        map(mod => {
          const modName = name ?? "default"
          assert(
            modName in mod,
            `Lazy resolver module "${String(modName)}" does not exists`,
          )
          return mod[/** @type {N} */ (modName)]
        }),
      )
      .subscribe(subscriber)
  })
}
