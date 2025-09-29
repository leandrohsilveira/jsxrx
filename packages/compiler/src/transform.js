import { createHash } from "crypto"
import { assert } from "@jsxrx/utils"
import { walk } from "zimmerframe"

/**
 * @param {*} node
 * @param {string} id
 */
function generateLocationKey(node, id) {
  assert(
    typeof node.start === "number" && typeof node.end === "number",
    "Node must have start and end properties",
  )
  const locationString = `${id}:${node.start}:${node.end}`
  return createHash("sha256")
    .update(locationString)
    .digest("hex")
    .substring(0, 8)
}

/**
 * @param {*} ast
 * @param {string} id
 */
export function transform(ast, id) {
  return walk(
    ast,
    {},
    {
      CallExpression(node, { next }) {
        if (node.callee.name === "jsx" || node.callee.name === "jsxs") {
          const locationKey = generateLocationKey(node, id)
          node = next({}) ?? node
          return {
            ...node,
            arguments: [
              {
                type: "Literal",
                value: locationKey,
                raw: JSON.stringify(locationKey),
              },
              ...node.arguments,
            ],
          }
        }
        return next({})
      },
    },
  )
}
