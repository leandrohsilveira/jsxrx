/**
 * @import { LoggingEvents } from "./logger.js"
 */
import { Logger } from "./logger.js"

/**
 * @param {('publishEvents' | 'batchEvents')[]} [groups=['publishEvents', 'batchEvents']]
 */
export function createDebugLogger(groups = ["publishEvents", "batchEvents"]) {
  /** @type {Set<LoggingEvents>} */
  const events = new Set()
  for (const group of groups) {
    switch (group) {
      case "publishEvents":
        events.add("publishEvent")
        break
      case "batchEvents":
        events.add("beginBatch")
        events.add("completeBatch")
        events.add("placeEvent")
        events.add("removeEvent")
        break
    }
  }

  return new Logger(events)
}
