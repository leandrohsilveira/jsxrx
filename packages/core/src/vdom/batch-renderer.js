/**
 * @import { ElementPosition, IRenderer } from "../jsx.js"
 * @import { VRenderEvent } from "./types.js"
 * @import { Logger } from "../logger.js"
 */

import { assert } from "@jsxrx/utils"
import { buffer, debounceTime, filter, Subject, tap } from "rxjs"
import { VRenderEventType } from "../constants/render.js"

/**
 * @template T
 * @template E
 * @implements {IRenderer<T, E>}
 */
export class BatchRenderer {
  /**
   * @param {IRenderer<T, E>} renderer
   * @param {number} batchTime
   * @param {Object} [options]
   * @param {Logger} [options.logger]
   * @param {Subject<VRenderEvent<T, E>>} [options.publisher$=new Subject()]
   */
  constructor(
    renderer,
    batchTime,
    { publisher$ = new Subject(), logger } = {},
  ) {
    assert(batchTime > 0, "BatchRenderer batchTime must be greater than zero!")
    this.#renderer = renderer
    this.#publisher$ = publisher$
    this.#logger = logger
    this.batchTime = batchTime
  }

  #logger
  #renderer
  #publisher$

  /**
   * @param {string} text
   */
  createTextNode(text) {
    return this.#renderer.createTextNode(text)
  }
  /**
   * @param {string} tag
   */
  createElement(tag) {
    return this.#renderer.createElement(tag)
  }

  /**
   * @param {string} text
   * @param {T} node
   */
  setText(text, node) {
    return this.#renderer.setText(text, node)
  }

  /**
   * @param {E} element
   * @param {string} name
   * @param {unknown} value
   */
  setProperty(element, name, value) {
    return this.#renderer.setProperty(element, name, value)
  }

  /**
   * @param {E} element
   * @param {string} name
   * @param {() => void} listener
   */
  listen(element, name, listener) {
    return this.#renderer.listen(element, name, listener)
  }
  /**
   * @param {string[]} names
   */
  determinePropsAndEvents(names) {
    return this.#renderer.determinePropsAndEvents(names)
  }

  /**
   * @param {T | E} node
   */
  getParent(node) {
    return this.#renderer.getParent(node)
  }

  /**
   * @param {T | E} node
   * @param {ElementPosition<T, E>} position
   */
  place(node, position) {
    this.#publisher$.next({
      event: VRenderEventType.PLACE,
      payload: node,
      position,
    })
  }

  /**
   * @param {T | E} node
   * @param {ElementPosition<T, E>} position
   */
  move(node, position) {
    this.#publisher$.next({
      event: VRenderEventType.MOVE,
      payload: node,
      position,
    })
  }

  /**
   * @param {T | E} node
   * @param {E} target
   */
  remove(node, target) {
    this.#publisher$.next({
      event: VRenderEventType.REMOVE,
      payload: node,
      position: {
        parent: target,
      },
    })
  }

  subscribe() {
    return this.#publisher$
      .pipe(
        tap({
          next: event => {
            this.#logger?.publishEvent(event)
          },
          error: error =>
            console.error("[BATCH] Render Events: Publish error", error),
        }),
        buffer(this.#publisher$.pipe(debounceTime(this.batchTime))),
        filter(events => events.length > 0),
      )
      .subscribe(events => {
        this.#logger?.beginBatch(events)
        /** @type {Set<T | E>} */
        const toPlace = new Set()
        /** @type {Set<T | E>} */
        const toRemove = new Set()
        for (const event of events) {
          switch (event.event) {
            case VRenderEventType.PLACE:
              toPlace.add(event.payload)
              break
            case VRenderEventType.REMOVE:
              toRemove.add(event.payload)
              break
            default:
              break
          }
        }

        for (const event of events) {
          switch (event.event) {
            case VRenderEventType.PLACE:
              if (toRemove.has(event.payload)) break
              this.#logger?.placeEvent(event)
              this.#renderer.place(event.payload, event.position)
              break
            case VRenderEventType.MOVE:
              this.#logger?.moveEvent(event)
              this.#renderer.move(event.payload, event.position)
              break
            case VRenderEventType.REMOVE:
              if (toPlace.has(event.payload)) break
              this.#logger?.removeEvent(event)
              this.#renderer.remove(event.payload, event.position.parent)
              break
          }
        }
        this.#logger?.completeBatch(events)
      })
  }
}
