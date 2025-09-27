/**
 * @import { Observable } from "rxjs"
 * @import { Component, IState, IStream, ComponentInputRender, ComponentInputPipe, ElementNode } from "./jsx"
 */

import {
  BehaviorSubject,
  combineLatest,
  debounceTime,
  distinctUntilChanged,
  filter,
  isObservable,
  map,
  merge,
  of,
  Subject,
  Subscription,
  tap,
} from "rxjs"
import { ActivityAwareObservable, State, Stream } from "./observable"
import { compareProps, isRenderNode } from "./vdom"

/**
 * @template P
 * @template D
 * @template {P} [IP=P]
 * @overload
 * @param {ComponentInputPipe<P, IP, D>} input
 * @returns {Component<P>}
 */
/**
 * @template P
 * @template {P} [IP=P]
 * @overload
 * @param {ComponentInputRender<P & IP, IP>} input
 * @returns {Component<P>}
 */
/**
 * @template P
 * @template D
 * @template {P} [IP=P]
 * @param {ComponentInputPipe<P, IP, D> | ComponentInputRender<P & IP, IP>} input
 * @returns {Component<P>}
 */
export function component(input) {
  /** @type {Component<Record<string, *>>} */
  const componentFn = ({ props, props$, context }) => {
    const loading$ = new BehaviorSubject(true)

    let loadings, values$

    if ("pipe" in input) {
      console.debug(`${input.name}.pipe`)
      const data = /** @type {*} */ (input).pipe({ props$, props, context })
      let combined = combineStreams(data)
      values$ = combineLatest(combined.values)
      loadings = combined.loadings
    } else {
      values$ = props$
      loadings = [loading$.asObservable()]
    }

    return merge(
      combineLatest([
        loading$.pipe(distinctUntilChanged(), debounceTime(1)),
        ...Object.values(loadings),
      ]).pipe(
        filter(() => !!input.placeholder),
        map(loadings => ({
          isLoading: loadings.some(value => value),
          values: null,
        })),
        distinctUntilChanged((a, b) => a.isLoading === b.isLoading),
        filter(({ isLoading }) => isLoading),
        debounceTime(1),
        tap(() => console.debug(`${input.name}.placeholder`)),
        map(() => /** @type {() => ElementNode} */ (input.placeholder)()),
      ),
      values$.pipe(
        debounceTime(1),
        tap({
          next: () => loading$.next(false),
          finalize: () => loading$.next(false),
        }),
        distinctUntilChanged(compareProps),
        map(values => ({ isLoading: false, values })),
        tap(({ values }) => console.debug(`${input.name}.render`, values)),
        map(({ values }) => input.render(/** @type {*} */ (values))),
      ),
    )
  }

  componentFn.displayName = input.name
  componentFn.defaultProps = input.defaultProps

  return /** @type {Component<P>} */ (componentFn)
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
  return of(false)
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
      if (isRenderNode(value)) {
        return {
          loadings,
          values: {
            ...values,
            [key]: of(value),
          },
        }
      }
      if (value instanceof ActivityAwareObservable || value instanceof State) {
        return {
          loadings: {
            ...loadings,
            [key]: value.pending$.pipe(distinctUntilChanged(), debounceTime(1)),
          },
          values: {
            ...values,
            [key]: value.pipe(
              tap({
                next: () => value.pending$.next(false),
                finalize: () => value.pending$.next(false),
              }),
            ),
          },
        }
      }
      if (value instanceof Stream) {
        return {
          loadings,
          values: {
            ...values,
            [key]: of(aware(value.value$)),
          },
        }
      }
      if (isObservable(value)) {
        return {
          loadings,
          values: {
            ...values,
            [key]: aware(value),
          },
        }
      }
      return {
        loadings,
        values: {
          ...values,
          [key]: of(value),
        },
      }
    },
    { loadings: {}, values: {} },
  )
}
