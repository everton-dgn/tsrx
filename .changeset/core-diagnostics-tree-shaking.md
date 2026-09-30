---
'@tsrx/core': patch
---

`@tsrx/core/diagnostics` runs nothing when it loads, so a bundler keeps only the tables a consumer reads: a bundle that imports the diagnostic source and codes now takes under 2 KB of it instead of about 45 KB, with Rollup, Rolldown, esbuild or webpack and no bundler settings. The upstream message lookup is built the first time it is used.
