/**
 * @import { Observable } from "rxjs"
 * @import { ComponentInput, Component, ExpandedProps, Obj, IState, Element, Props, IStream } from "./jsx"
 */

import { BehaviorSubject, combineLatest, debounceTime, distinctUntilChanged, filter, map, merge, switchMap, tap } from "rxjs"
import { combineStreams, State, Stream } from "./observable"
import { shallowEqual } from "./util/object"
import { toRenderNode } from "./vdom"

/**
 * @template {Obj} P
 * @template {Obj} D
 * @param {ComponentInput<P, D>} input
 * @returns {Component<P>}
 */
export function component({ name, pipe: componentPipe, placeholder, render }) {
  /** @type {Component<P>} */
  const componentFn = componentProps$ => {
    const loading$ = new BehaviorSubject(true)
    const props$ = /** @type {Observable<Props<P>>} */(componentProps$.pipe(
      tap({ next: () => loading$.next(true) }),
      switchMap(props => {
        const { loadings, values } = combineStreams(props)
        return combineLatest({
          loadings: combineLatest([...Object.values(loadings)]).pipe(
            tap({ next: (loadings) => loading$.next(loadings.some(loading => loading)) })
          ),
          props: combineLatest(values)
        })
      }),
      map(({ props }) => props)
    ))

    const props = new Proxy(/** @type {ExpandedProps<P>} */({}), {
      get: (_, key) => {
        return props$.pipe(
          map(props => props[/** @type {string} */(key)]),
          distinctUntilChanged(),
        )
      }
    })


    const data = componentPipe ? componentPipe({ props$, props }) : props

    /** @type {*} */
    const functions = {
      value: {},
      memo: {}
    }

    /** @type {{ loadings: Record<string, Observable<boolean>>, values: Record<string, Observable<*>> }} */
    const { loadings, values } = combineStreams(data)

    return merge(
      combineLatest([loading$.pipe(distinctUntilChanged(), debounceTime(1)), ...Object.values(loadings)]).pipe(
        filter(() => !!placeholder),
        map(loadings => ({ isLoading: loadings.some(value => value), values: null })),
        distinctUntilChanged((a, b) => a.isLoading === b.isLoading),
        filter(({ isLoading }) => isLoading),
        debounceTime(1),
        map(() => /** @type {() => Element} */(placeholder)()),
      ),
      combineLatest(values).pipe(
        tap({ next: () => loading$.next(false), finalize: () => loading$.next(false) }),
        map(data => Object.fromEntries(
          Object.entries(data).map(([key, value]) => {
            if (typeof value !== 'function') return [key, value];
            functions.value[key] = value
            functions.memo[key] ??= /** @type {(...args: *) => *} */((...args) => functions.value[key](...args))
            return [key, functions.memo[key]]
          })
        )),
        distinctUntilChanged(shallowEqual),
        map(values => ({ isLoading: false, values })),
        debounceTime(1),
        map(({ values }) => render(/** @type {*} */(values))),
      )
    ).pipe(
      map(raw => toRenderNode(raw))
    )

  }

  componentFn.displayName = name
  return componentFn
}

/**
 * @template T
 * @param {T} initialValue 
 * @param {BehaviorSubject<boolean>} [pending]
 * @returns {IState<T>}
 */
export function state(initialValue, pending) {
  return new State(initialValue, pending)
}

/**
 * @template T
 * @param {Observable<T>} value 
 * @returns {IStream<T>}
 */
export function stream(value) {
  return new Stream(value)
}

export { combineLatest as combine } from "rxjs"
