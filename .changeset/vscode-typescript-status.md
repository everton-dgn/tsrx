---
'@tsrx/vscode-plugin': patch
---

A status item on `.tsrx` files now names the TypeScript that serves them and opens the version picker. When a setup leaves `.tsrx` files unchecked, or checked by another TypeScript than the project's, the extension says what to do, once per window. Nothing changes or installs unless you click a button.

To type-check `.tsrx` files with TypeScript 7.1, the README now gives three steps: install `typescript@next` in the project; set `"js/ts.experimental.useTsgo": true` and `"js/ts.tsdk.path": "node_modules/typescript"` in your VS Code user settings; and install the TypeScript 7 extension. The TypeScript 7 Nightly extension is not needed.
