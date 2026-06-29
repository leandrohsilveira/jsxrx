/**
 * @import { Operator } from "rxjs"
 * @import { IState, IDeferred as IDeferred, CombineOutput, Properties, ComponentInstance, InputTake, Ref, AsyncState, PendingState, InputSpread } from "./jsx"
 */

import { assert, shallowComparator } from "@jsxrx/utils"
import {
  BehaviorSubject,
  combineLatest,
  debounceTime,
  distinctUntilChanged,
  filter,
  isObservable,
  map,
  Observable,
  of,
  pipe,
  share,
  shareReplay,
  Subscription,
  switchMap,
  tap,
} from "rxjs"
import { compareProps, isRenderNode } from "./vdom"

/**
 * @template T
 * @extends {Observable<T>}
 */
export class ObservableDelegate extends Observable {
  /**
   * @param {Observable<T>} observable
   * @param {Observable<unknown>} [source]
   */
  constructor(observable, source) {
    super()
    this.#delegate = observable
    this.source = source ?? observable
    this.operator = observable.operator
  }

  #delegate

  /**
   * @param {(value: T) => void} each
   */
  forEach(each) {
    return this.#delegate.forEach(each)
  }

  /**
   * @template R
   * @param {Operator<T, R>} [operator]
   */
  lift(operator) {
    return this.#delegate.lift(operator)
  }

  toPromise() {
    return this.#delegate.toPromise()
  }

  // @ts-expect-error vararg
  pipe(...operators) {
    return new ObservableDelegate(
      this.#delegate.pipe(
        // @ts-expect-error vararg
        ...operators,
        shareReplay({ refCount: true, bufferSize: 1 }),
      ),
      this.source,
    )
  }

  // @ts-expect-error vararg
  subscribe(...args) {
    return this.#delegate.subscribe(...args)
  }
}

/**
 * @template T
 * @extends {Observable<T>}
 */
export class ActivityAwareObservable extends Observable {
  /**
   * @param {Observable<T>} observable
   * @param {Observable<boolean>} pending$
   */
  constructor(observable, pending$) {
    super()
    this.#delegate = observable
    this.operator = observable.operator
    this.pending$ = pending$
  }

  #delegate

  /**
   * @param {(value: T) => void} each
   */
  forEach(each) {
    return this.#delegate.forEach(each)
  }

  /**
   * @template R
   * @param {Operator<T, R>} [operator]
   */
  lift(operator) {
    return this.#delegate.lift(operator)
  }

  toPromise() {
    return this.#delegate.toPromise()
  }

  // @ts-expect-error vararg
  pipe(...operators) {
    return new ActivityAwareObservable(
      this.#delegate.pipe(
        // @ts-expect-error vararg
        ...operators,
        shareReplay({ refCount: true, bufferSize: 1 }),
      ),
      this.pending$,
    )
  }

  // @ts-expect-error vararg
  subscribe(...args) {
    return this.#delegate.subscribe(...args)
  }
}

/**
 * @template T
 * @extends {ObservableDelegate<T>}
 */
export class Input extends ObservableDelegate {
  /**
   * @template T
   * @param {Observable<T>} input$
   * @returns {Input<T>}
   */
  static from(input$) {
    assert(
      input$ instanceof Input,
      "Input.from() argument must be the component's function first parameter, an observable instance of Input class",
    )
    return input$
  }

  /**
   * @param {Observable<Properties<T>>} props$
   * @param {ComponentInstance} instance
   */
  constructor(props$, instance) {
    super(
      props$.pipe(
        debounceTime(1),
        switchMap(props =>
          combineLatest(
            /** @type {{ [K in keyof T]: Observable<T[K]> }} */ (
              Object.fromEntries(
                Object.entries(props).map(([key, value]) => {
                  if (isObservable(value)) return [key, value]
                  return [key, of(value)]
                }),
              )
            ),
          ),
        ),
        distinctUntilChanged(compareProps),
      ),
    )
    const unmounted$ = new BehaviorSubject(false)
    this.unmounted$ = unmounted$.pipe(filter(value => value))
    this.#props$ = props$
    this.context = instance.context
    this.subscription = new Subscription(() => {
      unmounted$.next(true)
      unmounted$.complete()
    })
  }

