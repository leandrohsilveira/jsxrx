/**
 * @vitest-environment jsdom
 */
import {
  act,
  render,
  wait,
  waitForNextBatchCompleted,
} from "@jsxrx/testing-library"
import { describe, expect, it } from "vitest"
import { userEvent } from "@testing-library/user-event"
import App from "./App.js"

describe("App component", () => {
  it("renders the suspended nodes", async () => {
    const { findByText } = render(<App />)

    expect(await findByText("Count is ?")).toBeInTheDocument()
    expect(await findByText("Loading count...")).toBeInTheDocument()
  })

  it("renders the count when available", async () => {
    const { findByText } = render(<App />)

    await wait(1000)
    await waitForNextBatchCompleted()

    expect(await findByText("Count is even")).toBeInTheDocument()
    expect(await findByText("The count is 0")).toBeInTheDocument()
  })

  it("the increase and disable buttons are disable while count is loading", async () => {
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

    await wait(1000)
    await waitForNextBatchCompleted()

    const increaseButton = await findByText("Increase")

    await act(async () => {
      await user.click(increaseButton)
    })

    expect(await findByText("Count is odd")).toBeInTheDocument()
    expect(await findByText("The count is 1")).toBeInTheDocument()
  })

  it("should decrease the count after the delay when clicking on decrease button", async () => {
    const user = userEvent.setup()

    const { findByText } = render(<App />)

    await wait(1000)
    await waitForNextBatchCompleted()

    const decreaseButton = await findByText("Decrease")

    await user.click(decreaseButton)

    await waitForNextBatchCompleted()

    expect(await findByText("Count is odd")).toBeInTheDocument()
    expect(await findByText("The count is -1")).toBeInTheDocument()
  })
})
