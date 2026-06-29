import { cleanup } from "./render.js"

await handleVitest()

async function handleVitest() {
  try {
    const { expect, afterEach } = await import("vitest")
    afterEach(() => cleanup())

    const matchers = await import("@testing-library/jest-dom/vitest")
    expect.extend(matchers.default)
  } catch {
    // TODO:
  }
}
