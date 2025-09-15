import { _jsx, component, render } from "@jsxrx/core"
import { map } from "rxjs"

const root = document.querySelector('[root]')

if (!root) throw new Error('Root element not found')

/**
 * @type {import("@jsxrx/core").Component<{ text: string }>}
 */
const Component = component({
  load({ props: { text } }) {
    return { text, length: text.pipe(map(value => value.length)) }
  },
  render({ text, length }) {
    const suffix = length > 1 ? 'characters' : 'character'
    if (!text) return 'No text provided'
    return (
      _jsx('1:header', 'header', { class: 'header' },
        _jsx('2:h1', 'h1', { class: 'test' }, text),
        _jsx('3:p', 'p', null, 'The provided text has ', length, ' ', suffix)
      )
    )
  }
})

render(
  _jsx('root', Component, { text: 'Hello world!' }),
  root
).subscribe()
