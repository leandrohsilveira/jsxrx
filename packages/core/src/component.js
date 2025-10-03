/**
 * @import { Observable } from "rxjs"
 * @import { IState, IDeferred, CombineOutput, Inputs } from "./jsx"
 */

import { assert } from "@jsxrx/utils"
import { BehaviorSubject } from "rxjs"
import { Defer, State } from "./observable"
import { Input } from "./vdom/vdom"

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
 * @param {Observable<T>} input$
 */
export function props(input$) {
  assert(
    input$ instanceof Input,
    "The component input should be instance of Input class",
  )
  return /** @type {Inputs<T>['props']} */ (input$.props)
}
