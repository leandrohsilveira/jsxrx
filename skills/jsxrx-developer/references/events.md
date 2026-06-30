## Event Handling Patterns

JsxRx offers three approaches for handling events — each suited to a different scenario.

---

### 1. Direct Handlers (`onClick={fn}`)

For simple self-contained events **within** a component — clicks, inputs, form submissions — use native DOM event attributes (`onClick`, `onInput`, `onSubmit`, `onChange`, etc.). JsxRx's DOM renderer attaches these listeners directly to the native element:

```tsx
import { state } from "@jsxrx/core"

function Counter() {
  const count$ = state(0)
  const name$ = state("")

  function handleClick() {
    count$.set(count$.value + 1)
  }

  function handleInput(e: InputEvent) {
    const value = (e.currentTarget as HTMLInputElement).value
    name$.set(value)
  }

  return (
    <div>
      <button onClick={handleClick}>Count: {count$}</button>
      <input onInput={handleInput} />
    </div>
  )
}
```

**Why direct handlers work without `useCallback`:**

- **Components run once** — the function references captured during initialization are stable for the entire component lifecycle. There are no re-renders that would create new closures.
- **No stale closures** — state variables like `count$` expose their current value synchronously via `.value`, even inside closures. The getter reads the underlying `BehaviorSubject` directly.
- **Native DOM listeners** — the renderer sets event listeners directly on the element, so the handler always fires when the DOM event occurs.

**Limitation:** The handler function is captured at initialization and never changes. If you need a handler that changes based on props that update over time, use `emitter()` instead. Direct handlers are also not available as observable streams — you cannot pipe them through RxJS operators.

---

### 2. `emitter()` Pattern (for Callback Props)

When a callback function is passed **as a prop from a parent component**, the `emitter()` utility decouples the callback reference from the event invocation. This ensures the **latest** function is always called — even if the prop changes after the component is mounted.

```tsx
import { emitter, Props, state } from "@jsxrx/core"
import { map } from "rxjs"
import type { Observable } from "rxjs"

interface LoginFormProps {
  onSubmit: (data: { email: string; password: string }) => void
  isSubmitting: boolean
}

export default function LoginForm(props$: Observable<LoginFormProps>) {
  const { onSubmit$, isSubmitting$ } = Props.take(props$)
  const submitEmitter = emitter(onSubmit$)

  const email$ = state("")
  const password$ = state("")

  function handleFormSubmit(e: Event) {
    e.preventDefault()
    submitEmitter.emit({ email: email$.value, password: password$.value })
  }

  return (
    <form onSubmit={handleFormSubmit}>
      <input
        type="email"
        value={email$.value}
        onInput={e => email$.set((e.target as HTMLInputElement).value)}
      />
      <input
        type="password"
        value={password$.value}
        onInput={e => password$.set((e.target as HTMLInputElement).value)}
      />
      <button type="submit" disabled={isSubmitting$}>
        {isSubmitting$.pipe(map(p => (p ? "Logging in..." : "Login")))}
      </button>
    </form>
  )
}
```

**How `emitter()` avoids stale callbacks:**

- The callback function (`onSubmit`) can change reactively — different parent states may pass different handlers over the component's lifetime.
- `emitter(onSubmit$)` returns an `Emitter<T>` object. When `.emit(...args)` is called, it resolves the **latest** function from the observable at invocation time. Even if the handler was captured in a closure earlier, the latest value is always used.
- Event timing is decoupled from prop change timing — the callback observable may emit a new function long after the component has already set up its event handlers.

**`Emitter<T>` vs `OptionalEmitter<T>`:**

| Type | Created when | `.emit()` behavior |
|---|---|---|
| `Emitter<T>` | The observable emits a non-nullable function type | Every call invokes a callback |
| `OptionalEmitter<T>` | The observable type includes `null \| undefined` | May resolve to `undefined` if no callback is available — safe to call without a guard |

**Important:** `emitter()` is the **recommended pattern for callback props** that can change over time. Direct handlers (`onClick={fn}`) are only suitable when the handler never needs to change.

---

### 3. `fromRefEvent()` Pattern (DOM Event Streams)

For DOM events that need to be composed with other reactive streams, use `fromRefEvent()`. It returns an `Observable<Event>` from a DOM element reference. Returns `NEVER` (completes immediately) if the ref is `null` or the `while$` condition emits `false`.

```ts
import { fromRefEvent } from "@jsxrx/core/dom"

// Signature
fromRefEvent<T extends EventTarget>(
  ref: Ref<T> | Observable<T | Ref<T>> | T,
  name: Observable<string> | string,
  while$?: Observable<boolean>
): Observable<Event>
```

The ref parameter accepts:
- A `Ref<T>` created with `ref()` — for component-bound elements
- An `Observable` of elements or refs — for dynamic targets
- A direct element reference — e.g., `document`, `window`

