/**
 * @import { Observable } from "rxjs"
 * @import { Component, ExpandedProps, Obj, IState, Element, Props, IStream, ComponentInputRender, ComponentInputPipe } from "./jsx"
 */

import { BehaviorSubject, combineLatest, debounceTime, distinctUntilChanged, filter, isObservable, map, merge, of, Subject, Subscription, switchMap, tap } from "rxjs"
import { ActivityAwareObservable, State, Stream } from "./observable"
import { combinedKeys, shallowEqual } from "./util/object"
import { toRenderNode } from "./vdom"


/**
 * @template {Obj} P
 * @template {Obj} D
 * @template {P} [IP=P]
 * @overload
 * @param {ComponentInputPipe<P, IP, D>} input
 * @returns {Component<P>}
 */
/**
 * @template {Obj} P
 * @template {P} [IP=P]
 * @overload
 * @param {ComponentInputRender<P & IP, IP>} input
 * @returns {Component<P>}
 */
/**
 * @template {Obj} P
 * @template {Obj} D
 * @template {P} [IP=P]
 * @param {ComponentInputPipe<P, IP, D> | ComponentInputRender<P & IP, IP>} input
 * @returns {Component<P>}
 */
export function component(input) {
  /** @type {Component<P>} */
  const componentFn = componentProps$ => {
    const loading$ = new BehaviorSubject(true)
    const props$ = componentProps$.pipe(
      map(props => {
        const keys = combinedKeys(props, input.defaultProps ?? {})
        return Object.fromEntries(
          keys.map((key) => [
            key,
            props[key] ?? input.defaultProps?.[key] ?? null
          ])
        )
      }),
      distinctUntilChanged(shallowEqual),
      tap({ next: () => loading$.next(true) }),
      map(props => combineStreams(props)),
      switchMap(({ loadings, values }) => {
        const loadingsArr = Object.values(loadings)
        return combineLatest({
          loadings: loadingsArr.length > 0 ? combineLatest([...loadingsArr]).pipe(
            tap({ next: (loadings) => loading$.next(loadings.some(loading => loading)) })
          ) : of([]),
          props: Object.keys(values).length > 0 ? combineLatest(values) : of({})
        })
      }),
      map(({ props }) => /** @type {Props<P & IP>} */(props))
    )

    const props = new Proxy(/** @type {ExpandedProps<P & IP>} */({}), {
      get: (_, key) => {
        return props$.pipe(
          map(props => props[/** @type {string} */(key)]),
          distinctUntilChanged(),
        )
      }
    })

    let loadings, values$

    if ('pipe' in input) {
      console.debug(`${input.name}.pipe`)
      const data = input.pipe({ props$, props })
      let combined = combineStreams(data)
      values$ = combineLatest(combined.values)
      loadings = combined.loadings
    } else {
      values$ = props$
      loadings = [loading$.asObservable()]
    }

    /** @type {*} */
    const functions = {
      value: {},
      memo: {}
    }

    return merge(
      combineLatest([loading$.pipe(distinctUntilChanged(), debounceTime(1)), ...Object.values(loadings)]).pipe(
        filter(() => !!input.placeholder),
        map(loadings => ({ isLoading: loadings.some(value => value), values: null })),
        distinctUntilChanged((a, b) => a.isLoading === b.isLoading),
        filter(({ isLoading }) => isLoading),
        debounceTime(1),
        tap(() => console.debug(`${input.name}.placeholder`)),
        map(() => /** @type {() => Element} */(input.placeholder)()),
      ),
      values$.pipe(
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
        tap(({ values }) => console.debug(`${input.name}.render`, values)),
        map(({ values }) => input.render(/** @type {*} */(values))),
      )
    ).pipe(
      map(raw => toRenderNode(raw))
    )

  }

  componentFn.displayName = input.name
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
export function defer(value) {
  return new Stream(value)
}

/**
 * @param {Observable<unknown>} value 
 * 
 */
export function loading(value) {
  if (value instanceof ActivityAwareObservable)
    return value.pending$.pipe(distinctUntilChanged(), debounceTime(1))
  return aware(of(false))
}

/**
 * @template T
 * @param {Observable<T>} observable 
 * @returns {Observable<T>}
 */
export function aware(observable) {
  if (observable instanceof ActivityAwareObservable) return observable
  return new ActivityAwareObservable(new BehaviorSubject(true), observer => {
    const subscription = new Subscription()
    const state = new Subject()
    subscription.add(observable.subscribe(state))
    subscription.add(state.subscribe(observer))
    return subscription
  })
}

export { combineLatest as combine } from "rxjs"

/**
 * @param {Record<string, *>} data 
 * @returns {{ loadings: Record<string, Observable<boolean>>, values: Record<string, Observable<*>> }}
 */
function combineStreams(data) {
  return Object.entries(data).reduce(
    ({ loadings, values }, [key, value]) => {
      if (value instanceof ActivityAwareObservable || value instanceof State) {
        return {
          loadings: {
            ...loadings,
            [key]: value.pending$.pipe(distinctUntilChanged(), debounceTime(1)),
          },
          values: {
            ...values,
            [key]: value.pipe(tap({ next: () => value.pending$.next(false), finalize: () => value.pending$.next(false) })),
          }
        }
      }
      if (value instanceof Stream) {
        return {
          loadings,
          values: {
            ...values,
            [key]: of(aware(value.value$))
          }
        }
      }
      if (isObservable(value)) {
        return {
          loadings,
          values: {
            ...values,
            [key]: aware(value)
          }
        }
      }
      return {
        loadings,
        values: {
          ...values,
          [key]: of(value)
        }
      }
    },
    { loadings: {}, values: {} }
  )
}
