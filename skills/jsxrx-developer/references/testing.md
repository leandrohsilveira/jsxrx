## Testing

### Setup

Install `vitest` and `jsdom` alongside `@jsxrx/testing-library`:

```bash
npm install -D @jsxrx/testing-library vitest jsdom @testing-library/user-event
```

Every test file **must** start with the `@vitest-environment jsdom` doc comment at the very top. Without it, tests won't have access to DOM APIs:

```tsx
/** @vitest-environment jsdom */
import { render } from "@jsxrx/testing-library"
import { describe, expect, it } from "vitest"
import MyComponent from "./MyComponent.js"
```

No Vitest configuration file is strictly required — the doc comment per-file is sufficient. If you do configure it globally, each test file still needs the comment.

### `render()`

`render(<Component />)` mounts the component into a `div` appended to `document.body`. It returns all `@testing-library/dom` screen queries plus metadata keys:

```tsx
const result = render(<Counter />)

const {
  // Screen queries (scoped to document.body):
  findByText,   // async — returns Promise, polls until element appears
  findByRole,   // async
  findByTestId, // async
  getByText,    // sync — throws if element not found immediately
  getByRole,    // sync
  getByTestId,  // sync
  queryByText,  // sync — returns null if element not found
  queryByRole,  // sync
  queryByTestId,// sync
  // Metadata:
  container,    // the <div> the component was mounted into
  root,         // the root element holding the container
  unmount,      // tears down subscriptions and removes from DOM
  subscription, // the RxJS Subscription backing the component
} = result
```

`render()` also accepts an optional second argument:

```tsx
render(<MyComponent />, {
  container: document.createElement("div"), // custom container
  root: document.body,                       // custom root
})
```

### Prefer `findBy*` Queries

JsxRx renders **asynchronously** through a batch renderer. Elements may not be in the DOM synchronously after `render()` returns. Always prefer `findBy*` queries — they poll the DOM until the element appears:

```tsx
// ✅ Prefer async — waits for the element
expect(await findByText("Count: 0")).toBeInTheDocument()
expect(await findByRole("button", { name: "Increment" })).toBeInTheDocument()

// ❌ Avoid sync — may fail if element hasn't rendered yet
// getByText("Count: 0")  // throws if DOM not yet updated
```

`findBy*` queries return a `Promise` and accept an optional timeout (default 1000ms):

```tsx
expect(await findByText("Submit", {}, { timeout: 2000 })).toBeInTheDocument()
```

### `act()` — Wrapping Interactions

When simulating user events that trigger observable emissions, wrap the interaction in `act()` so the batch renderer flushes before the next assertion:

```tsx
import { act, render } from "@jsxrx/testing-library"
import { userEvent } from "@testing-library/user-event"

it("increments on click", async () => {
  const user = userEvent.setup()
  const { findByText } = render(<Counter />)
  const button = await findByText("Increment")

  await act(async () => {
    await user.click(button)
  })

  expect(await findByText("Count: 1")).toBeInTheDocument()
})
```

`act()` runs the callback, then waits for the batch renderer to flush all pending DOM updates. Without it, assertions immediately after an event may see stale DOM. Apply `act()` to any interaction that causes an observable emission:

```tsx
await act(async () => {
  await user.click(button)         // triggers onClick → state.set() → DOM update
  await user.type(input, "text")   // triggers onInput → state.set() → DOM update
  await user.keyboard("{Enter}")   // triggers keyboard event → handler → DOM update
})
```

### `wait(ms)` and `waitForNextBatchCompleted()`

| Utility | Signature | Purpose |
|---------|-----------|---------|
| `wait(ms)` | `(milliseconds: number) => Promise<void>` | Waits for a specific amount of wall-clock time. Based on `rxjs.timer`. |
| `waitForNextBatchCompleted()` | `() => Promise<void>` | Waits for the batch renderer to flush the next batch of DOM updates to the DOM. |

Use `wait()` when testing time-based RxJS operators like `delay`:

