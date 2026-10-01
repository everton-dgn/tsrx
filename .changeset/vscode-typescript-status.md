---
'@tsrx/vscode-plugin': patch
---

A status item on `.tsrx` files now names the TypeScript that serves them (VS Code's built-in TypeScript or the TypeScript 7 extension's compiler version) and opens the version picker. When a setup leaves `.tsrx` files unchecked, or checked by another TypeScript than the project's, the extension says what to do, once per window: install the TypeScript 7 extension for a project on a TypeScript 7.1 nightly; point `js/ts.tsdk.path` at the project's TypeScript, install the TypeScript 7 Nightly extension or turn TypeScript 7 off when TypeScript 7 runs a compiler that cannot check `.tsrx` files (such as the 7.0.2 bundled with the TypeScript 7 extension); and install the TypeScript 7 extension when TypeScript 7 is on with only the TypeScript 7 Nightly extension. Nothing is changed or installed unless you click a button.
