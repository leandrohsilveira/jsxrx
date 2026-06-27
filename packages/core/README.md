# @jsxrx/core

Reactive JSX rendering with RxJS.

## Installation

```bash
npm i @jsxrx/core rxjs
```

## Vite Configuration

Install the Vite plugin:

```bash
npm i -D @jsxrx/vite-plugin
```

Configure `vite.config.js` or `vite.config.ts`:

```js
import { defineConfig } from "vite"
import { jsxRX } from "@jsxrx/vite-plugin"

export default defineConfig({
  plugins: [jsxRX()],
})
```

## Project Setup

### index.html

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>JsxRx App</title>
  </head>
  <body>
    <div root></div>
    <script src="./src/main.tsx" type="module"></script>
  </body>
</html>
```

### src/main.tsx

```jsx
import { createRoot } from "@jsxrx/core/dom"
import App from "./App.tsx"

createRoot(document.querySelector("[root]")).mount(<App />)
```

### src/App.tsx — Counter Example

```jsx
import { state } from "@jsxrx/core"

export function App() {
  const count$ = state(0)

  function increase() {
    count$.set(count$.value + 1)
  }

  function decrease() {
    count$.set(count$.value - 1)
  }

  return (
    <>
      <p>The count is: {count$}</p>
      <button type="button" onClick={increase}>
        Increase
      </button>
      <button type="button" onClick={decrease}>
        Decrease
      </button>
    </>
  )
}
```

### tsconfig.json / jsconfig.json

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@jsxrx/core"
  }
}
```
