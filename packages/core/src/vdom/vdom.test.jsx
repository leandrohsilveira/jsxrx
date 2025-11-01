/**
 * @import { ElementNode, IRenderer } from "../jsx.js"
 */

import { BehaviorSubject, map, of, Subject, Subscription } from "rxjs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createRoot } from "./vdom"
import { createTestingRenderer } from "../dom/testing/renderer"

describe("vdom module", () => {
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

  it("should create an element, set its properties, mount its childrens and place it as child of root and then remove from it when unsubscribed", () => {
    const root = vi.fn()
    const element = {
      parentElement: root,
    }
    const firstChild = {
      parentElement: element,
    }
    const secondChild = {
      parentElement: element,
    }

    vi.spyOn(renderer, "createElement").mockReturnValueOnce(element)
    vi.spyOn(renderer, "createElement").mockReturnValueOnce(firstChild)
    vi.spyOn(renderer, "createElement").mockReturnValueOnce(secondChild)
    vi.spyOn(renderer, "setProperty").mockReturnValue()
    vi.spyOn(renderer, "place").mockReturnValue()
    vi.spyOn(renderer, "remove").mockReturnValue()

    subscription.add(
      createRoot(renderer, root).mount(
        <main className="test1">
          <header className="test2"></header>
          <footer className="test3"></footer>
        </main>,
      ),
    )

    expect(renderer.createElement).toHaveBeenCalledTimes(3)
    expect(renderer.createElement).toHaveBeenNthCalledWith(1, "main")
    expect(renderer.createElement).toHaveBeenNthCalledWith(2, "header")
    expect(renderer.createElement).toHaveBeenNthCalledWith(3, "footer")
    expect(renderer.setProperty).toHaveBeenCalledTimes(3)
    expect(renderer.setProperty).toHaveBeenNthCalledWith(
      1,
      element,
      "className",
      "test1",
    )
    expect(renderer.setProperty).toHaveBeenNthCalledWith(
      2,
      firstChild,
      "className",
      "test2",
    )
    expect(renderer.setProperty).toHaveBeenNthCalledWith(
      3,
      secondChild,
      "className",
      "test3",
    )
    expect(renderer.place).toHaveBeenCalledTimes(3)
    expect(renderer.place).toHaveBeenNthCalledWith(1, firstChild, {
      parent: element,
    })
    expect(renderer.place).toHaveBeenNthCalledWith(2, secondChild, {
      parent: element,
      lastElement: firstChild,
    })
    expect(renderer.place).toHaveBeenNthCalledWith(3, element, { parent: root })
    expect(renderer.remove).not.toHaveBeenCalled()

    subscription.unsubscribe()

    expect(renderer.remove).toHaveBeenCalledTimes(3)
    expect(renderer.remove).toHaveBeenNthCalledWith(1, element, root)
    expect(renderer.remove).toHaveBeenNthCalledWith(2, firstChild, element)
    expect(renderer.remove).toHaveBeenNthCalledWith(3, secondChild, element)
  })

  it("should create an element node, set observable props on mount, update props if the observable updates", () => {
    const root = vi.fn()
    const element = {
      parentElement: root,
    }

    vi.spyOn(renderer, "createElement").mockReturnValueOnce(element)
    vi.spyOn(renderer, "setProperty").mockReturnValue()
    vi.spyOn(renderer, "place").mockReturnValue()
    vi.spyOn(renderer, "remove").mockReturnValue()

    const value$ = new BehaviorSubject("value1")

    subscription.add(
      createRoot(renderer, root).mount(<input type="text" value={value$} />),
    )

    expect(renderer.createElement).toHaveBeenCalledTimes(1)
    expect(renderer.createElement).toHaveBeenNthCalledWith(1, "input")
    expect(renderer.setProperty).toHaveBeenCalledTimes(2)
    expect(renderer.setProperty).toHaveBeenNthCalledWith(
      1,
      element,
      "type",
      "text",
    )
    expect(renderer.setProperty).toHaveBeenNthCalledWith(
      2,
      element,
      "value",
      "value1",
    )

    value$.next("value2")

    expect(renderer.setProperty).toHaveBeenCalledTimes(3)
    expect(renderer.setProperty).toHaveBeenNthCalledWith(
      3,
      element,
      "value",
      "value2",
    )
  })

  it("should create an element node, attach event listeners, place its childrens, call event listeners when events are emitted, and remove listeners when unsubscribed", () => {
    const root = vi.fn()
    const element = {
      parentElement: root,
    }
    const elementText = {
      parentElement: element,
    }

    const eventEmitter = new Subject()
    const unsubEvent = vi.fn()

    vi.spyOn(renderer, "createElement").mockReturnValueOnce(element)
    vi.spyOn(renderer, "createTextNode").mockReturnValueOnce(elementText)
    vi.spyOn(renderer, "listen").mockImplementationOnce((e, n, listener) => {
      const sub = eventEmitter.subscribe(() => listener())
      sub.add(unsubEvent)
      return () => sub.unsubscribe()
    })
    vi.spyOn(renderer, "place").mockReturnValue()
    vi.spyOn(renderer, "remove").mockReturnValue()

    const onClick = vi.fn()

    subscription.add(
      createRoot(renderer, root).mount(
        <button onClick={onClick}>Click</button>,
      ),
    )

    expect(renderer.createElement).toHaveBeenCalledTimes(1)
    expect(renderer.createElement).toHaveBeenNthCalledWith(1, "button")
    expect(renderer.createTextNode).toHaveBeenCalledTimes(1)
    expect(renderer.createTextNode).toHaveBeenNthCalledWith(1, "Click")
    expect(renderer.listen).toHaveBeenCalledTimes(1)
    expect(renderer.listen).toHaveBeenNthCalledWith(
      1,
      element,
      "onClick",
      expect.any(Function),
    )

    expect(renderer.place).toHaveBeenCalledTimes(2)
    expect(renderer.place).toHaveBeenNthCalledWith(1, elementText, {
      parent: element,
    })
    expect(renderer.place).toHaveBeenNthCalledWith(2, element, { parent: root })

    expect(onClick).not.toHaveBeenCalled()

    eventEmitter.next(1)

    expect(onClick).toHaveBeenCalledTimes(1)
    expect(unsubEvent).not.toHaveBeenCalled()
    expect(renderer.remove).not.toHaveBeenCalled()

    subscription.unsubscribe()

    expect(unsubEvent).toHaveBeenCalledTimes(1)
    expect(renderer.remove).toHaveBeenCalledTimes(2)
    expect(renderer.remove).toHaveBeenNthCalledWith(1, element, root)
    expect(renderer.remove).toHaveBeenNthCalledWith(2, elementText, element)

    eventEmitter.next(2)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it("should create an element node, attach observables to event listeners, place its childrens, call event listeners when events are emitted, and remove listeners when unsubscribed", () => {
    const root = vi.fn()
    const element = {
      parentElement: root,
    }
    const elementText = {
      parentElement: element,
    }

    const eventEmitter = new Subject()
    const unsubEvent = vi.fn()

    vi.spyOn(renderer, "createElement").mockReturnValueOnce(element)
    vi.spyOn(renderer, "createTextNode").mockReturnValueOnce(elementText)
    vi.spyOn(renderer, "listen").mockImplementationOnce((e, n, listener) => {
      const sub = eventEmitter.subscribe(() => listener())
      sub.add(unsubEvent)
      return () => sub.unsubscribe()
    })
    vi.spyOn(renderer, "place").mockReturnValue()
    vi.spyOn(renderer, "remove").mockReturnValue()

    const onClick1 = vi.fn()
    const onClick2 = vi.fn()

    const onClick$ = new BehaviorSubject(onClick1)

    subscription.add(
      createRoot(renderer, root).mount(
        <button onClick={onClick$}>Click</button>,
      ),
    )

    expect(renderer.createElement).toHaveBeenCalledTimes(1)
    expect(renderer.createElement).toHaveBeenNthCalledWith(1, "button")
    expect(renderer.createTextNode).toHaveBeenCalledTimes(1)
    expect(renderer.createTextNode).toHaveBeenNthCalledWith(1, "Click")
    expect(renderer.listen).toHaveBeenCalledTimes(1)
    expect(renderer.listen).toHaveBeenNthCalledWith(
      1,
      element,
      "onClick",
      expect.any(Function),
    )

    expect(renderer.place).toHaveBeenCalledTimes(2)
    expect(renderer.place).toHaveBeenNthCalledWith(1, elementText, {
      parent: element,
    })
    expect(renderer.place).toHaveBeenNthCalledWith(2, element, { parent: root })

    expect(onClick1).not.toHaveBeenCalled()

    eventEmitter.next(1)

    expect(onClick1).toHaveBeenCalledTimes(1)
    expect(unsubEvent).not.toHaveBeenCalled()
    expect(renderer.remove).not.toHaveBeenCalled()

    onClick$.next(onClick2)
    expect(renderer.listen).toHaveBeenCalledTimes(1)

    eventEmitter.next(2)
    expect(onClick1).toHaveBeenCalledTimes(1)
    expect(onClick2).toHaveBeenCalledTimes(1)
    expect(unsubEvent).not.toHaveBeenCalled()
    expect(renderer.remove).not.toHaveBeenCalled()

    subscription.unsubscribe()

    expect(unsubEvent).toHaveBeenCalledTimes(1)
    expect(renderer.remove).toHaveBeenCalledTimes(2)
    expect(renderer.remove).toHaveBeenNthCalledWith(1, element, root)
    expect(renderer.remove).toHaveBeenNthCalledWith(2, elementText, element)

    eventEmitter.next(3)
    expect(onClick1).toHaveBeenCalledTimes(1)
    expect(onClick2).toHaveBeenCalledTimes(1)
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

  it("should create a fragment node, placing its children as child of given element in parent position, and then remove them when unsubscribed", () => {
    const root = vi.fn()
    const firstChild = {
      parentElement: root,
    }
    const secondChild = {
      parentElement: root,
    }

    vi.spyOn(renderer, "createTextNode").mockReturnValueOnce(firstChild)
    vi.spyOn(renderer, "createTextNode").mockReturnValueOnce(secondChild)
    vi.spyOn(renderer, "place").mockReturnValue()
    vi.spyOn(renderer, "remove").mockReturnValue()

    subscription.add(
      createRoot(renderer, root).mount(
        <>
          {"Foo"}
          {"Bar"}
        </>,
      ),
    )

    expect(renderer.createTextNode).toHaveBeenCalledTimes(2)
    expect(renderer.createTextNode).toHaveBeenNthCalledWith(1, "Foo")
    expect(renderer.createTextNode).toHaveBeenNthCalledWith(2, "Bar")

    expect(renderer.place).toHaveBeenCalledTimes(2)
    expect(renderer.place).toHaveBeenNthCalledWith(1, firstChild, {
      parent: root,
    })
    expect(renderer.place).toHaveBeenNthCalledWith(2, secondChild, {
      parent: root,
      lastElement: firstChild,
    })

    expect(renderer.remove).not.toHaveBeenCalled()

    subscription.unsubscribe()

    expect(renderer.remove).toHaveBeenCalledTimes(2)
    expect(renderer.remove).toHaveBeenNthCalledWith(1, firstChild, root)
    expect(renderer.remove).toHaveBeenNthCalledWith(2, secondChild, root)
  })

  it("should create an observable node, mount and place its contents, and remove it when unsubscribed", () => {
    const root = vi.fn()
    const firstChild = {
      parentElement: root,
    }
    const secondChild = {
      parentElement: root,
    }

    vi.spyOn(renderer, "place").mockReturnValue()
    vi.spyOn(renderer, "remove").mockReturnValue()

    const content$ = new BehaviorSubject(/** @type {ElementNode} */ (null))

    vi.spyOn(renderer, "createTextNode").mockReturnValueOnce(firstChild)
    vi.spyOn(renderer, "createTextNode").mockReturnValueOnce(secondChild)

    subscription.add(
      createRoot(renderer, root).mount(
        content$.pipe(
          map(text => {
            if (text === null) return null
            return (
              <>
                {text}
                {"Bar"}
              </>
            )
          }),
        ),
      ),
    )

    expect(renderer.createTextNode).not.toHaveBeenCalled()
    expect(renderer.createElement).not.toHaveBeenCalled()
    expect(renderer.place).not.toHaveBeenCalled()

    content$.next("Foo")

    expect(renderer.createTextNode).toHaveBeenCalledTimes(2)
    expect(renderer.createTextNode).toHaveBeenNthCalledWith(1, "Foo")
    expect(renderer.createTextNode).toHaveBeenNthCalledWith(2, "Bar")

    expect(renderer.place).toHaveBeenCalledTimes(2)
    expect(renderer.place).toHaveBeenNthCalledWith(1, firstChild, {
      parent: root,
    })
    expect(renderer.place).toHaveBeenNthCalledWith(2, secondChild, {
      parent: root,
      lastElement: firstChild,
    })

    expect(renderer.remove).not.toHaveBeenCalled()

    vi.spyOn(renderer, "setText").mockReturnValueOnce()

    content$.next("Foo 2")

    expect(renderer.setText).toHaveBeenCalledTimes(1)
    expect(renderer.setText).toHaveBeenNthCalledWith(1, "Foo 2", firstChild)
    expect(renderer.remove).not.toHaveBeenCalled()

    const element = {
      parentElement: root,
    }

    const newText = {
      parentElement: element,
    }

    vi.spyOn(renderer, "createElement").mockReset().mockReturnValueOnce(element)
    vi.spyOn(renderer, "createTextNode")
      .mockReset()
      .mockReturnValueOnce(newText)
    vi.spyOn(renderer, "place").mockReset().mockReturnValue()

    content$.next(<div>Baz</div>)

    expect(renderer.remove).toHaveBeenCalledTimes(1)
    expect(renderer.remove).toHaveBeenNthCalledWith(1, firstChild, root)
    expect(renderer.createElement).toHaveBeenCalledTimes(1)
    expect(renderer.createElement).toHaveBeenNthCalledWith(1, "div")
    expect(renderer.createTextNode).toHaveBeenCalledTimes(1)
    expect(renderer.createTextNode).toHaveBeenNthCalledWith(1, "Baz")

    expect(renderer.place).toHaveBeenCalledTimes(2)
    expect(renderer.place).toHaveBeenNthCalledWith(1, newText, {
      parent: element,
    })
    expect(renderer.place).toHaveBeenNthCalledWith(2, element, { parent: root })

    vi.spyOn(renderer, "remove").mockReset().mockReturnValue()

    subscription.unsubscribe()

    expect(renderer.remove).toHaveBeenCalledTimes(3)
    expect(renderer.remove).toHaveBeenNthCalledWith(1, element, root)
    expect(renderer.remove).toHaveBeenNthCalledWith(2, secondChild, root)
    expect(renderer.remove).toHaveBeenNthCalledWith(3, newText, element)
  })

  it("should create an array node, place its childrens, and remove them when unsubscribed", () => {
    const values = [
      {
        id: crypto.randomUUID(),
        value: "Test 1",
      },
      {
        id: crypto.randomUUID(),
        value: "Test 2",
      },
    ]

    const root = vi.fn()
    const element = {
      parentElement: root,
    }
    const firstChild = {
      parentElement: element,
    }
    const firstChildText = {
      parentElement: firstChild,
    }
    const secondChild = {
      parentElement: element,
    }
    const secondChildText = {
      parentElement: secondChild,
    }

    vi.spyOn(renderer, "createElement").mockReturnValueOnce(element)
    vi.spyOn(renderer, "createElement").mockReturnValueOnce(firstChild)
    vi.spyOn(renderer, "createElement").mockReturnValueOnce(secondChild)
    vi.spyOn(renderer, "createTextNode").mockReturnValueOnce(firstChildText)
    vi.spyOn(renderer, "createTextNode").mockReturnValueOnce(secondChildText)
    vi.spyOn(renderer, "place").mockReturnValue()
    vi.spyOn(renderer, "remove").mockReturnValue()

    subscription.add(
      createRoot(renderer, root).mount(
        <main>
          {values.map(item => (
            <div key={item.id}>{item.value}</div>
          ))}
        </main>,
      ),
    )

    expect(renderer.createElement).toHaveBeenCalledTimes(3)
    expect(renderer.createElement).toHaveBeenNthCalledWith(1, "main")
    expect(renderer.createElement).toHaveBeenNthCalledWith(2, "div")
    expect(renderer.createElement).toHaveBeenNthCalledWith(3, "div")
    expect(renderer.createTextNode).toHaveBeenNthCalledWith(1, values[0].value)
    expect(renderer.createTextNode).toHaveBeenNthCalledWith(2, values[1].value)
    expect(renderer.place).toHaveBeenCalledTimes(5)
    expect(renderer.place).toHaveBeenNthCalledWith(1, firstChildText, {
      parent: firstChild,
    })
    expect(renderer.place).toHaveBeenNthCalledWith(2, secondChildText, {
      parent: secondChild,
    })
    expect(renderer.place).toHaveBeenNthCalledWith(3, firstChild, {
      parent: element,
    })

    expect(renderer.place).toHaveBeenNthCalledWith(4, secondChild, {
      parent: element,
      lastElement: firstChild,
    })
    expect(renderer.place).toHaveBeenNthCalledWith(5, element, { parent: root })
    expect(renderer.remove).not.toHaveBeenCalled()

    subscription.unsubscribe()

    expect(renderer.remove).toHaveBeenCalledTimes(5)
    expect(renderer.remove).toHaveBeenNthCalledWith(1, element, root)
    expect(renderer.remove).toHaveBeenNthCalledWith(2, firstChild, element)
    expect(renderer.remove).toHaveBeenNthCalledWith(
      3,
      firstChildText,
      firstChild,
    )
    expect(renderer.remove).toHaveBeenNthCalledWith(4, secondChild, element)
    expect(renderer.remove).toHaveBeenNthCalledWith(
      5,
      secondChildText,
      secondChild,
    )
  })

  it("should create a component node, place its content and removed it when unsubscribed", () => {
    const root = vi.fn()
    const element = {
      parentElement: root,
    }
    const elementText = {
      parentElement: element,
    }

    vi.spyOn(renderer, "createElement").mockReturnValueOnce(element)
    vi.spyOn(renderer, "createTextNode").mockReturnValueOnce(elementText)
    vi.spyOn(renderer, "place").mockReturnValue()
    vi.spyOn(renderer, "remove").mockReturnValue()

    subscription.add(createRoot(renderer, root).mount(<TestComponent />))

    expect(renderer.createElement).toHaveBeenCalledTimes(1)
    expect(renderer.createElement).toHaveBeenNthCalledWith(1, "div")
    expect(renderer.createTextNode).toHaveBeenCalledTimes(1)
    expect(renderer.createTextNode).toHaveBeenNthCalledWith(1, "Hello world")

    expect(renderer.place).toHaveBeenCalledTimes(2)
    expect(renderer.place).toHaveBeenNthCalledWith(1, elementText, {
      parent: element,
    })
    expect(renderer.place).toHaveBeenNthCalledWith(2, element, { parent: root })

    expect(renderer.remove).not.toHaveBeenCalled()

    subscription.unsubscribe()

    expect(renderer.remove).toHaveBeenCalledTimes(2)
    expect(renderer.remove).toHaveBeenNthCalledWith(1, element, root)
    expect(renderer.remove).toHaveBeenNthCalledWith(2, elementText, element)

    function TestComponent() {
      return <div>Hello world</div>
    }
  })
})
