/**
 * @import { Subject, Subscriber, TeardownLogic } from "rxjs"
 * @import { IState, IStream } from "./jsx"
 */

import { BehaviorSubject, Observable, shareReplay, Subscription, tap } from "rxjs";

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
        return this.#pipe$.pipe(tap(() => this.pending$.next(true))).subscribe(subscriber)
      }
    )
    this.#subscriptions = new Subscription()
    this.#value$ = new BehaviorSubject(initial)
    this.#pipe$ = this.#value$.pipe(shareReplay())
  }

  #subscriptions
  #value$
  #pipe$

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

