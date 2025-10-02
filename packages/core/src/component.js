/**
 * @import { Observable } from "rxjs"
 * @import { IState, IDeferred, CombineOutput, Inputs } from "./jsx"
 */

import { assert, shallowEqual } from "@jsxrx/utils"
import {
  BehaviorSubject,
  combineLatest,
  debounceTime,
  distinctUntilChanged,
  isObservable,
  of,
  share,
} from "rxjs"
import { Defer, State } from "./observable"
import { isRenderNode } from "./vdom"
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
