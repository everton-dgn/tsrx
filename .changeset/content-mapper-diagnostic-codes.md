---
'@tsrx/core': patch
'@tsrx/content-mapper': patch
---

`@tsrx/content-mapper` reports every compile error under the source `TSRX`, in capitals like TypeScript's own `TS2322`: a TSRX error with its code's number, so it shows with its own code (`TSRX2002`) instead of a hash of the code, and an error with a TypeScript code with `11` before its number (`TS1005` shows as `TSRX111005`). The generated code can lose a mistake, such as a repeated modifier or a rest parameter's `?`, so TypeScript can't always report it itself. Where it does, an `ignore` diagnostic directive over the generated code of the statement, member or element that holds the error hides TypeScript's copy until the error is fixed, so each mistake shows once. The mapper's own errors are `771000` to `771003`. `@tsrx/core/diagnostics` exports the source, codes and prefixes as `DIAGNOSTIC_SOURCE`, `MAPPER_CODES`, `TYPESCRIPT_CODE_PREFIX` and `MAPPER_CODE_PREFIX`.
