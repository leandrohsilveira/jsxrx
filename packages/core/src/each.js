/**
 * @import { OperatorFunction } from "rxjs";
 */

import { asObservable, shallowComparator } from "@jsxrx/utils"
import {
  BehaviorSubject,
  distinctUntilChanged,
  map,
  Observable,
  Subject,
} from "rxjs"

/**
 * @template T
 * @template K
 * @template [E=null]
 * @typedef MapperOptions
 * @property {(item: T, index: number) => K} trackBy
 * @property {(a: T, b: T) => boolean} [distinct]
 * @property {E} [whenEmpty]
 */

/**
 * @template {Array<*>} T
 * @template R
 * @template K
 * @template [E=null]
 * @param {(item$: Observable<T[number]>, index$: Observable<number>) => R} mapper
 * @param {MapperOptions<T[number], K, E>} options
 * @returns {OperatorFunction<T, Observable<R>[] | E>}
 */
export function each(mapper, options) {
  return source$ => {
    return new Observable(subscriber => {
      /** @type {Record<string, Subject<T[number]>>} */
      let keymapping = {}

      /** @type {Record<string, BehaviorSubject<number>>} */
      let indexes = {}

      /** @type {string[]} */
      let positions = []

      /** @type {Observable<R>[]} */
      let results = []

      /** @type {Subject<Observable<R>[]>} */
      const output$ = new Subject()

      subscriber.add(
        source$.pipe(map(items => items ?? [])).subscribe({
          complete: () => subscriber.complete(),
          error: err => subscriber.error(err),
          next: items => {
            if (items.length === 0) {
              clear()
              output$.next(/** @type {*} */ (options.whenEmpty ?? null))
              return
            }
            /** @type {Observable<R>[]} */
            const newResult = []

            /** @type {string[]} */
            const newPositions = []

            for (let index = 0; index < items.length; index++) {
              const item = items[index]
              const key = options.trackBy(item, index)
              const mappingKey = String(key)
              if (keymapping[mappingKey]) {
                keymapping[mappingKey].next(item)
                if (positions[index] !== mappingKey) {
                  newResult.push(results[indexes[mappingKey].value])
                  newPositions.push(mappingKey)
                  indexes[mappingKey].next(index)
                }
                continue
              }
              keymapping[mappingKey] ??= new BehaviorSubject(item)
              indexes[mappingKey] ??= new BehaviorSubject(index)
              const content$ = asObservable(
                mapper(
                  keymapping[mappingKey].pipe(
                    distinctUntilChanged(options.distinct),
                  ),
                  indexes[mappingKey].pipe(distinctUntilChanged()),
                ),
              )
              assignKey(content$, key)
              newResult.push(content$)
              newPositions.push(mappingKey)
            }

            results = newResult
            positions = newPositions
            subscriber.next(results)
          },
        }),
      )

      subscriber.add(
        output$
          .pipe(distinctUntilChanged(shallowComparator))
          .subscribe(subscriber),
      )

      return () => {
        output$.complete()
        clear()
      }

      function clear() {
        Object.values(keymapping).forEach(subject => subject.complete())
        Object.values(indexes).forEach(subject => subject.complete())
        keymapping = {}
        indexes = {}
        results = []
        positions = []
      }
    })
  }
}

/**
 * @param {unknown} value
 * @param {unknown} key
 */
function assignKey(value, key) {
  if (value === null || value === undefined || typeof value !== "object") return
  Object.assign(value, { key })
}