  #props$

  /**
   * @template [D=T]
   * @param {D} [defaultProps]
   * @returns {InputTake<T & D>}
   */
  take(defaultProps) {
    return this.#take(null, "suffix", defaultProps)
  }

  /**
   * @template [D=T]
   * @param {D} [defaultProps]
   * @returns {Observable<InputSpread<T & D>>}
   */
  spread(defaultProps) {
    return this.#props$.pipe(
      map(props => Object.keys(props)),
      debounceTime(1),
      distinctUntilChanged(shallowComparator),
      map(keys => /** */ this.#take(keys, "plain", defaultProps)),
    )
  }

  /**
   * @param {Subscription} subscription
   */
  observe(subscription) {
    this.subscription.add(subscription)
  }

  /**
   * @template [D=T]
   * @overload
   * @param {(string | symbol)[] | null} keys
   * @param {'suffix'} namingStrategy
   * @param {D} [defaultProps]
   * @returns {InputTake<T & D>}
   */
  /**
   * @template [D=T]
   * @overload
   * @param {(string | symbol)[] | null} keys
   * @param {'plain'} namingStrategy
   * @param {D} [defaultProps]
   * @returns {InputSpread<T & D>}
   */
  /**
  /**
   * @template [D=T]
    * @overload
   * @param {(string | symbol)[] | null} keys
   * @param {'plain' | 'suffix'} namingStrategy
    * @param {D} [defaultProps]
   * @returns {InputTake<T & D>  | InputSpread<T & D>}
   */
  /**
   * @template [D=T]
   * @param {(string | symbol)[] | null} keys
   * @param {'plain' | 'suffix'} namingStrategy
   * @param {D} [defaultProps]
   * @returns {InputTake<T & D> | InputSpread<T & D>}
   */
  #take(keys, namingStrategy, defaultProps) {
    return new Proxy(/** @type {InputTake<T & D>} */ ({}), {
      get: (_, key) => {
        const name =
          namingStrategy === "suffix"
            ? String(key).replace(/\$$/, "")
            : String(key)
        const defValue = /** @type {*} */ (defaultProps)?.[name]
        const props$ = /** @type {Observable<*>} */ (this.#props$)
        return toActivityAware(attach =>
          props$.pipe(
            switchMap(props => {
              const value = /** @type {*} */ (props[name])
              if (isRef(value)) return of(value)
              if (isObservable(value))
                return attach(value.pipe(map(value => value ?? defValue)))
              return of(value ?? defValue)
            }),
            distinctUntilChanged(),
          ),
        )
      },
      getOwnPropertyDescriptor(_, p) {
        if (!keys)
          throw new Error(
            "take() object does not support spreading, use spread() instead",
          )
        if (keys.indexOf(p) < 0)
          return {
            writable: false,
            enumerable: false,
            configurable: false,
          }
        return {
          writable: false,
          enumerable: true,
          configurable: true,
        }
      },
      ownKeys() {
        return keys ?? []
      },
      has(_, key) {
        if (keys === null)
          throw new Error(
            "take() object does not support spreading, use spread() instead",
          )
        return keys.indexOf(key) >= 0
      },
    })
  }
}

/**
 * @template T
 * @extends {ObservableDelegate<T>}
 * @implements {IState<T>}
 */
export class State extends ObservableDelegate {
  /**
   * @param {BehaviorSubject<T>} value$
   */
  constructor(value$) {
    super(value$.asObservable(), value$.asObservable())
    this.#value$ = value$
  }

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
 * @implements {Ref<T>}
 */
export class ElementRef {
  /**
   * @param {new () => T} _
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_) {
    this.current = new BehaviorSubject(/** @type {T | null} */ (null))
  }

  /** @type {"ref"} */
  kind = "ref"
}

