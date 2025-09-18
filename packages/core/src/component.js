/**
 * @import { ComponentInput, Component, ExpandedProps, Obj } from "./jsx"
 */

import { combineLatest, debounceTime, distinctUntilChanged, isObservable, map, of, startWith } from "rxjs"
import { shallowEqual } from "./util/object"
import { toRenderNode } from "./vdom"
import { State } from "./observable"

/**
 * @template {Obj} Props
 * @template {Obj} Data
 * @param {ComponentInput<Props, Data>} input
 * @returns {Component<Props>}
 */
export function component({ pipe: componentPipe, placeholder, render }) {
  return props$ => {
    const props = new Proxy(/** @type {ExpandedProps<Props>} */({}), {
      get: (_, key) => {
        return props$.pipe(
          map(props => props[/** @type {string} */(key)]),
        )
      }
    })

    const data = componentPipe ? componentPipe({ props$, props }) : props

    /** @type {*} */
    const functions = {
      value: {},
      memo: {}
    }

    return combineLatest(
      Object.fromEntries(
        Object.entries(data).map(([key, value]) => {
          if (isObservable(value)) return [key, value]
          return [key, of(value)]
        })
      )
    ).pipe(
      debounceTime(1),
      map(data => Object.fromEntries(
        Object.entries(data).map(([key, value]) => {
          if (typeof value !== 'function') return [key, value];
          functions.value[key] = value
          functions.memo[key] ??= /** @type {(...args: *) => *} */((...args) => functions.value[key](...args))
          return [key, functions.memo[key]]
        })
      )),
      distinctUntilChanged(shallowEqual),
      map(data => render(/** @type {*} */(data))),
      startWith(placeholder?.() ?? null),
      map(raw => toRenderNode(raw))
    )
  }
}

/**
 * @template T
 * @param {T} initialValue 
 * @returns {State<T>}
 */
export function state(initialValue) {
  return new State(initialValue)
}

export { combineLatest as combine } from "rxjs"
