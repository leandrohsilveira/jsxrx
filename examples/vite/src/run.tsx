import { pending, Props, PropsWithChildren, state, Suspense } from "@jsxrx/core"
import { createRoot } from "@jsxrx/core/dom"
import { delay, map, Observable } from "rxjs"

function App() {
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

type CountDisplayProps = PropsWithChildren<{
  count?: number
}>

function CountDisplay(input$: Observable<CountDisplayProps>) {
  const { count, children } = Props.take(input$, { count: 0 })

  return (
    <>
      <Suspense fallback={<div>Loading count...</div>}>
        <div>The count is {count}</div>
      </Suspense>
      {children}
    </>
  )
}

createRoot(document.querySelector("[root]")).mount(<App />)