/**
 * @template T
 * @implements {IDeferred<T>}
 */
export class Defer {
  /**
   * @param {Observable<T>} value$
   */
  constructor(value$) {
    this.value$ = value$
  }

  /** @type {'stream'} */
  kind = "stream"
}

/**
 * @template T
 * @param {unknown} value
 * @returns {value is ObservableDelegate<T>}
 */
export function isObservableDelegate(value) {
  return value instanceof ObservableDelegate || value instanceof State
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
    ).pipe(debounceTime(1), distinctUntilChanged(shallowComparator), share())
  )
}

/**
 * @param {Observable<unknown> | AsyncState<unknown>} value
 * @param {number} [debounce=5]
 * @returns {Observable<boolean>}
 */
export function pending(value, debounce = 5) {
  if (isAsyncState(value)) {
    return value.pending$.pipe(debounceTime(debounce), distinctUntilChanged())
  }
  if (isActivityAwareObservable(value)) {
    return value.pending$.pipe(debounceTime(debounce), distinctUntilChanged())
  }
  const pending$ = new BehaviorSubject(true)

  return new Observable(subscriber => {
    subscriber.add(
      value.subscribe(value => {
        if (isPendingState(value)) pending$.next(value.state === "pending")
        else pending$.next(false)
      }),
    )
    return pending$.pipe(distinctUntilChanged()).subscribe(subscriber)
  })
}

export function activity() {
  const pending$ = new BehaviorSubject(true)
  return {
    pending$: pending$.pipe(distinctUntilChanged()),
    /**
     * @template T
     * @returns {import("rxjs").MonoTypeOperatorFunction<T>}
     */
    start() {
      return tap({
        next: () => pending$.next(true),
        error: () => pending$.next(false),
        complete: () => pending$.next(false),
      })
    },

    /**
     * @template T
     * @returns {import("rxjs").MonoTypeOperatorFunction<T>}
     */
    complete() {
      return tap({
        next: () => pending$.next(false),
        error: () => pending$.next(false),
        complete: () => pending$.next(false),
      })
    },
    /**
     * @template T
     *  @param {Observable<T>} observable
     *  @returns {Observable<T>}
     */
    toObservable(observable) {
      return new ActivityAwareObservable(observable, pending$)
    },
    /**
     * @template T
     * @template R
     * @param {import("rxjs").OperatorFunction<T, R>} operator
     * @returns {import("rxjs").OperatorFunction<T, R>}
     */
    pipe(operator) {
      return pipe(this.start(), operator, this.complete())
    },
  }
}

/**
 * @template T
 * @param {(attach: (observable: Observable<*>) => Observable<T>) => Observable<T>} attacher
 * @returns {Observable<T>}
 */
export function toActivityAware(attacher) {
  const pending$ = new BehaviorSubject(false)

  return new ActivityAwareObservable(
    attacher(observable => {
      if (isActivityAwareObservable(observable)) {
        return new Observable(subscriber => {
          subscriber.add(observable.subscribe(subscriber))
          subscriber.add(observable.pending$.subscribe(pending$))

          return subscriber
        })
      }
      return observable
    }),
    pending$,
  )
}

/**
 * @template T
 * @param {unknown} value
 * @returns {value is Ref<T>}
 */
export function isRef(value) {
  return value instanceof ElementRef
}

/**
 * @template [T=unknown]
 * @param {unknown} value
 * @returns {value is AsyncState<T>}
 */
export function isAsyncState(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    "kind" in value &&
    value.kind === "async" &&
    "state$" in value &&
    isObservable(value.state$)
  )
}

/**
 * @param {unknown} observable
 */
export function isActivityAwareObservable(observable) {
  return observable instanceof ActivityAwareObservable
}

/**
 * @template [T=unknown]
 * @param {unknown} value
 * @returns {value is PendingState<T>}
 */
function isPendingState(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    "state" in value &&
    typeof value.state === "string" &&
    /^idle|pending|success|error$/.test(value.state) &&
    "value" in value &&
    "error" in value
  )
}
