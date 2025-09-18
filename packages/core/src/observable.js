import { BehaviorSubject, take } from "rxjs";

/**
 * @template T
 * @extends {BehaviorSubject<T>}
 */
export class State extends BehaviorSubject {

  kind = Symbol('state')

  #pending$ = new BehaviorSubject(false)

  pending$ = this.#pending$.asObservable()

  /**
   * @param {T} value 
   */
  next(value) {
    this.#pending$.next(true)
    this.pipe(take(1)).subscribe({
      complete: () => this.#pending$.next(false),
    })
    super.next(value)
  }

  /**
   * @param {T} value 
   */
  set(value) {
    this.next(value)
  }

}
