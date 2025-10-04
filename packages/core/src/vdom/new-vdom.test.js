/**
 * @import { IRenderer } from "../jsx.js"
 */

import { Subscription } from "rxjs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createRoot } from "./new-vdom"
import { RenderElementNode } from "./render"
import { createTestingRenderer } from "../dom/testing/renderer"

describe("new-vdom", () => {
  /** @type {IRenderer<*, *>} */
  let renderer
  /** @type {Subscription} */
  let subscription

  beforeEach(() => {
    renderer = createTestingRenderer()
    subscription = new Subscription()
  })

  afterEach(() => {
    if (!subscription.closed) subscription.unsubscribe()
  })

  it("should create an element, set its properties, place it as child of root and then remove from it when unsubscribed", () => {
    const root = vi.fn()
    const element = vi.fn()

    vi.spyOn(renderer, "createElement").mockReturnValueOnce(element)
    vi.spyOn(renderer, "setProperty").mockReturnValueOnce()
    vi.spyOn(renderer, "place").mockReturnValueOnce()
    vi.spyOn(renderer, "remove").mockReturnValue()

    subscription.add(
      createRoot(renderer, root).mount(
        new RenderElementNode("id1", "div", { name: "test" }, null, null),
      ),
    )

    expect(renderer.createElement).toHaveBeenCalledOnce()
    expect(renderer.createElement).toHaveBeenLastCalledWith("div")
    expect(renderer.setProperty).toHaveBeenCalledOnce()
    expect(renderer.setProperty).toHaveBeenLastCalledWith(
      element,
      "name",
      "test",
    )
    expect(renderer.place).toHaveBeenCalledOnce()
    expect(renderer.place).toHaveBeenLastCalledWith(element, { parent: root })
    expect(renderer.remove).not.toHaveBeenCalled()

    subscription.unsubscribe()

    expect(renderer.remove).toHaveBeenCalledOnce()
    expect(renderer.remove).toHaveBeenLastCalledWith(element, root)
  })

  it("should create a text node with the given text, place it as child of root and then remove it when unsubscribed", () => {
    const root = vi.fn()
    const element = vi.fn()

    vi.spyOn(renderer, "createTextNode").mockReturnValueOnce(element)
    vi.spyOn(renderer, "place").mockReturnValueOnce()
    vi.spyOn(renderer, "remove").mockReturnValue()

    subscription.add(createRoot(renderer, root).mount("Hello"))

    expect(renderer.createTextNode).toHaveBeenCalledOnce()
    expect(renderer.createTextNode).toHaveBeenLastCalledWith("Hello")
    expect(renderer.place).toHaveBeenCalledOnce()
    expect(renderer.place).toHaveBeenLastCalledWith(element, { parent: root })
    expect(renderer.remove).not.toHaveBeenCalled()

    subscription.unsubscribe()

    expect(renderer.remove).toHaveBeenCalledOnce()
    expect(renderer.remove).toHaveBeenLastCalledWith(element, root)
  })
})
