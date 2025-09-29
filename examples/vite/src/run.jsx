import { render } from "@jsxrx/core"
import { BehaviorSubject, delay, map, switchMap, tap } from "rxjs"

function App() {
  const count = new BehaviorSubject(0)

  function increase() {
    count.next(count.value + 1)
  }

  function decrease() {
    count.next(count.value - 1)
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

/**
 * @param {import("rxjs").Observable<import("@jsxrx/core").Inputs<import("@jsxrx/core").PropsWithChildren<{ count: number }>>>} input$
 */
function CountDisplay(input$) {
  return input$.pipe(
    switchMap(input => input.props$),
    map(({ count = 0, children }) => (
      <>
        <div>The count is {count}</div>
        {children}
      </>
    )),
  )
}

CountDisplay.placeholder = () => <div>Loading count...</div>

const root = document.querySelector("[root]")

const vdom = render(<App />, root)

await vdom.subscribe()

console.log("VDOM Ready", vdom)
