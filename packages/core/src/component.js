/**
 * @import { IState, IDeferred, InputTake, Ref, Emitter, OptionalEmitter, InputSpread } from "./jsx"
 */

import { assert } from "@jsxrx/utils"
import {
  BehaviorSubject,
  isObservable,
  of,
  Observable,
  switchMap,
  take,
  lastValueFrom,
} from "rxjs"
import { Defer, ElementRef, Input, isRef, State } from "./observable"

/**
 * @template T
 * @param {T} initialValue
 * @returns {IState<T>}
 */
export function state(initialValue) {
  return new State(new BehaviorSubject(initialValue))
}

/**
 * @template {(...args: *) => *} T
 * @overload
 * @param {Observable<T>} value$
 * @returns {Emitter<T>}
 */
/**
 * @template {((...args: *) => *)} T
 * @overload
 * @param {Observable<T | null | undefined>} value$
 * @returns {OptionalEmitter<T>}
 */
/**
 * @template {((...args: *) => *) | null | undefined} T
 * @param {Observable<T>} value$
 * @returns {Emitter<T> | OptionalEmitter<T>}
 */
export function emitter(value$) {
  return /** @type {*} */ ({
    // @ts-expect-error yeah implicit any[]
    async emit(...args) {
      const fn = await lastValueFrom(value$.pipe(take(1)))
      return await fn?.(...args)
    },
  })
}

/**
 * @template T
 * @param {Observable<T>} value
 * @returns {IDeferred<T>}
 */
export function defer(value) {
  return new Defer(value)
}

/**
 * @template T
 * @param {Ref<T> | Observable<T | Ref<T>> | T} value
 * @returns {Observable<T | null>}
 */
export function fromRef(value) {
  if (isObservable(value)) {
    return value.pipe(
      switchMap(value => {
        if (/** @type {typeof isRef<T>} */ (isRef)(value))
          return fromSubscribable(value.current)
        return of(value)
      }),
    )
  }
  if (/** @type {typeof isRef<T>} */ (isRef)(value))
    return fromSubscribable(value.current)
  return of(value)
}

/**
 * @template T
 * @param {import("rxjs").Subscribable<T>} subscribable
 * @returns {Observable<T>}
 */
function fromSubscribable(subscribable) {
  return new Observable(subscriber => {
    return subscribable.subscribe(subscriber)
  })
}

/**
 * @template T
 * @param {new () => T} construct
 * @returns {Ref<T>}
 */
export function ref(construct) {
  return new ElementRef(construct)
}

export class Props {
  /**
   * @template P
   * @template [D=P]
   * @param {Observable<P>} input$
   * @param {D} [defaultProps]
   */
  static take(input$, defaultProps) {
    assert(
      input$ instanceof Input,
      "Props.take input$ must be instance of Input class",
    )
    return /** @type {InputTake<P & D>} */ (input$.take(defaultProps))
  }

  /**
   * @template P
   * @template [D=P]
   * @param {Observable<P>} input$
   * @param {D} [defaultProps]
   */
  static spread(input$, defaultProps) {
    assert(
      input$ instanceof Input,
      "Props.spread input$ must be instance of Input class",
    )
    return /** @type {Observable<InputSpread<P & D>>} */ (
      input$.spread(defaultProps)
    )
  }
}
