---
'@tsrx/content-mapper': patch
---

Every `console` method of the mapper process writes to stderr, not only `log`, `info`, `warn` and `debug`: `console.dir`, `table`, `trace`, `group` and the rest no longer write to stdout, where they would corrupt the protocol stream TypeScript reads.
