import { state, pending, Suspense } from "@jsxrx/core"
import { delay, map } from "rxjs"
import CountDisplay from "./CountDisplay.js"

export default function App() {
  const count$ = state(0)

  const delayedCount$ = count$.pipe(delay(1000))

  const countPending$ = pending(delayedCount$)

  function increase() {
    count$.set(count$.value + 1)
  }

  function decrease() {
    count$.set(count$.value - 1)
  }

  return (
    <CountDisplay count={delayedCount$}>
      <Suspense fallback={<div>Count is ?</div>}>
        {delayedCount$.pipe(
          map(count =>
            count % 2 === 0 ? (
              <div>Count is even</div>
            ) : (
              <div>Count is odd</div>
            ),
          ),
        )}
      </Suspense>
      <button type="button" disabled={countPending$} onClick={increase}>
        Increase
      </button>
      <button type="button" disabled={countPending$} onClick={decrease}>
        Decrease
      </button>
    </CountDisplay>
  )
}
