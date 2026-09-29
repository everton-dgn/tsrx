---
'@tsrx/core': patch
---

The error tables in `@tsrx/core/diagnostics` are marked free of side effects (`@__NO_SIDE_EFFECTS__`, `@__PURE__`), so a bundle that imports some of them can leave the others out.
