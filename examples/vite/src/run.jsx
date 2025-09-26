import { component, defer, loading, render, state } from "@jsxrx/core"
import { delay, interval } from "rxjs"

const root = document.querySelector('[root]')

if (!root) throw new Error('Root element not found')

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

render(
  <App />,
  root
)
