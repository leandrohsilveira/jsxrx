/**
 * @import { Observable } from "rxjs"
 * @import { IState, IDeferred, InputTake, Ref } from "./jsx"
 */

import { assert } from "@jsxrx/utils"
import { BehaviorSubject } from "rxjs"
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
   * @template {Partial<P>} [D=P]
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
   * @template {Partial<P>} [D=P]
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
