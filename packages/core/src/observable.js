/**
 * @import { Subject, Subscriber, TeardownLogic } from "rxjs"
 * @import { IState, IStream } from "./jsx"
 */

import { BehaviorSubject, debounceTime, distinctUntilChanged, isObservable, Observable, of, Subscription, tap } from "rxjs";

/**
 * @template T
 * @extends {Observable<T>}
 */
export class ActivityAwareObservable extends Observable {
  /**
   * @param {Subject<boolean>} pending$ 
   * @param {(this: Observable<T>, subscribe: Subscriber<T>) => TeardownLogic} [subscribe]
   */
  constructor(pending$, subscribe) {
    super(subscribe)
    this.pending$ = pending$
  }

  /**
   * @param {...*} operators 
   */
  pipe(...operators) {
    return new ActivityAwareObservable(
      this.pending$,
      (subscriber) => {
        return /** @type {*} */(super.pipe)(
          ...operators
        ).subscribe(subscriber)
      }
    )
  }
}

/**
 * @template T
 * @extends {ActivityAwareObservable<T>}
 * @implements {IState<T>}
 */
export class State extends ActivityAwareObservable {

  /**
   * @param {T} initial 
   * @param {BehaviorSubject<boolean>} [pending$]
   */
  constructor(initial, pending$) {
    super(
      pending$ ?? new BehaviorSubject(false),
      subscriber => {
        this.#subscriptions.add(subscriber)
        return this.#value$.pipe(tap(() => this.pending$.next(true))).subscribe(subscriber)
      }
    )
    this.#subscriptions = new Subscription()
    this.#value$ = new BehaviorSubject(initial)
  }

  #subscriptions
  #value$

  get value() {
    return this.#value$.value
  }

  /**
   * @param {T} value 
   */
  set(value) {
    this.#value$.next(value)
  }

}

/**
 * @template T
 * @implements {IStream<T>}
 */
export class Stream {

  /**
   * @param {Observable<T>} value$ 
   */
  constructor(value$) {
    this.value$ = value$
  }

  /** @type {'stream'} */
  kind = 'stream'

}

/**
 * @param {Record<string, *>} data 
 * @returns {{ loadings: Record<string, Observable<boolean>>, values: Record<string, Observable<*>> }}
 */
export function combineStreams(data) {
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
            [key]: of(value.value$)
          }
        }
      }
      if (isObservable(value)) {
        return {
          loadings,
          values: {
            ...values,
            [key]: value
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
