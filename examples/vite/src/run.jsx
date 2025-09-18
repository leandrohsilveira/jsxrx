import { component, render, state } from "@jsxrx/core"
import { delay } from "rxjs"

const root = document.querySelector('[root]')

if (!root) throw new Error('Root element not found')

/**
 * @type {import("@jsxrx/core").Component<{ text: string }>}
 */
const Component = component({
  pipe({ props: { text } }) {
    console.log('Component.load')
    const count = state(0)
    return {
      text,
      count: count.pipe(delay(1000)),
      increase() {
        count.next(count.value + 1)
      },
      decrease() {
        count.next(count.value - 1)
      }
    }
  },
  render({ text, count, increase, decrease }) {
    console.log('Component.render', text, count)
    if (!text) return 'No text provided'
    return (
      <header className="header">
        <h1 className="test">{text}</h1>
        <TextDescription text={text} />
        <CountDisplay count={count} />
        {count % 2 === 0 ? <div>The count is even</div> : <div>The count is odd</div>}
        <button type="button" onClick={increase}>Increase</button>
        <button type="button" onClick={decrease}>Decrease</button>
      </header>
    )
  },
  placeholder() {
    console.log('Component.placeholder')
    return (
      <div>Loading...</div>
    )
  }
})

/** 
 * @type {import("@jsxrx/core").Component<{ count: number }>} 
 */
const CountDisplay = component({
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
  }
})

/**
 * @type {import("@jsxrx/core").Component<{ text: string }>}
 */
const TextDescription = component({
  pipe({ props: { text } }) {
    console.log('TextDescription.load')
    return { text }
  },
  render({ text }) {
    const length = text.length
    const suffix = length > 1 ? 'characters' : 'character'
    console.log('TextDescription.render', { text, length, suffix })
    return (
      <p>The provided text has {length} {suffix}</p>
    )
  }
})

render(
  <Component text="Hello world" />,
  root
)
