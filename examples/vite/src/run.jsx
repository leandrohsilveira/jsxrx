import { component, render, state, stream } from "@jsxrx/core"
import { delay } from "rxjs"

const root = document.querySelector('[root]')

if (!root) throw new Error('Root element not found')

/**
 * @type {import("@jsxrx/core").Component<{ text: string }>}
 */
const App = component({
  name: 'App',
  pipe() {
    console.log('Component.load')
    const count = state(0)
    return {
      count: stream(count.pipe(delay(1000))),
      increase() {
        count.set(count.value + 1)
      },
      decrease() {
        count.set(count.value - 1)
      }
    }
  },
  render({ count, increase, decrease }) {
    console.log('Component.render')
    return (
      <header className="header">
        <CountDisplay count={count} />
        <button type="button" onClick={increase}>Increase</button>
        <button type="button" onClick={decrease}>Decrease</button>
      </header>
    )
  },
  placeholder() {
    return <div>Loading Application...</div>
  }
})

/** 
 * @type {import("@jsxrx/core").Component<{ count: number }>} 
 */
const CountDisplay = component({
  name: 'CountDisplay',
  pipe({ props: { count } }) {
    console.log('CountDisplay.load')
    return {
      count
    }
  },
  render({ count }) {
    console.log('CountDisplay.render', count)
    return (
      <div>The count is {count}</div>
    )
  },
  placeholder() {
    return <div>Loading...</div>
  }
})

render(
  <App text="Hello world" />,
  root
)
