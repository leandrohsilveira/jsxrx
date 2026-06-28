# Props

Props in JsxRx are received as an `Observable<Props>` — a stream that can emit new values at any time. This chapter covers how to work with that stream: extracting individual prop observables, forwarding props to child elements, handling static and reactive values, and managing children.

---

## 1. Props.take() — Destructuring Props

### The Fundamental Pattern

At its core, working with a props observable means you subscribe and transform it with standard RxJS operators. For a single prop, that looks like this:

```tsx
import { map } from "rxjs"
import type { Observable } from "rxjs"

function Greeting(props$: Observable<{ name: string }>) {
  const name$ = props$.pipe(
    map(props => props.name)
  )
  return <h1>Hello, {name$}!</h1>
}
```

This is the fundamental reactive mechanism: **pipe the props stream through `map()` to extract the one field you care about**.

### The Problem: Verbose Repetition

The pattern above works, but it gets tiresome fast. For a component with four or five props, you end up writing the same `props$.pipe(map(...))` boilerplate for each one:

```tsx
const name$ = props$.pipe(map(p => p.name))
const age$ = props$.pipe(map(p => p.age))
const email$ = props$.pipe(map(p => p.email))
const role$ = props$.pipe(map(p => p.role))
```

That is repetitive, error-prone, and obscures the component's real logic.

### Enter Props.take()

`Props.take()` is **syntax sugar** — a convenience method that does exactly what you would write by hand (creates an Observable per prop from the props stream), plus adds optimizations like `distinctUntilChanged()` to avoid unnecessary re-renders.

```tsx
import { Props } from "@jsxrx/core"

function MyComponent(props$: Observable<MyComponentProps>) {
  // This one line replaces all the manual pipe/map calls
  const { name$, age$ } = Props.take(props$, { age: 0 })

  return (
    <p>
      {name$} is {age$} years old
    </p>
  )
}

// Usage:
// <MyComponent name="Alice" />           — age$ emits 0 (default)
// <MyComponent name="Bob" age={30} />    — age$ emits 30
// <MyComponent name={nameObservable$} /> — name$ tracks the observable
```

Just like the manual approach, you get an `Observable<T>` for each prop. `Props.take()` simply removes the repetition so you can focus on what matters.

### The `$` Suffix Convention

You may have noticed the `$` suffix on `props$`, `name$`, and `age$`. In JsxRx (and the wider RxJS ecosystem), a trailing `$` signals **"this value is an Observable"**:

- `name$` — `Observable<string>`
- `age$` — `Observable<number>`
- `children$` — `Observable<ElementNode>`

The convention helps you distinguish plain values from reactive streams at a glance. You will see it throughout all JsxRx code: the component's `props$` parameter, every destructured prop stream, and any derived observable.

### Default Values for Optional Props

The second argument to `Props.take()` provides default values for optional props. Defaults fill in when the prop is missing or explicitly `undefined`:

```tsx
type ButtonProps = {
  label: string
  variant?: "primary" | "secondary"
  disabled?: boolean
}

function Button(props$: Observable<ButtonProps>) {
  const { label$, variant$, disabled$ } = Props.take(props$, {
    variant: "primary",
    disabled: false,
  })

  // variant$ emits "primary" when no variant prop is passed
  // disabled$ emits false when no disabled prop is passed
  return (
    <button className={variant$} disabled={disabled$}>
      {label$}
    </button>
  )
}
```

### Practical Example: Controlled Input

```tsx
function TextInput(props$: Observable<{
  value: string
  onChange: (value: string) => void
}>) {
  const { value$, onChange$ } = Props.take(props$)

  return (
    <input
      value={value$}
      onInput={onChange$.pipe(
        map(handler => (e: InputEvent) =>
          handler((e.target as HTMLInputElement).value)
        )
      )}
    />
  )
}
```

---

## 2. Props.spread() — Forwarding Props

`Props.spread(input$, defaultProps?)` returns an **Observable that emits an object** where each key is a prop name (without the `$` suffix) and each value is an `Observable<T>`.

