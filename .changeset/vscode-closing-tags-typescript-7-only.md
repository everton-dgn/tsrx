---
'@tsrx/vscode-plugin': patch
---

The extension now closes JSX tags in `.tsrx` files itself only while TypeScript 7 serves them (`js/ts.experimental.useTsgo` on and a TypeScript 7 extension installed). With VS Code's built-in TypeScript, TypeScript closes them through `@tsrx/typescript-plugin` (`js/ts.autoClosingTags.enabled`), so the two no longer race to insert the same closing tag. The TypeScript 7 extension does not close tags in `.tsrx` files yet (microsoft/TypeScript#64564); `tsrx.autoClosingTags.enabled` now only applies on TypeScript 7.
