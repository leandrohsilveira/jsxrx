import { describe, expect, it, vi } from "vitest"
import { ActivityAwareObservable, State } from "./observable"
import { tap } from "rxjs"

describe("State class", () => {
  it("should emit values without calling subscribers more than once per value", () => {
    const value = new State("a")

    const sub = vi.fn()

    value.subscribe(sub)

    expect(sub).toHaveBeenCalledTimes(1)
    expect(sub).toHaveBeenLastCalledWith("a")

    value.set("b")

    expect(sub).toHaveBeenCalledTimes(2)
    expect(sub).toHaveBeenLastCalledWith("b")

    value.set("c")

    expect(sub).toHaveBeenCalledTimes(3)
    expect(sub).toHaveBeenLastCalledWith("c")
  })

  it("observables from it should not be called more thant once per value emited", () => {
    const value = new State("a")

    const sub = vi.fn()

    value.pipe(tap()).subscribe(sub)

    expect(sub).toHaveBeenCalledTimes(1)
    expect(sub).toHaveBeenLastCalledWith("a")

    value.set("b")

    expect(sub).toHaveBeenCalledTimes(2)
    expect(sub).toHaveBeenLastCalledWith("b")

    value.set("c")

    expect(sub).toHaveBeenCalledTimes(3)
    expect(sub).toHaveBeenLastCalledWith("c")
  })

  it("pipe function should return a ActivityAwareObservable", () => {
    const value = new State("a")

    expect(value).toBeInstanceOf(ActivityAwareObservable)
  })

  it("calls to next should only emit to pending$ subject when it has subscriptions", () => {
    const value = new State("a")

    const pending = vi.fn()

    value.pending$.subscribe(pending)

    expect(pending).toHaveBeenCalledTimes(1)
    expect(pending).toHaveBeenLastCalledWith(false)

    value.set("b")

    expect(pending).toHaveBeenCalledTimes(1)
    expect(pending).toHaveBeenLastCalledWith(false)

    const sub = vi.fn()
    value.subscribe(sub)

    expect(pending).toHaveBeenCalledTimes(2)
    expect(pending).toHaveBeenLastCalledWith(true)

    const sub2 = vi.fn()
    value.subscribe(sub2)

    expect(pending).toHaveBeenCalledTimes(2)
    expect(pending).toHaveBeenLastCalledWith(true)
  })
})
