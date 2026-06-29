# Testing

JsxRx ships `@jsxrx/testing-library`, a thin layer on top of [Testing Library](https://testing-library.com/) that renders components into a real DOM with the same batch renderer used in production. The library re-exports all of `@testing-library/dom`, so every standard query (`findByText`, `getByRole`, etc.) and matcher (`toBeInTheDocument`, `toBeDisabled`) is available without additional setup.

---

## Installation

```bash
npm install -D @jsxrx/testing-library vitest jsdom @testing-library/user-event
```

Your `package.json` should include at least:

```json
{
  "devDependencies": {
    "@jsxrx/testing-library": "*",
    "@testing-library/user-event": "^14.0.0",
    "jsdom": "^29.0.0",
    "vitest": "^3.0.0"
  }
}
```

`@jsxrx/testing-library` depends on `@jsxrx/core` and `@testing-library/dom` as peer dependencies — both are typically already present in a JsxRx project.

---

## Vitest Configuration

JsxRx tests run with [Vitest](https://vitest.dev/) in a `jsdom` environment. No configuration file is strictly required — Vitest picks up the default settings. If you do need a custom `vitest.config.js`:

```js
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
  },
})
```

> **Note:** `@vitest-environment jsdom` must be declared in **every test file** (see below). Without it, tests won't have access to the DOM APIs.

---

## Writing a Test File

### Minimal Skeleton

```tsx
/**
 * @vitest-environment jsdom
 */
import { render } from "@jsxrx/testing-library"
import { describe, expect, it } from "vitest"
import MyComponent from "./MyComponent.js"

describe("MyComponent", () => {
  it("renders a greeting", async () => {
    const { findByText } = render(<MyComponent name="Alice" />)
    expect(await findByText("Hello, Alice!")).toBeInTheDocument()
  })
})
```

The `@vitest-environment jsdom` JSDoc comment at the top of the file tells Vitest to use the `jsdom` environment for DOM APIs.

### Automatic Cleanup & Matchers

`@jsxrx/testing-library` registers two hooks automatically on import:

| Hook | Behaviour |
|------|-----------|
| `afterEach(cleanup)` | Unmounts all rendered components between tests so each test starts with a clean DOM. |
| `expect.extend(matchers)` | Registers Testing Library matchers like `toBeInTheDocument`, `toBeDisabled`, `toHaveTextContent`. |

You do **not** need to call `cleanup()` manually or configure matchers — both happen when you import from `@jsxrx/testing-library`.

---

## `render()` — Rendering Components

```tsx
import { render } from "@jsxrx/testing-library"

const result = render(
  <MyComponent prop="value">
    <p>Child content</p>
  </MyComponent>,
  {
    container: document.createElement("div"), // optional: custom container
    root: document.body,                       // optional: where the container is appended
  }
)
```

`render()` mounts the component into a `container` element appended to a `root` element (defaults to `document.body`) and returns an object that merges the component's subscription with all of [`screen`](https://testing-library.com/docs/queries/about#screen) queries:

| Returned key | Description |
|---|---|
| `...screen` | All `@testing-library/dom` queries (`findByText`, `getByRole`, `queryByTestId`, etc.) scoped to `document.body`. |
| `container` | The `<div>` element the component was mounted into. |
| `root` | The root element holding the container. |
| `unmount()` | Removes the component from the DOM and tears down all subscriptions. |
| `subscription` | The RxJS `Subscription` backing the component. |

### Querying the DOM

All standard Testing Library queries are available directly from the render result:

```tsx
const { findByText, getByRole, queryByTestId } = render(<App />)

// Async — waits for the text to appear
expect(await findByText("Submit")).toBeInTheDocument()

// Synchronous — fails immediately if not found
expect(getByRole("button", { name: "Submit" })).toBeDisabled()

// Nullable — returns null if not found
expect(queryByTestId("spinner")).toBeNull()
```

**Prefer `findBy*` in JsxRx tests.** Components update on observable emissions, which happen asynchronously. `findByText`, `findByRole`, etc. poll the DOM until the element appears or a timeout is reached, making them the safest choice.

---

## `act()` — Wrapping Interactions

When simulating user events that trigger observable emissions, wrap the interaction in `act()` so the batch renderer flushes before the next assertion:

```tsx
import { act, render } from "@jsxrx/testing-library"
import { userEvent } from "@testing-library/user-event"

const user = userEvent.setup()
const { findByText } = render(<Counter />)
const button = await findByText("Increment")

await act(async () => {
  await user.click(button)
})

expect(await findByText("Count: 1")).toBeInTheDocument()
```

`act()` runs the callback, then waits for the batch renderer to flush all pending DOM updates. Without it, assertions immediately after an event may see a stale DOM.

---

## `wait()` and `waitForNextBatchCompleted()`

| Utility | Signature | Purpose |
|---|---|---|
| `wait(ms)` | `(milliseconds: number) => Promise<void>` | Waits for a specific amount of time. Useful when testing time-based operators like `delay`. |
| `waitForNextBatchCompleted()` | `() => Promise<void>` | Waits for the batch renderer to flush the next batch of DOM updates. |

```tsx
import { render, wait, waitForNextBatchCompleted } from "@jsxrx/testing-library"
import { delay } from "rxjs"
import { state } from "@jsxrx/core"

it("shows content after a delay", async () => {
  const count$ = state(0)
  const delayed$ = count$.pipe(delay(1000))

  const { findByText } = render(<CountDisplay count={delayed$} />)

  await wait(1000)                // wait for the delay to pass
  await waitForNextBatchCompleted() // flush the renderer

  expect(await findByText("The count is 0")).toBeInTheDocument()
})
```

> **Tip:** For tests that don't depend on real time, prefer `Subject` from RxJS. Call `.next()` to emit values on demand without any wall-clock delay (see [Testing Suspense](#testing-suspense) below).

---

## Testing Suspense & Loading States

Components wrapped in `<Suspense>` show a fallback while the underlying observable hasn't emitted its first value. The cleanest way to test this is with an RxJS `Subject`:

```tsx
import { Subject } from "rxjs"
import { render } from "@jsxrx/testing-library"

it("shows loading state before the observable emits", async () => {
  const count$ = new Subject<number>()
  const { findByText } = render(
    <CountDisplay count={count$}>
      <div>child content</div>
    </CountDisplay>,
  )

  // The Subject hasn't emitted yet — Suspense fallback is visible
  expect(await findByText("Loading count...")).toBeInTheDocument()
})

it("renders the value once the observable emits", async () => {
  const count$ = new Subject<number>()
  const { findByText } = render(
    <CountDisplay count={count$}>
      <div>child content</div>
    </CountDisplay>,
  )

  count$.next(42)

  // After .next(), the Suspense boundary resolves
  expect(await findByText("The count is 42")).toBeInTheDocument()
  expect(await findByText("child content")).toBeInTheDocument()
})
```

A `Subject` starts cold — it has no initial value. This naturally triggers Suspense boundaries, mirroring real-world scenarios like pending API responses or lazy-loaded modules. The tests execute instantly without any real time delays.

### Testing Components That Use `delay`

When a component uses RxJS `delay()`, combine `wait()` with `waitForNextBatchCompleted()`:

```tsx
it("the increase and decrease buttons are disabled while count is loading", async () => {
  const { findByText } = render(<App />)

  const [increaseButton, decreaseButton] = await Promise.all([
    findByText("Increase"),
    findByText("Decrease"),
  ])

  expect(increaseButton).toBeDisabled()
  expect(decreaseButton).toBeDisabled()
})

it("should increase the count after the delay when clicking on increase button", async () => {
  const user = userEvent.setup()
  const { findByText } = render(<App />)

  // Wait for the initial delayed count to arrive
  await wait(1000)
  await waitForNextBatchCompleted()

  const increaseButton = await findByText("Increase")

  await act(async () => {
    await user.click(increaseButton)
  })

  expect(await findByText("Count is odd")).toBeInTheDocument()
  expect(await findByText("The count is 1")).toBeInTheDocument()
})
```

---

## Testing User Interactions

Use [`@testing-library/user-event`](https://testing-library.com/docs/user-event/intro) for realistic event simulation:

```tsx
import { userEvent } from "@testing-library/user-event"
import { act, render } from "@jsxrx/testing-library"

it("updates input value", async () => {
  const user = userEvent.setup()
  const { findByPlaceholderText } = render(<NameForm />)

  const input = await findByPlaceholderText("Enter your name")

  await act(async () => {
    await user.type(input, "Alice")
  })

  expect(input).toHaveValue("Alice")
})
```

Every interaction that causes an observable emission should be wrapped in `act()`:

```tsx
await act(async () => {
  await user.click(button)         // triggers onClick → state.set() → DOM update
  await user.type(input, "text")   // triggers onInput → state.set() → DOM update
  await user.keyboard("{Enter}")   // triggers keyboard event → handler → DOM update
})
```

---

## Testing Reactive State Updates

Components built with `state()` update DOM nodes directly without re-rendering. Test state updates by triggering an event and asserting the new DOM state:

```tsx
import { state } from "@jsxrx/core"
import { act, render } from "@jsxrx/testing-library"
import { userEvent } from "@testing-library/user-event"

function Counter() {
  const count$ = state(0)
  return (
    <div>
      <span>{count$}</span>
      <button onClick={() => count$.set(count$.value + 1)}>+</button>
    </div>
  )
}

it("increments the counter", async () => {
  const user = userEvent.setup()
  const { findByText } = render(<Counter />)

  expect(await findByText("0")).toBeInTheDocument()

  await act(async () => {
    await user.click(await findByText("+"))
  })

  expect(await findByText("1")).toBeInTheDocument()
})
```

### Derived Observables

Derived observables (`.pipe(map(...))`, `combineLatest`, etc.) update automatically when the source changes:

```tsx
function DoubledCounter() {
  const count$ = state(2)
  const doubled$ = count$.pipe(map(c => c * 2))
  return <span>{doubled$}</span>
}

it("shows derived value", async () => {
  const { findByText } = render(<DoubledCounter />)
  expect(await findByText("4")).toBeInTheDocument()
})
```

---

## API Reference

### `render(node: ElementNode, options?: RenderOptions)`

Renders a JsxRx component into the DOM.

```ts
interface RenderOptions {
  container?: Element   // defaults to document.createElement("div")
  root?: Element        // defaults to document.body
}
```

Returns `RenderResult` which extends `Screen` (from `@testing-library/dom`):

```ts
interface RenderResult extends Screen {
  root: Element
  container: Element
  subscription: Subscription
  unmount(): void
}
```

### `act(fn: () => Promise<void>): Promise<void>`

Runs an async callback and waits for the batch renderer to flush. Always wrap user-event interactions in `act()`.

### `wait(ms: number): Promise<void>`

Resolves after `ms` milliseconds. Based on `rxjs.timer`.

### `waitForNextBatchCompleted(): Promise<void>`

Resolves when the next batch of DOM updates has been flushed to the DOM.

### `cleanup(): Promise<void>`

Unmounts all rendered components and waits for the batch renderer to flush. Called automatically via `afterEach` — you rarely need to invoke it directly.

---

## Complete Example

A full test suite for a component with Suspense, props, and children:

```tsx
/**
 * @vitest-environment jsdom
 */
import { render } from "@jsxrx/testing-library"
import { describe, expect, it } from "vitest"
import { Subject } from "rxjs"
import CountDisplay from "./CountDisplay.js"

describe("CountDisplay component", () => {
  it("renders the count when a value is emitted", async () => {
    const count$ = new Subject<number>()
    const { findByText } = render(
      <CountDisplay count={count$}>
        <div>child content</div>
      </CountDisplay>,
    )

    count$.next(42)

    expect(await findByText("The count is 42")).toBeInTheDocument()
    expect(await findByText("child content")).toBeInTheDocument()
  })

  it("shows loading state before the observable emits", async () => {
    const count$ = new Subject<number>()
    const { findByText } = render(
      <CountDisplay count={count$}>
        <div>child content</div>
      </CountDisplay>,
    )

    expect(await findByText("Loading count...")).toBeInTheDocument()
  })

  it("uses default count value of 0 when no count prop is provided", async () => {
    const { findByText } = render(
      <CountDisplay>
        <div>child content</div>
      </CountDisplay>,
    )

    expect(await findByText("The count is 0")).toBeInTheDocument()
  })
})
```

---

## Where to Go From Here

Congratulations — you've completed the JsxRx User Guide! You now have a solid foundation for building applications with JsxRx.

To continue learning:

- **[Examples](../examples/counter.md)** — Runnable examples demonstrating JsxRx patterns
- **[API Reference](../api/README.md)** — Complete API documentation for all packages
- **[Contributing](../contributing/README.md)** — Internal implementation details for contributors
