import { component, defer, loading, render, state } from "@jsxrx/core"
import { delay, interval } from "rxjs"

const root = document.querySelector('[root]')

if (!root) throw new Error('Root element not found')

const App = component({
  name: 'App',
  pipe() {
    const count = state(0)
    const delayedCount = count.pipe(delay(1000))
    return {
      time: defer(interval(1000)),
      count: defer(delayedCount),
      isLoading: loading(delayedCount),
      increase() {
        count.set(count.value + 1)
      },
      decrease() {
        count.set(count.value - 1)
      }
    }
  },
  render({ count, time, isLoading, increase, decrease }) {
    return (
      <header className="header">
        <CountDisplay count={count} />
        <EllapsedTime time={time} />
        <button type="button" disabled={isLoading} onClick={increase}>Increase</button>
        <button type="button" disabled={isLoading} onClick={decrease}>Decrease</button>
      </header>
    )
  },
  placeholder() {
    return <div>Loading Application...</div>
  }
})

/** 
 * @type {import("@jsxrx/core").Component<{ count?: number }>} 
 */
const CountDisplay = component({
  name: 'CountDisplay',
  render: ({ count = 0 }) => <div>The count is {count}</div>,
  placeholder: () => <div>Loading count...</div>
})

/** @type {import("@jsxrx/core").Component<{ time: number }>} */
const EllapsedTime = component({
  name: 'EllapsedTime',
  render: ({ time }) => <div>Ellapsed time: {time} {time > 1 ? 'seconds' : 'second'}</div>,
  placeholder: () => <div>Loading time...</div>
})

render(
  <App />,
  root
)
