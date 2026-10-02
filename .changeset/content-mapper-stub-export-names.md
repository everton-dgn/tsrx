---
'@tsrx/content-mapper': patch
---

The stub that stands in for a file that doesn't compile exports a name no declaration can have, such as `null`, `if`, `string`, or `"foo-bar"`, from a local binding, instead of declaring it (`export declare const null: any` doesn't parse) or leaving it out, so importers keep resolving it.
