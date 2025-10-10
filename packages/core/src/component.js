/**
 * @import { Observable } from "rxjs"
 * @import { IState, IDeferred, InputTake, Ref, Emitter, OptionalEmitter } from "./jsx"
 */

import { assert } from "@jsxrx/utils"
import { BehaviorSubject, take } from "rxjs"
import { Defer, ElementRef, Input, State } from "./observable"

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
      return new Promise((resolve, reject) => {
        return value$.pipe(take(1)).subscribe({
          next: async fn => {
            if (!fn) return resolve(undefined)
            try {
              return resolve(await fn(...args))
            } catch (err) {
              return reject(err)
            }
          },
          error: reject,
        })
      })
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
    return /** @type {Observable<InputTake<P & D>>} */ (
      input$.spread(defaultProps)
    )
  }
}