It is designed for the **spread pattern** — forwarding entire sets of properties onto child elements or components, similar to the `{...props}` pattern in React. Unlike `Props.take()`, keys do **not** receive a `$` suffix, because the emitted object is meant to be destructured or spread directly onto elements where `$` is not needed.

`Props.spread` also **re-emits when the set of prop keys changes** — if a new property key appears that was not in the previous emission, the Observable emits an updated object reflecting the new shape.

### Basic Usage

```tsx
import { Props } from "@jsxrx/core"
import { map } from "rxjs"

function Button(props$: Observable<{
  label: string
  disabled?: boolean
  className?: string
}>) {
  // spread$ emits: { label: Observable<string>, disabled: Observable<boolean>, ... }
  const spread$ = Props.spread(props$)

  return (
    {spread$.pipe(
      map(spreadProps => (
        // Each value is still an Observable, so they update reactively
        <button
          disabled={spreadProps.disabled}
          className={spreadProps.className}
        >
          {spreadProps.label}
        </button>
      ))
    )}
  )
}
```

### When to Use `spread()` vs `take()`

| Use Case | Method |
|---|---|
| You need individual observables per prop, with `$` suffix | `Props.take()` |
| You want lazy, per-prop subscription | `Props.take()` |
| You need to forward all props to a child element or component | `Props.spread()` |
| You need to iterate or react to changes in available prop keys | `Props.spread()` |
| You need the complete props shape as a single reactive emission | `Props.spread()` |

### Forwarding Props to Native Elements

A common pattern is extracting known props with `Props.take()` while forwarding the rest — including props you do not explicitly know about — to a child element:

```tsx
type CardProps = {
  title: string
  className?: string   // forwarded to the <div>
  id?: string          // forwarded to the <div>
}

function Card(props$: Observable<CardProps>) {
  const { title$ } = Props.take(props$)

  return (
    <>
      {Props.spread(props$).pipe(
        map(({ className, id }) => (
          <div className={className} id={id}>
            <h2>{title$}</h2>
          </div>
        ))
      )}
    </>
  )
}
```

`Props.spread()` emits every key in the props object, so even when using `Props.take()` to extract some props for internal logic, you can still forward the full set through `Props.spread()`.

---

## 3. Props Accept `T | Observable<T>`

Any prop can be passed either as a plain static value or as an Observable. JsxRx automatically handles both forms, so the component always receives a consistent observable interface.

### Both Forms Are Valid

```tsx
// Static value — passed directly
<Greeting name="Alice" />

// Observable value — binds reactively
const name$ = state("Alice")
<Greeting name={name$} />

// These are equivalent from the component's perspective.
// In both cases, Props.take() gives you an Observable<string>.
```

You can freely mix static and observable props in the same element:

```tsx
const isActive$ = state(true)

// Some props are static, some are reactive
<Button
  label="Save"
  variant="primary"
  disabled={isActive$.pipe(map(active => !active))}
/>
```

### Ref Props Handled Specially

Props of type `Ref<T>` (created with `ref()`) are passed through as-is without unwrapping — the `Ref` object itself is what the downstream code needs:

```tsx
import { ref } from "@jsxrx/core"
import type { Ref } from "@jsxrx/core"

function Input(props$: Observable<{ inputRef: Ref<HTMLInputElement> }>) {
  const { inputRef$ } = Props.take(props$)
  // inputRef$ is Observable<Ref<HTMLInputElement>> — not Observable<HTMLInputElement>
  return <input ref={inputRef$} />
}

function Parent() {
  const inputRef = ref(HTMLInputElement)
  // Later: inputRef.current.value gives access to the DOM element
  return <Input inputRef={inputRef} />
}
```

---

## 4. children$ — Always an Observable

In JsxRx, `children$` is **always an Observable**, even when static JSX children are passed. This is a critical departure from React, where `children` is whatever the parent passes.

### Basic Usage

