# TSRX Syntax for VS Code

Provides syntax highlighting and rich intellisense for `.tsrx` files in VS Code,
using the TSRX language server.

## TypeScript backends

VS Code's own TypeScript owns every TypeScript feature for `.tsrx` files: the
extension never loads or bundles TypeScript and never patches another extension.
It activates Microsoft's installed TypeScript extensions and lets them choose
which server runs, without adding a selection setting of its own. The two rows
below are what happens with TypeScript 5.9 or 6 and with TypeScript 7. Only one
TypeScript ever serves a file.

| Backend   | How it works                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `classic` | TypeScript 7 off: VS Code's built-in TypeScript extension runs its tsserver (its own copy or the workspace version, 5.9 or 6) with `@tsrx/typescript-plugin`, which this extension contributes as a tsserver plugin (`typescriptServerPlugins`) and ships. VS Code manages `.tsrx` documents like `.ts` ones, so its commands and menus work on them and `.ts` importers resolve `.tsrx` modules with no tsconfig `plugins` entry. TypeScript closes tags (`js/ts.autoClosingTags.enabled`). The TSRX language server adds TSRX compile errors, snippets, CSS in `<style>`, document symbols and CSS-class hover and definition. |
| `native`  | TypeScript 7 on: the [TypeScript 7 extension](https://github.com/microsoft/TypeScript/tree/main/packages/vscode-typescript) owns every TypeScript feature for `.tsrx` files through [`@tsrx/content-mapper`](https://www.npmjs.com/package/@tsrx/content-mapper), declared in `tsconfig.json`, including TSRX compile errors. The TSRX language server serves the same TSRX-only features minus compile errors, and closes tags.                                                                                                                                                                                                 |

### Native backend setup

TypeScript 7 support for `.tsrx` files is not complete yet. The gaps and the
upstream TypeScript issues behind them are tracked in
[tsrx-org/tsrx#135](https://github.com/tsrx-org/tsrx/pull/135); if you run into
one that is not listed there, please file a new issue.

To type-check `.tsrx` files with TypeScript 7.1 in VS Code:

1. Install `typescript@next` in your project (TypeScript 7.1 is not released yet):

   ```sh
   npm install -D typescript@next
   # or
   pnpm add -D typescript@next
   ```

2. Add these two settings to your VS Code user settings:

   ```json
   {
     "js/ts.experimental.useTsgo": true,
     "js/ts.tsdk.path": "node_modules/typescript"
   }
   ```

   You can also add them to the project's `.vscode/settings.json` instead. VS Code
   then asks once whether to use the project's TypeScript. Choose **Allow** to
   enable it.

   If TypeScript 7 is on without `js/ts.tsdk.path`, TSRX shows a notice. Its **Use
   Project TypeScript** button adds the setting for you.

3. Install the
   [TypeScript 7 extension](https://marketplace.visualstudio.com/items?itemName=TypeScriptTeam.native-preview).

4. Declare the mapper in every `tsconfig.json` that contains `.tsrx` files, and
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

5. The workspace must be trusted. Neither the mapper nor the TSRX compilers run in
   Restricted Mode.

_Note: `js/ts.tsdk.path` makes the TypeScript 7 extension use your project's
TypeScript instead of its built-in 7.0.2, which cannot check `.tsrx` files; it
does not find it by itself yet (microsoft/TypeScript#64565). These steps will get
simpler once that is fixed and TypeScript 7.1 is released (tsrx-org/tsrx#991)._

Which compiler serves `.tsrx` files, as tested with the TypeScript 7 extension
1.0.1 and TypeScript `7.1.0-dev.20260930.4`
(`pnpm --filter @tsrx/vscode-plugin test:editor`):

| TypeScript compiler                                            | Who runs it                                                 | `.tsrx` files                                                  |
| -------------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------- |
| 5.9 or 6                                                       | VS Code's built-in TypeScript, TypeScript 7 off             | Work (classic backend)                                         |
| 7.1 nightly in the project's `node_modules/typescript`         | TypeScript 7 extension, with `js/ts.tsdk.path` set as above | Work (native backend)                                          |
| the same project nightly, without `js/ts.tsdk.path`            | TypeScript 7 extension, with its built-in 7.0.2             | Get no TypeScript features, and TSRX's notice says what to set |
| 7.0, including the 7.0.2 built into the TypeScript 7 extension | TypeScript 7 extension                                      | Get no TypeScript features: 7.0 has no content-mapper protocol |

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
