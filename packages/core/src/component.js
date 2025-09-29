/**
 * @import { Observable } from "rxjs"
 * @import { Component, IState, IStream, ComponentInputRender, ComponentInputPipe, Data } from "./jsx"
 */

import {
  BehaviorSubject,
  combineLatest,
  debounceTime,
  distinctUntilChanged,
  isObservable,
  map,
  of,
  Subject,
  Subscription,
  switchMap,
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
 * @param {ComponentInputPipe<P, IP, D> | ComponentInputRender<P & IP, IP>} componentInput
 * @returns {Component<P>}
 */
export function component(componentInput) {
  /** @type {Component<P & IP>} */
  const componentFn = input$ => {
    /** @type {Observable<*>} */
    let values$

    if ("pipe" in componentInput) {
      console.debug(`${componentInput.name}.pipe`)
      values$ = componentInput.pipe(input$).pipe(
        map(data => combineStreams(/** @type {*} */ (data))),
        switchMap(
          combined =>
            /** @type {Observable<Data<D>>} */ (combineLatest(combined)),
        ),
        distinctUntilChanged(compareProps),
      )
    } else {
      values$ = input$.pipe(
        switchMap(({ props$ }) => props$),
        debounceTime(1),
      )
    }

    return values$.pipe(
      tap(values => console.debug(`${componentInput.name}.render`, values)),
      map(values => componentInput.render(/** @type {*} */ (values))),
    )
  }

  componentFn.displayName = componentInput.name
  componentFn.defaultProps = componentInput.defaultProps
  componentFn.placeholder = componentInput.placeholder

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
 * @param {*} data
 * @returns {Record<string, Observable<*>>}
 */
function combineStreams(data) {
  return Object.fromEntries(
    Object.entries(/** @type {Record<string, *>} */ (data)).map(
      ([key, value]) => {
        if (isRenderNode(value)) {
          return [key, of(value)]
        }
        if (
          value instanceof ActivityAwareObservable ||
          value instanceof State
        ) {
          return [
            key,
            value.pipe(
              tap({
                next: () => value.pending$.next(false),
                finalize: () => value.pending$.next(false),
              }),
            ),
          ]
        }
        if (value instanceof Stream) {
          return [key, of(aware(value.value$))]
        }
        if (isObservable(value)) {
          return [key, aware(value)]
        }
        return [key, of(value)]
      },
    ),
  )
}
