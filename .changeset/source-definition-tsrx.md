---
'@tsrx/typescript-plugin': patch
'@tsrx/vscode-plugin': patch
---

**Go to Source Definition** now works in `.tsrx` files with VS Code's own TypeScript (5.9 or 6). Like Go to Definition, it opens a symbol's definition, but it goes past a `.d.ts` file to the JavaScript behind it: `useState` opens React's JavaScript, not `@types/react`. Before, the command only ran Go to Definition. VS Code's own Go to Source Definition runs only in TypeScript and JavaScript files.

`@tsrx/typescript-plugin` adds the request the extension sends, `_tsrx:findSourceDefinition`, and fixes tsserver's `findSourceDefinition` for `.tsrx` files. It used to fail with "Debug Failure. Script kind should match provided ScriptKind" for a symbol from a library: tsserver checks the library in a helper project without plugins, which read the `.tsrx` file as plain TypeScript. The plugin now sets up that helper project too.

With TypeScript 7, the command opens the definition and says that Go to Source Definition does not work in `.tsrx` files yet: `tsc --lsp` can answer the request, but the TypeScript 7 extension runs its command only in TypeScript and JavaScript files (microsoft/TypeScript#64576).
