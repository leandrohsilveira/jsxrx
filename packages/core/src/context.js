/**
 * @import { Observable } from "rxjs"
 * @import { IContext, IContextMap } from "./jsx"
 */

import { assert } from "@jsxrx/utils"
import { BehaviorSubject, combineLatest, map, of, switchMap } from "rxjs"
import { isObservableDelegate, ObservableDelegate } from "./observable"

/**
 * @template T
 * @implements {IContext<T>}
 */
export class Context {
  /**
   * @param {string} name
   * @param {T} initialValue
   */
  constructor(name, initialValue) {
    this.initialValue = initialValue
    this.symbol = Symbol(name)
  }

  create() {
    return new BehaviorSubject(this.initialValue)
  }
}

/**
 * @implements {IContextMap}
 */
export class ContextMap {
  /**
   * @param {Observable<Record<symbol, Observable<*>>>} [upstream$=of({})]
   */
  constructor(upstream$ = of({})) {
    this.#upstream$ = upstream$
    this.#local$ = new BehaviorSubject({})
    this.#stream$ = combineLatest({
      upstream: upstream$,
      local: this.#local$,
    }).pipe(
      map(({ upstream, local }) => ({
        ...upstream,
        ...local,
      })),
    )
  }

  #upstream$
  #stream$

  /** @type {BehaviorSubject<Record<symbol, Observable<*>>>} */
  #local$

  downstream() {
    return new ContextMap(this.#stream$)
  }

  /**
   * @template T
   * @param {Context<T>} context
   * @param {Observable<T>} value$
   */
  set(context, value$) {
    this.#local$.next({
      ...this.#local$.value,
      [context.symbol]: value$,
    })
  }

  /**
   * @template {IContext<any>} T
   * @param {T} context
   * @returns {Observable<T['initialValue']>}
   */
  require(context) {
    assert(
      context instanceof Context,
      "The context to be required needs to be instance of Context class",
    )
    return new ObservableDelegate(
      this.#upstream$.pipe(
        switchMap(contexts => {
          const value$ = contexts[context.symbol]
          assert(
            value$,
            `Unable to find required context for ${String(context.symbol)}`,
          )
          return value$
        }),
      ),
      this.#upstream$.pipe(
        switchMap(contexts => {
          const value$ = contexts[context.symbol]
          assert(
            value$,
            `Unable to find required context for ${String(context.symbol)}`,
          )
          if (isObservableDelegate(value$)) return value$.source
          return value$
        }),
      ),
    )
  }

  /**
   * @template T
   * @param{Context<T>} context
   * @returns {Observable<T>}
   */
  optional(context) {
    return this.#upstream$.pipe(
      switchMap(
        contexts => contexts[context.symbol] ?? of(context.initialValue),
      ),
    )
  }
}
