---
'@tsrx/vscode-plugin': patch
---

A status item on `.tsrx` files now names the TypeScript that serves them and opens the version picker. When a setup leaves `.tsrx` files unchecked, or checked by another TypeScript than the project's, the extension says what to do, once per window. When TypeScript 7 runs its built-in 7.0.2 but the project installs a 7.1 nightly, a **Use Project TypeScript** button sets `js/ts.tsdk.path` to it. Nothing changes or installs unless you click a button. Whenever a `tsdk` setting changes which compiler TypeScript 7 should run, the extension restarts TypeScript 7, which otherwise reads these settings only when it starts.

To type-check `.tsrx` files with TypeScript 7.1, the README now gives three steps: install `typescript@next` in the project; set `"js/ts.experimental.useTsgo": true` and `"js/ts.tsdk.path": "node_modules/typescript"` in your VS Code user settings; and install the TypeScript 7 extension. The TypeScript 7 Nightly extension is not needed.
