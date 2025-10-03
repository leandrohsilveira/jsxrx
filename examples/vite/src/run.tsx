import { loading, props, PropsWithChildren, render, state } from "@jsxrx/core"
import { delay, Observable, shareReplay } from "rxjs"

function App() {
  const count = state(0)

  const delayedCount = count.pipe(delay(1000), shareReplay())
  const countLoading = loading(delayedCount)

  function increase() {
    count.set(count.value + 1)
  }

  function decrease() {
    count.set(count.value - 1)
  }

  return (
    <CountDisplay count={delayedCount}>
      <button type="button" disabled={countLoading} onClick={increase}>
        Increase
      </button>
      <button type="button" disabled={countLoading} onClick={decrease}>
        Decrease
      </button>
    </CountDisplay>
  )
}

App.placeholder = () => <div>Loading application...</div>

function CountDisplay(
  input$: Observable<PropsWithChildren<{ count?: number }>>,
) {
  const { count, children } = props(input$)
  return (
    <>
      <div>The count is {count}</div>
      {children}
    </>
  )
}

CountDisplay.placeholder = () => <div>Loading count...</div>

const root = document.querySelector("[root]")

const vdom = render(<App />, root)

await vdom.subscribe()

console.log("VDOM Ready", vdom)
