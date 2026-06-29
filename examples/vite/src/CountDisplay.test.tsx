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
