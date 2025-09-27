import { component, defer, render, state } from "@jsxrx/core"
import { delay } from "rxjs"

const root = document.querySelector('[root]')

/**
 * @type {import("@jsxrx/core").Component<{}>}
 */
const App = component({
  name: 'App',
  pipe() {
    const count = state(0)
    const delayedCount = count.pipe(delay(1000))
    return {
      count: defer(delayedCount),
      isLoading: false,
      increase() {
        count.set(count.value + 1)
      },
      decrease() {
        count.set(count.value - 1)
      }
    }
  },
  render({ count, isLoading, increase, decrease }) {
    return (
      <>
        <CountDisplay count={count}>
          <button type="button" disabled={isLoading} onClick={increase}>Increase</button>
          <button type="button" disabled={isLoading} onClick={decrease}>Decrease</button>
        </CountDisplay>
      </>
    )
  },
  placeholder() {
    return <div>Loading Application...</div>
  }
})

/** 
 * @type {import("@jsxrx/core").Component<import("@jsxrx/core").PropsWithChildren<{ count?: number }>>} 
 */
const CountDisplay = component({
  name: 'CountDisplay',
  render: ({ count = 0, children }) => (
    <>
      <div>The count is {count}</div>
      {children}
    </>
  ),
  placeholder: () => <div>Loading count...</div>
})

const vdom = render(
  <App />,
  root
)

await vdom.subscribe()

console.log('VDOM Ready', vdom)
