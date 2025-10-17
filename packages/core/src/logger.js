/**
 * @import {VRenderEvent} from "./vdom/types.js"
 */

/** @exports @typedef {keyof Logger} LoggingEvents */

export class Logger {
  /**
   * @param {Set<LoggingEvents>} [events=new Set()]
   */
  constructor(events = new Set()) {
    this.#logger = console
    this.#events = events
  }

  #events
  #logger

  /**
   * @param {VRenderEvent<*, *>} event
   */
  publishEvent(event) {
    if (!this.#events.has("publishEvent")) return
    this.#logger.debug("[BATCH] Render Events: Published", event)
  }

  /**
   * @param {VRenderEvent<*, *>[]} events
   */
  beginBatch(events) {
    if (!this.#events.has("beginBatch")) return
    this.#logger.debug("[BATCH] Render Events: BEGIN", events)
  }

  /**
   * @param {VRenderEvent<*, *>[]} events
   */
  completeBatch(events) {
    if (!this.#events.has("completeBatch")) return
    this.#logger.debug("[BATCH] Render Events: COMPLETED", events)
  }

  /**
   * @param {VRenderEvent<*, *>} event
   */
  placeEvent(event) {
    if (!this.#events.has("placeEvent")) return
    this.#logger.debug("[BATCH] Render Events: Placing", event.payload, {
      ...event.position,
    })
  }

  /**
   * @param {VRenderEvent<*, *>} event
   */
  moveEvent(event) {
    if (!this.#events.has("moveEvent")) return
    this.#logger.debug("[BATCH] Render Events: Moving", event.payload, {
      ...event.position,
    })
  }

  /**
   * @param {VRenderEvent<*, *>} event
   */
  removeEvent(event) {
    if (!this.#events.has("removeEvent")) return
    this.#logger.debug("[BATCH] Render Events: Removing", event.payload, {
      ...event.position,
    })
  }
}
