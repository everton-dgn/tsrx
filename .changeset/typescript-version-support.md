---
'@tsrx/typescript-plugin': minor
'@tsrx/language-server': minor
'@tsrx/content-mapper': patch
'@tsrx/vscode-plugin': minor
---

Support TypeScript 6: the `typescript` peer dependency range of `@tsrx/typescript-plugin` and `@tsrx/language-server` is now `^5.9.3 || ^6.0.0 || ^7.1.0-dev.20260923.1` (the classic path passes its whole test suite on 6.0.3; TypeScript 7 is for `tsrx-tsc` and the language server's native backend). `@tsrx/content-mapper` declares that range as its own dependency, so a project whose `typescript` is the native TypeScript 7 package (a launcher without a JavaScript API) can still run the mapper. `tsrx-tsc`, the language server and the mapper now stop with an explanation when they resolve a TypeScript 7 package instead of failing on its export map. The mapper documents its minimum TypeScript build (`7.1.0-dev.20260923.1`, the first nightly whose `tsc --watch` recompiles; the stable 7.0 line has no content-mapper protocol), and the test suite runs against another build through `TSRX_NATIVE_TSC`. The TypeScript 7 messages of `tsrx-tsc` and the language server say that TypeScript 7 support is not complete and link tsrx-org/tsrx#136, which tracks the gaps. `<script>` bodies are type-checked as blocks appended to the generated TSX on every path, including tsserver through the plugin, instead of as extra service scripts that only the language server could register.
