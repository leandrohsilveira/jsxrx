/**
 * @import { Operator } from "rxjs"
 * @import { IState, IDeferred as IDeferred, CombineOutput } from "./jsx"
 */

import { shallowEqual } from "@jsxrx/utils"
import {
  BehaviorSubject,
  combineLatest,
  debounceTime,
  distinctUntilChanged,
  filter,
  isObservable,
  merge,
  Observable,
  of,
  share,
  switchMap,
  tap,
} from "rxjs"
import { isRenderNode } from "./vdom"

/**
 * @template T
 * @extends {Observable<T>}
 */
class ObservableDelegate extends Observable {
  /**
   * @param {Observable<T>} observable
   * @param {Observable<unknown>} [source]
   */
  constructor(observable, source) {
    super()
    this.#delegate = observable
    this.source = source ?? observable
    this.operator = observable.operator
  }

  #delegate

  /**
   * @param {(value: T) => void} each
   */
  forEach(each) {
    return this.#delegate.forEach(each)
  }

  /**
   * @template R
   * @param {Operator<T, R>} [operator]
   */
  lift(operator) {
    return this.#delegate.lift(operator)
  }

  toPromise() {
    return this.#delegate.toPromise()
  }

  // @ts-expect-error vararg
  pipe(...operators) {
    return new ObservableDelegate(
      this.#delegate.pipe(
        // @ts-expect-error vararg
        ...operators,
      ),
      this.source,
    )
  }

  // @ts-expect-error vararg
  subscribe(...args) {
    return this.#delegate.subscribe(...args)
  }
}

/**
 * @template T
 * @extends {ObservableDelegate<T>}
 * @implements {IState<T>}
 */
export class State extends ObservableDelegate {
  /**
   * @param {BehaviorSubject<T>} value$
   */
  constructor(value$) {
    super(value$.asObservable(), value$.asObservable())
    this.#value$ = value$
  }

  #value$

  get value() {
    return this.#value$.value
  }

  /**
   * @param {T} value
   */
  set(value) {
    this.#value$.next(value)
  }
}

/**
 * @template T
 * @implements {IDeferred<T>}
 */
export class Defer {
  /**
   * @param {Observable<T>} value$
   */
  constructor(value$) {
    this.value$ = value$
  }

  /** @type {'stream'} */
  kind = "stream"
}

/**
 * @template T
 * @param {unknown} value
 * @returns {value is ObservableDelegate<T>}
 */
export function isObservableDelegate(value) {
  return value instanceof ObservableDelegate || value instanceof State
}

/**
 * @template T
 * @param {T} data
 * @returns {Observable<CombineOutput<T>>}
 */
export function combine(data) {
  return /** @type {*} */ (
    combineLatest(
      Object.fromEntries(
        Object.entries(/** @type {Record<string, *>} */ (data)).map(
          ([key, value]) => {
            if (isRenderNode(value)) {
              return [key, of(value)]
            }
            if (value instanceof Defer) {
              return [key, of(value.value$)]
            }
            if (isObservable(value)) {
              return [key, value]
            }
            return [key, of(value)]
          },
        ),
      ),
    ).pipe(debounceTime(1), distinctUntilChanged(shallowEqual), share())
  )
}

/**
 * @param {Observable<unknown>} value
 * @returns {Observable<boolean>}
 */
export function loading(value) {
  if (isObservableDelegate(value)) {
    const pending$ = new BehaviorSubject(true)
    const observed = value.source.pipe(
      tap(() => pending$.next(true)),
      switchMap(() => value),
    )
    return merge(
      observed,
      value.pipe(
        tap({
          next: () => pending$.next(false),
          error: () => pending$.next(false),
        }),
      ),
      pending$.pipe(debounceTime(1), distinctUntilChanged()),
    ).pipe(filter(value => typeof value === "boolean"))
  }

  return of(false)
}
