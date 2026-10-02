---
'@tsrx/language-server': patch
'@tsrx/vscode-plugin': minor
---

The TSRX language server now formats `.tsrx` files (`textDocument/formatting`, and `textDocument/rangeFormatting` for Format Selection and format on paste) with the project's own `prettier` and `@tsrx/prettier-plugin`, on every backend and in every editor that formats through it. It adds the plugin and the `tsrx` parser itself, so a `.tsrx` file formats even when the Prettier config does not list the plugin, and it applies the project's Prettier config, `.editorconfig` and `.prettierignore`, so the editor gives the same result as the `prettier` command. When a package is missing, or Prettier is older than 3.6, the server returns no edits and shows a message once per project with the install command for the project's package manager (from the nearest lockfile: pnpm, Yarn, Bun or npm). `tsrx.format.enable: false` turns formatting off.

The VS Code extension makes TSRX the default formatter for `.tsrx` files through `configurationDefaults`, so the Prettier extension is no longer needed. It no longer writes `prettier.documentSelectors` and `"[tsrx]": { "editor.defaultFormatter": "esbenp.prettier-vscode" }` into the user settings on every start. That write replaced the whole `[tsrx]` block and the whole selector list each time. Settings that older versions wrote stay until you remove them, and while they stay, the Prettier extension formats `.tsrx` files. The unused `tsrx.preferences.preferTypeOnlyAutoImports` setting is removed.
