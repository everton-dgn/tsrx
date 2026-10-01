# TSRX Syntax for VS Code

Provides syntax highlighting and rich intellisense for `.tsrx` files in VS Code,
using the TSRX language server.

## TypeScript backends

VS Code's own TypeScript owns every TypeScript feature for `.tsrx` files: the
extension never loads or bundles TypeScript and never patches another extension.
It activates Microsoft's installed TypeScript extensions and lets them choose
which server runs, without adding a selection setting of its own; it reads theirs
only to know whether it must close tags itself (below). Pick the TypeScript with
the **TypeScript: Select TypeScript Version** picker as for any `.ts` file; the
two rows below are what happens in each case. Only one TypeScript ever serves a
file.

| Backend   | How it works                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `classic` | TypeScript 7 off: VS Code's built-in TypeScript extension runs its tsserver (its own copy or the workspace version, 5.9 or 6) with `@tsrx/typescript-plugin`, which this extension contributes as a tsserver plugin (`typescriptServerPlugins`) and ships. VS Code manages `.tsrx` documents like `.ts` ones, so its commands and menus work on them and `.ts` importers resolve `.tsrx` modules with no tsconfig `plugins` entry. TypeScript closes tags (`js/ts.autoClosingTags.enabled`). The TSRX language server adds TSRX compile errors, snippets, CSS in `<style>`, document symbols and CSS-class hover and definition. |
| `native`  | TypeScript 7 on: the [TypeScript 7 extension](https://github.com/microsoft/TypeScript/tree/main/packages/vscode-typescript) owns every TypeScript feature for `.tsrx` files through [`@tsrx/content-mapper`](https://www.npmjs.com/package/@tsrx/content-mapper), declared in `tsconfig.json`, including TSRX compile errors. The TSRX language server serves the same TSRX-only features minus compile errors, and closes tags.                                                                                                                                                                                                 |

### Native backend setup

TypeScript 7 support for `.tsrx` files is not complete yet. The gaps and the
upstream TypeScript issues behind them are tracked in
[tsrx-org/tsrx#135](https://github.com/tsrx-org/tsrx/pull/135); if you run into
one that is not listed there, please file a new issue.

Which TypeScript you run decides whether `.tsrx` files work in VS Code:

| TypeScript compiler                                                                       | Who runs it                                                                  | `.tsrx` files                                                                                  |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 5.9 or 6                                                                                  | VS Code's built-in TypeScript, TypeScript 7 off                              | Work (classic backend)                                                                         |
| 7.0, including 7.0.2 bundled with the TypeScript 7 extension                              | TypeScript 7 extension                                                       | Get no TypeScript features: 7.0 has no content-mapper protocol                                 |
| 7.1 nightly, `7.1.0-dev.20260923.1` or newer, from the **TypeScript 7 Nightly** extension | TypeScript 7 extension 1.0.1 or newer                                        | Work (native backend)                                                                          |
| 7.1 nightly, `7.1.0-dev.20260923.1` or newer, in the project's `node_modules/typescript`  | TypeScript 7 extension 1.0.1 or newer, with `js/ts.tsdk.path` pointing at it | Work (native backend)                                                                          |
| the same project nightly, without `js/ts.tsdk.path`                                       | TypeScript 7 extension, with its bundled 7.0                                 | Get no TypeScript features: the extension does not pick up `node_modules/typescript` by itself |

Tested with the TypeScript 7 extension 1.0.1, the TypeScript 7 Nightly extension
0.20260930.4 and TypeScript `7.1.0-dev.20260930.4`
(`pnpm --filter @tsrx/vscode-plugin test:editor`).

1. Install the **TypeScript 7** extension (`TypeScriptTeam.native-preview`) and
   give it a 7.1 nightly compiler in one of two ways:
   - Install the **TypeScript 7 Nightly** extension
     (`TypeScriptTeam.vscode-typescript-nightly`). It only ships the compiler, and
     the TypeScript 7 extension uses it instead of its bundled 7.0.
   - Or install the nightly in your project (`typescript@7.1.0-dev.…`) and point
     `js/ts.tsdk.path` at its `node_modules/typescript`. When that setting is in
     workspace settings, the TypeScript 7 extension also asks you once to allow
     the workspace version.

   Then turn TypeScript 7 on (`js/ts.experimental.useTsgo`, the **TypeScript:
   Select TypeScript Version** picker or the **TypeScript: Enable TypeScript 7**
   command) and keep its `js/ts.contentMappers.enabled` setting on (the default).

2. Declare the mapper in every `tsconfig.json` that contains `.tsrx` files, and
   install `@tsrx/content-mapper` next to it. TypeScript 7 reads that entry itself
   and resolves `.tsrx` imports across the whole project:

   ```jsonc
   {
     "contentMappers": [
       { "package": "@tsrx/content-mapper", "extensions": [".tsrx"] },
     ],
   }
   ```

   A `.tsrx` file that belongs to no such project (no `tsconfig.json`, or one
   without the `contentMappers` entry) gets no TypeScript features on the native
   backend.

3. The workspace must be trusted. Neither the mapper nor the TSRX compilers run in
   Restricted Mode.

Opening a `.tsrx` file is enough to start TypeScript features, including in
projects with no `.ts` or `.js` source files. TSRX activates Microsoft's
TypeScript extensions and calls `registerContentMappers` when their API supports
it, with `[{ extensions: ['.tsrx'] }]`. That registration discovers the projects
of already-open and subsequently opened `.tsrx` files. The mapper still comes from
each project's `tsconfig.json`; TSRX supplies no inferred-project mapper. Version
selection and any first-run setup follow Microsoft's extensions, just as when
opening a `.ts` file.

With TypeScript 7 enabled in your user settings, its extension shows a one-time
warning that "TypeScript server plugins from the TSRX Syntax for VS Code extension
will not be loaded". That is expected and harmless: the plugin it refers to is the
one VS Code's own tsserver uses for `.tsrx` files on TypeScript 5.9 or 6, and
TypeScript 7 serves them through the content mapper instead. Dismiss it with
**Don't Show Again**.

What differs from the classic backend:

- Closing tags come from the TSRX language server
  (`tsrx.autoClosingTags.enabled`): `tsc --lsp` can close tags in `.tsrx` files,
  but the TypeScript 7 extension only asks it to in TypeScript and JavaScript
  files (upstream microsoft/TypeScript#64564). On classic, VS Code's TypeScript
  closes them.
- TSRX compile errors are reported by TypeScript 7 with the `tsrx` source; on
  classic the TSRX language server reports them with the `TSRX` source.
- Rename is limited to identifiers whose generated text matches the source
  (upstream microsoft/TypeScript#63879).
- Keyword highlights from the TSRX server are not shown while several `.tsrx`
  editors are visible side by side (VS Code then only consults the TypeScript 7
  extension's multi-document highlight provider).

On both backends, declarations inside `<script>` bodies are type-checked in place
but not listed in the Outline: the body is a block statement in the generated
TypeScript, which TypeScript's navigation tree skips (tsrx-org/tsrx#137).

See the
[`@tsrx/content-mapper` README](https://github.com/tsrx-org/tsrx/tree/main/packages/content-mapper)
for the CLI (`tsc --runExternalCode`), declaration output and known limitations,
its
[`ROLLOUT.md`](https://github.com/tsrx-org/tsrx/blob/main/packages/content-mapper/ROLLOUT.md)
for migration and rollback steps, and its
[`COMPATIBILITY.md`](https://github.com/tsrx-org/tsrx/blob/main/packages/content-mapper/COMPATIBILITY.md)
and
[`BENCHMARKS.md`](https://github.com/tsrx-org/tsrx/blob/main/packages/content-mapper/BENCHMARKS.md)
for how the two backends compare.
