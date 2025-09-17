import { _jsx, component, render } from "@jsxrx/core"
import { BehaviorSubject } from "rxjs"

const root = document.querySelector('[root]')

if (!root) throw new Error('Root element not found')

/**
 * @type {import("@jsxrx/core").Component<{ text: string }>}
 */
const Component = component({
  pipe({ props: { text } }) {
    console.log('Component.load')
    const count = new BehaviorSubject(0)
    return {
      text,
      count,
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
      _jsx('0:header', 'header', { class: 'header' },
        _jsx('1:h1', 'h1', { class: 'test' }, text),
        _jsx('2:text_description', TextDescription, { text }),
        _jsx('3:count_display', CountDisplay, { count }),
        count % 2 === 0
          ? _jsx('4:div', 'div', null, 'The count is even')
          : _jsx('5:div', 'div', null, 'The count is odd'),
        _jsx('6:increment_btn', 'button', { onClick: increase }, 'Increase count'),
        _jsx('7:decrement_btn', 'button', { onClick: decrease }, 'Decrease count'),
      )
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
      _jsx('0:div', 'div', null, 'The count is ', count)
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
      _jsx('0:p_text_description', 'p', null, 'The provided text has ', length, ' ', suffix)
    )
  }
})

render(
  _jsx('component', Component, { text: 'Hello world!' }),
  root
)