#### Click-Outside Detection

```tsx
import { ref, fromRef, state, Props } from "@jsxrx/core"
import { fromRefEvent } from "@jsxrx/core/dom"
import { combine, filter, map } from "rxjs"
import type { Observable } from "rxjs"
import type { Lifecycle } from "@jsxrx/core"

interface DropdownProps {
  items: string[]
}

function Dropdown(
  props$: Observable<DropdownProps>,
  { subscription }: Lifecycle,
) {
  const { items$ } = Props.take(props$)
  const open$ = state(false)
  const triggerRef = ref(HTMLElement)
  const dropdownRef = ref(HTMLDivElement)

  // Listen for click on trigger
  const triggerClick$ = fromRefEvent(triggerRef, "click")
  subscription.add(
    triggerClick$.subscribe(() => open$.set(!open$.value)),
  )

  // Close on click outside
  const documentClick$ = fromRefEvent(document, "click")
  const outsideClick$ = combine({
    event: documentClick$,
    open: open$,
    dropdown: fromRef(dropdownRef),
  }).pipe(
    filter(
      ({ event, open, dropdown }) =>
        open && dropdown !== null && !dropdown.contains(event.target as Node),
    ),
  )
  subscription.add(
    outsideClick$.subscribe(() => open$.set(false)),
  )

  return (
    <div>
      <button ref={triggerRef}>Toggle</button>
      {open$.pipe(map(open => open && <div ref={dropdownRef}>{items$}</div>))}
    </div>
  )
}
```

#### Conditional Listening with `while$`

The optional `while$` parameter tears down and re-establishes event listeners based on a boolean observable. The listener is only active while the condition is `true`. When `while$` emits `false`, the observable returns `NEVER`, effectively unlistening:

```tsx
import { state } from "@jsxrx/core"
import { fromRefEvent } from "@jsxrx/core/dom"

const enabled$ = state(true)
const hover$ = fromRefEvent(buttonRef, "mouseenter", enabled$)

// Only emits when enabled$.value is true
// Setting enabled$.set(false) silently tears down the listener
```

#### Scroll / Resize Examples

```tsx
import { fromRefEvent } from "@jsxrx/core/dom"

// Window events — direct element reference
const scroll$ = fromRefEvent(window, "scroll")
const resize$ = fromRefEvent(window, "resize")

// Element-specific scroll
const containerRef = ref(HTMLDivElement)
const containerScroll$ = fromRefEvent(containerRef, "scroll")
```

---

### 4. Decision Flow

Use this text guide to choose the right event pattern:

```text
Is the handler for a prop that can change over time?
  ├── Yes → Use emitter() — always calls the latest callback
  └── No  → Is it a DOM event on a specific element?
            ├── Yes → Do you need to compose it with other observables?
            │         ├── Yes → fromRefEvent(ref, name) + RxJS operators
            │         └── No  → fromRefEvent(ref, name) or
            │                   subscribe manually with subscription.add()
            └── No  → Is it a simple self-contained handler?
                      ├── Yes → Direct handler (onClick={fn}, onInput={fn})
                      └── Yes → Direct handler — closures are stable,
                                 no useCallback needed
```

---

### Lifecycle-Aware Subscriptions

Any manual subscription to observables — especially `fromRefEvent()` streams — must be registered with `subscription.add()` from the `Lifecycle` parameter. This ensures the subscription is automatically torn down when the component unmounts, preventing memory leaks:

```tsx
import { fromRefEvent } from "@jsxrx/core/dom"
import { ref } from "@jsxrx/core"
import type { Observable, Lifecycle } from "@jsxrx/core"

function ScrollSpy(
  props$: Observable<{ threshold: number }>,
  { subscription }: Lifecycle,
) {
  const { threshold$ } = Props.take(props$)

  const scroll$ = fromRefEvent(window, "scroll")

  // ✅ ALWAYS add manual subscriptions
  subscription.add(
    scroll$.subscribe(() => {
      const scrollY = window.scrollY
      console.log("Scrolled to:", scrollY)
    }),
  )

  return <div>Check console for scroll events</div>
}
```

**Reminder:** You only need `subscription.add()` for manual `.subscribe()` calls. Subscriptions created by observables embedded in JSX (via `{observable$}`) are managed automatically by the renderer.

---

### Summary Table

| Pattern | Import | When to Use |
|---|---|---|
| **Direct handler** `onClick={fn}` | — (native DOM) | Simple self-contained events; handler never changes |
| **`emitter(callback$)`** | `@jsxrx/core` | Callback passed as prop; callback may change over time |
| **`fromRefEvent(ref, name)`** | `@jsxrx/core/dom` | DOM event as observable; composition with RxJS; click-outside, scroll, resize |
