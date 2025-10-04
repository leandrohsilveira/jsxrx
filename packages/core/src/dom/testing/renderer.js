import { vi } from "vitest"
import { DOMRenderer } from "../renderer"

/**
 * @returns {import("../../jsx").IRenderer<*, *>}
 */
export function createTestingRenderer() {
  const renderer = new DOMRenderer()
  vi.spyOn(renderer, "createElement").mockImplementation(
    throwError("createElement"),
  )
  vi.spyOn(renderer, "place").mockImplementation(throwError("place"))
  vi.spyOn(renderer, "getPlacement").mockImplementation(
    throwError("getPlacement"),
  )
  vi.spyOn(renderer, "setProperty").mockImplementation(
    throwError("setProperty"),
  )
  vi.spyOn(renderer, "listen").mockImplementation(throwError("listen"))
  vi.spyOn(renderer, "createTextNode").mockImplementation(
    throwError("createTextNode"),
  )
  vi.spyOn(renderer, "setText").mockImplementation(throwError("setText"))
  vi.spyOn(renderer, "move").mockImplementation(throwError("move"))
  return renderer
}

/**
 * @param {keyof import("../../jsx").IRenderer} method
 */
function throwError(method) {
  return () => {
    throw new Error(
      `Testing renderer "${method}" requires mocking, use vi.spyOn(renderer, '${method}') to mock it`,
    )
  }
}
