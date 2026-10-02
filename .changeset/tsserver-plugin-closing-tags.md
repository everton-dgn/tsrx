---
'@tsrx/typescript-plugin': patch
---

The tsserver plugin now answers TypeScript's closing-tag request (`getJsxClosingTagAtPosition`) for `.tsrx` files by mapping the typed position into the generated code. Volar's language-service proxy leaves this request out, so tsserver used to read the `.tsrx` position against the generated TSX and find nothing. Editors that close JSX tags through tsserver, such as VS Code's built-in TypeScript (`js/ts.autoClosingTags.enabled`), now close tags in `.tsrx` files too.
