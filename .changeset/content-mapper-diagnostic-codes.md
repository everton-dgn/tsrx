---
'@tsrx/core': patch
'@tsrx/content-mapper': patch
---

`@tsrx/content-mapper` reports a TSRX error with its code's number (`TSRX2002` shows as `tsrx2002`) instead of a hash of the code, and leaves an error with a TypeScript code to TypeScript, which reports the mistake from the generated code with its own message and quick fixes. When a file doesn't compile, its error goes to TypeScript whatever its code, with `11` before a TypeScript code's number (`TS1005` shows as `tsrx111005`). The mapper's own errors are `771000` to `771003`. `@tsrx/core/diagnostics` exports these codes and prefixes as `MAPPER_CODES`, `TYPESCRIPT_CODE_PREFIX` and `MAPPER_CODE_PREFIX`.
