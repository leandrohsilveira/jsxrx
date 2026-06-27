# JsxRx Documentation

JsxRx is a **Component-driven JavaScript UI Library** that uses JSX for building components, powered by **RxJS observables** for reactivity. Build declarative, reactive user interfaces with a familiar component model and fine-grained observable subscriptions.

---

## Getting Started

- [quickstart.md](quickstart.md) — Setup guide: installation, Vite configuration, and your first component
- [examples/counter.md](examples/counter.md) — Counter app example (runnable)
- [examples/todo-app.md](examples/todo-app.md) — Todo app example with component composition and derived state (runnable)

## Core Concepts

- [core-concepts/observables.md](core-concepts/observables.md) — How RxJS Observables drive JsxRx reactivity
- [core-concepts/components-and-props.md](core-concepts/components-and-props.md) — Components, props model, `Props.take()` and `Props.spread()`
- [core-concepts/state-management.md](core-concepts/state-management.md) — State cells, derived state, activity tracking, emitters
- [core-concepts/suspense.md](core-concepts/suspense.md) — Suspense boundaries, auto-suspending for activity-aware observables, and surgical loading states
- [core-concepts/context.md](core-concepts/context.md) — Context API: reactive state sharing via `ContextMap` (in components and resolvers)
- [core-concepts/routing.md](core-concepts/routing.md) — Declarative routing, route trees, resolvers, and lazy loading
- [core-concepts/jsx-in-depth.md](core-concepts/jsx-in-depth.md) — JSX transpilation, runtime functions, VDOM node types

## API Reference

- [api/core.md](api/core.md) — `@jsxrx/core` complete API: state, components, context, style, DOM, JSX runtime
- [api/router.md](api/router.md) — `@jsxrx/router` and `@jsxrx/router/browser`: route definitions, BrowserRouter, URL matching
- [api/api-client.md](api/api-client.md) — `@jsxrx/api`: HTTP client, endpoints, `fetch()` vs `action()` modes
- [api/utils.md](api/utils.md) — `@jsxrx/utils`: assertion, array/object/observable helpers
- [api/compiler.md](api/compiler.md) — `@jsxrx/compiler`: AST transform for build-time optimization
- [api/vite-plugin.md](api/vite-plugin.md) — `@jsxrx/vite-plugin`: Vite plugin configuration

## Patterns

- [patterns/route-resolver.md](patterns/route-resolver.md) — Co-located resolver pattern: separating data/logic from presentation
- [patterns/api-usage.md](patterns/api-usage.md) — API endpoint usage: reactive `fetch()` vs imperative `action()` modes
- [patterns/event-handling.md](patterns/event-handling.md) — Event handling: `emitter()` and `fromRefEvent()` patterns
- [patterns/lazy-loading.md](patterns/lazy-loading.md) — Code splitting: `lazy()` and `lazyResolver()` for components and resolvers

## Quick Links

- [Core package README](../packages/core/README.md) — Quickstart guide for `@jsxrx/core`
