import { RenderRawHtmlNode } from "./vdom/render"

/**
 * @param {string} id
 * @param {import("./jsx").IRenderRawHtmlNode['content']} content
 * @param {*} [key]
 * @returns {import("./jsx").IRenderRawHtmlNode}
 */
export function rawHtml(id, content, key) {
  return new RenderRawHtmlNode(id, content, key || id)
}
