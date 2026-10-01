---
'@tsrx/language-server': patch
---

Editor formatting of `.tsrx` files still works when the Prettier config lists `@tsrx/prettier-plugin` by package name and that plugin is installed in a different `node_modules` than Prettier. The language server passes the plugin path it resolved from the file, instead of leaving Prettier to load the bare name from its own working directory.
