# `@jsxrx/compiler` API Reference

## `transform(ast, id)`

**Purpose**: Walks an AST (Abstract Syntax Tree) using `zimmerframe` and injects location-based SHA-256 hash keys as the first argument (`id`) to `jsx()` and `jsxs()` call expressions. This provides stable, deterministic IDs for VDOM diffing based on source code location, improving reconciliation performance during production builds.

**Signature**: `transform(ast: any, id: string): any`

**Parameters**:
- `ast` — The AST of a JSX/TSX file (provided by the build tool)
- `id` — A unique identifier for the file being transformed

**Returns**: The transformed AST with injected ID arguments.

**Usage**: This is automatically applied by the `@jsxrx/vite-plugin` during production builds. Developers don't need to call it directly.

**How it works**:
- Walks the AST looking for `CallExpression` nodes where the callee is `jsx` or `jsxs`
- Computes a SHA-256 hash of the source location (`id:start:end`)
- Truncates the hash to 8 characters
- Injects this hash as the first argument to the call expression

Reference source: `packages/compiler/src/transform.js`.
