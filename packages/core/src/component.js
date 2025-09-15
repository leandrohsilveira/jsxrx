import { combineLatest, distinctUntilChanged, isObservable, map, of } from "rxjs"
import { shallowEqual } from "./util/object"

/**
 * @template {import("./types").Obj} Props
 * @template {import("./types").Obj} Data
 * @param {import("./types").ComponentInput<Props, Data>} input
 * @returns {import("./types").Component<Props>}
 */
export function component({ load, render }) {
  return props$ => {
    const props = new Proxy(/** @type {import("./types").ExpandedProps<Props>} */({}), {
      get: (_, key) => {
        return props$.pipe(map(props => props[/** @type {string} */(key)]))
      }
    })

    const data = load ? load({ props$, props }) : props

    /** @type {*} */
    const functions = {
      value: {},
      memo: {}
    }

    return combineLatest(
      Object.fromEntries(
        Object.entries(data ?? {}).map(([key, value]) => {
          if (isObservable(value)) return [key, value]
          return [key, of(value)]
        })
      )
    ).pipe(
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
    )
  }
}