```tsx
import { render, wait, waitForNextBatchCompleted } from "@jsxrx/testing-library"
import { delay } from "rxjs"
import { state } from "@jsxrx/core"

it("shows content after a delay", async () => {
  const count$ = state(0)
  const delayed$ = count$.pipe(delay(1000))

  const { findByText } = render(<CountDisplay count={delayed$} />)

  await wait(1000)                  // wait for the delay to pass
  await waitForNextBatchCompleted() // flush the renderer

  expect(await findByText("The count is 0")).toBeInTheDocument()
})
```

> **Tip:** For tests that don't depend on real time, prefer `Subject` from RxJS instead of `delay()`. Call `.next()` to emit values instantly (see "Testing Suspense" below).

### Testing Suspense & Loading States

Components wrapped in `<Suspense>` show a fallback while the underlying observable hasn't emitted its first value. The cleanest way to test this is with an RxJS `Subject` — a cold observable with no initial value:

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

A `Subject` starts cold — it has no initial value. This naturally triggers Suspense boundaries, mirroring real-world scenarios like pending API responses. Tests execute instantly without real-time delays.

### Testing with `delay()`

When a component uses RxJS `delay()`, combine `wait()` with `waitForNextBatchCompleted()` after triggering changes:

```tsx
import { wait, waitForNextBatchCompleted } from "@jsxrx/testing-library"

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

### Automatic Cleanup & Matchers

`@jsxrx/testing-library` registers two hooks automatically when imported:

| Hook | Behaviour |
|------|-----------|
| `afterEach(cleanup)` | Unmounts all rendered components between tests so each test starts with a clean DOM. |
| `expect.extend(matchers)` | Registers Testing Library matchers like `toBeInTheDocument`, `toBeDisabled`, `toHaveTextContent`. |

You do **not** need to call `cleanup()` manually or configure matchers — both happen automatically when you import from `@jsxrx/testing-library`.

### Complete Test Example

A full test file for a counter component demonstrating the standard patterns:

```tsx
/**
 * @vitest-environment jsdom
 */
import { act, render } from "@jsxrx/testing-library"
import { userEvent } from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import Counter from "./Counter.js"

describe("Counter", () => {
  it("renders the initial count", async () => {
    const { findByText } = render(<Counter />)
    expect(await findByText("Count: 0")).toBeInTheDocument()
  })

  it("increments the count when the button is clicked", async () => {
    const user = userEvent.setup()
    const { findByText } = render(<Counter />)

    const button = await findByText("Increment")

    await act(async () => {
      await user.click(button)
    })

    expect(await findByText("Count: 1")).toBeInTheDocument()
  })

  it("decrements the count when the decrement button is clicked", async () => {
    const user = userEvent.setup()
    const { findByText } = render(<Counter />)

    const decrementButton = await findByText("Decrement")

    await act(async () => {
      await user.click(decrementButton)
    })

    expect(await findByText("Count: -1")).toBeInTheDocument()
  })

  it("resets the count to zero", async () => {
    const user = userEvent.setup()
    const { findByText } = render(<Counter />)

    // First increment
    await act(async () => {
      await user.click(await findByText("Increment"))
    })
    expect(await findByText("Count: 1")).toBeInTheDocument()

    // Then reset
    await act(async () => {
      await user.click(await findByText("Reset"))
    })
    expect(await findByText("Count: 0")).toBeInTheDocument()
  })
})
```

### Imports Summary

| Import | Source | Used For |
|--------|--------|----------|
| `render` | `@jsxrx/testing-library` | Mounting components in tests |
| `act` | `@jsxrx/testing-library` | Wrapping user interactions |
| `wait` | `@jsxrx/testing-library` | Waiting for time-based operators |
| `waitForNextBatchCompleted` | `@jsxrx/testing-library` | Flushing the batch renderer |
| `userEvent` | `@testing-library/user-event` | Simulating user interactions |
| `Subject` | `rxjs` | Cold observable for Suspense testing |
| `delay` | `rxjs` | Testing time-based operators |
| `state` | `@jsxrx/core` | Creating reactive state in component-under-test |
| `describe`, `it`, `expect` | `vitest` | Test framework functions |

> **Full API reference**: See `@jsxrx/testing-library` API docs for complete signatures, `Screen` extension details, and `RenderOptions` types.