```tsx
import { Props, type PropsWithChildren } from "@jsxrx/core"
import type { Observable } from "rxjs"

// PropsWithChildren<T> adds children$ to the props type
type LayoutProps = PropsWithChildren<{
  title: string
}>

function Layout(props$: Observable<LayoutProps>) {
  const { title$, children$ } = Props.take(props$)

  return (
    <div>
      <header>
        <h1>{title$}</h1>
      </header>
      <main>
        {children$}   {/* children$ is an Observable<ElementNode> */}
      </main>
    </div>
  )
}

// Usage:
<Layout title="My App">
  <p>Welcome to my app!</p>
</Layout>
```

### The `PropsWithChildren` Type Helper

```ts
export type PropsWithChildren<T = {}> = T & {
  children?: ElementNode
}
```

`PropsWithChildren<T>` merges your custom props with the `children` prop. The `?` makes it optional — you can use the component without children.

Other common type helpers:

| Type | Description |
|---|---|
| `WithClassName` | Adds `className?: string` |
| `WithChildren` | Adds `children?: ElementNode` |
| `PropsWithKey<T>` | Adds `key?: JsxRx.Key \| null` |
| `PropsWithKeyAndChildren<T>` | Combines both `key` and `children` |

### How children$ Flows

When a parent dynamically changes children, the `children$` Observable inside the component emits the new content — the component function itself never re-runs:

```tsx
const page$ = state("home")

{page$.pipe(
  map(page =>
    <Layout title="My App">
      {page === "home" ? <HomeContent /> : <AboutContent />}
    </Layout>
  )
)}
```

When `page$` changes from `"home"` to `"about"`, the entire `<Layout>` is re-created with new children. The `children$` Observable inside `Layout` emits the new content, and the `<main>` element updates accordingly — **without re-calling the `Layout` function**.

### Example: Layout Component with Children

```tsx
function SidebarLayout(props$: Observable<{
  sidebar: ElementNode
  children: ElementNode
}>) {
  const { sidebar$, children$ } = Props.take(props$)

  return (
    <div style={{ display: "flex" }}>
      <aside>{sidebar$}</aside>
      <main>{children$}</main>
    </div>
  )
}

// Usage with named slots
<SidebarLayout sidebar={<nav>...</nav>}>
  <article>Main content</article>
</SidebarLayout>
```

---

## 5. Common Patterns

### Derived Props (Combine Multiple Prop Streams)

Use RxJS `combineLatest` or `map` to create new observables from existing prop streams:

```tsx
import { map, combineLatest } from "rxjs"

function UserCard(props$: Observable<{
  firstName: string
  lastName: string
  avatar?: string
}>) {
  const { firstName$, lastName$, avatar$ } = Props.take(props$, {
    avatar: "/default-avatar.png",
  })

  // Derive a full name from first and last name
  const fullName$ = combineLatest([firstName$, lastName$]).pipe(
    map(([first, last]) => `${first} ${last}`)
  )

  return (
    <div>
      <img src={avatar$} alt={fullName$} />
      <span>{fullName$}</span>
    </div>
  )
}
```

### Combining Props.take() and Props.spread()

Extract props that need special handling with `take()`, while forwarding everything else with `spread()`:

```tsx
function StyledCard(props$: Observable<{
  title: string
  className?: string
  style?: CSSProperties
  children: ElementNode
}>) {
  // Extract title separately (component needs it for logic)
  const { title$ } = Props.take(props$, { className: "" })

  // Spread everything for forwarding to the DOM element
  return (
    <>
      {Props.spread(props$).pipe(
        map(({ className, style, children }) => (
          <div className={className} style={style}>
            <h3>{title$}</h3>
            <div>{children}</div>
          </div>
        ))
      )}
    </>
  )
}
```

### Props With Side Effects

Use the `subscription` from the lifecycle parameter to run side effects when props change:

```tsx
function AnalyticsWrapper(
  props$: Observable<{ pageId: string; children: ElementNode }>,
  { subscription }: Lifecycle
) {
  const { pageId$, children$ } = Props.take(props$)

  // Track page views each time pageId$ emits
  subscription.add(
    pageId$.pipe(
      tap(pageId => analytics.track("page_view", { pageId }))
    ).subscribe()
  )

  return <div>{children$}</div>
}
```

---

**Next**: [Event Handling](./05-event-handling.md)
