import {
  combine,
  loading,
  props,
  PropsWithChildren,
  render,
  state,
} from "@jsxrx/core"
import { delay, map, Observable, tap } from "rxjs"

function App() {
  const count = state(0)

  function increase() {
    count.set(count.value + 1)
  }

  function decrease() {
    count.set(count.value - 1)
  }

  return (
    <CountDisplay
      count={count.pipe(
        delay(1000),
        tap(() => console.log("state emitted")),
      )}
    >
      <button type="button" onClick={increase}>
        Increase
      </button>
      <button type="button" onClick={decrease}>
        Decrease
      </button>
    </CountDisplay>
  )
}

function CountDisplay(
  input$: Observable<PropsWithChildren<{ count?: number }>>,
) {
  const { count, children } = props(input$)
  const isLoading = loading(count)
  return combine({ isLoading, count, children }).pipe(
    map(({ count = 0, children, isLoading }) => {
      if (isLoading) return <div>Loading count......</div>
      return (
        <>
          <div>The count is {count}</div>
          {children}
        </>
      )
    }),
  )
}

CountDisplay.placeholder = () => <div>Loading count...</div>

const root = document.querySelector("[root]")

const vdom = render(<App />, root)

await vdom.subscribe()

console.log("VDOM Ready", vdom)
