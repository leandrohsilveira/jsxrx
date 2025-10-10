/**
 * @import { Operator } from "rxjs"
 * @import { IState, IDeferred as IDeferred, CombineOutput, Properties, ComponentInstance, InputTake, Ref, AsyncState, PendingState } from "./jsx"
 */

import { assert, shallowEqual } from "@jsxrx/utils"
import {
  BehaviorSubject,
  combineLatest,
  debounceTime,
  distinctUntilChanged,
  filter,
  isObservable,
  map,
  merge,
  Observable,
  of,
  share,
  startWith,
  Subscription,
  switchMap,
  tap,
} from "rxjs"
import { compareProps, isRenderNode } from "./vdom"

/**
 * @template T
 * @extends {Observable<T>}
 */
class ObservableDelegate extends Observable {
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
    return this.#take(null, defaultProps)
  }

  /**
   * @template [D=T]
   * @param {D} [defaultProps]
   * @returns {Observable<InputTake<T & D>>}
   */
  spread(defaultProps) {
    return this.#props$.pipe(
      map(props => Object.keys(props)),
      debounceTime(1),
      distinctUntilChanged(shallowEqual),
      map(keys => this.#take(keys, defaultProps)),
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
   * @param {(string | symbol)[] | null} keys
   * @param {D} [defaultProps]
   * @returns {InputTake<T & D>}
   */
  #take(keys, defaultProps) {
    return new Proxy(/** @type {InputTake<T & D>} */ ({}), {
      get: (_, key) => {
        const name = String(key)
        const defValue = /** @type {*} */ (defaultProps)?.[name]
        const props$ = /** @type {Observable<*>} */ (this.#props$)
        return new ObservableDelegate(
          props$.pipe(
            debounceTime(1),
            switchMap(props => {
              const value = /** @type {*} */ (props[name])
              if (value instanceof ElementRef) return of(value)
              if (isObservable(value))
                return value.pipe(map(value => value ?? defValue))
              return of(value ?? defValue)
            }),
            distinctUntilChanged(),
          ),
          props$.pipe(
            debounceTime(1),
            switchMap(props => {
              const value = /** @type {*} */ (props[name])
              if (isObservableDelegate(value)) return value.source
              if (isObservable(value)) return value
              return of(value)
            }),
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
 * @extends {State<T | null>}
 * @implements {Ref<T>}
 */
export class ElementRef extends State {
  /**
   * @param {new () => T} _
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_) {
    super(new BehaviorSubject(/** @type {T | null} */ (null)))
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
    ).pipe(debounceTime(1), distinctUntilChanged(shallowEqual), share())
  )
}

/**
 * @param {Observable<unknown> | AsyncState<unknown>} value
 * @param {number} [debounce=5]
 * @returns {Observable<boolean>}
 */
export function pending(value, debounce = 5) {
  if (isAsyncState(value)) {
    return value.state$.pipe(
      map(val => val.state === "pending"),
      distinctUntilChanged(),
    )
  }
  if (isObservableDelegate(value)) {
    const pending$ = new BehaviorSubject(true)
    const observed = value.source.pipe(tap(() => pending$.next(true)))
    return merge(
      observed,
      value.pipe(
        debounceTime(1),
        tap({
          next: () => pending$.next(false),
          error: () => pending$.next(false),
        }),
        filter(() => false),
      ),
      pending$,
    ).pipe(
      filter(value => typeof value === "boolean"),
      debounceTime(debounce),
      distinctUntilChanged(),
    )
  }
  return value.pipe(
    map(value => {
      if (isPendingState(value)) return value.state === "pending"
      return false
    }),
    debounceTime(1),
    startWith(false),
    distinctUntilChanged(),
  )
}

/**
 * @template T
 * @param {Observable<PendingState<T>>} state$
 */
export function asyncValue(state$) {
  return state$.pipe(
    filter(result => result.state === "success"),
    map(result => result.value),
  )
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
