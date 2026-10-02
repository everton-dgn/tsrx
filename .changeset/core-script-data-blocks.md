---
'@tsrx/core': patch
---

A `<script>` whose `type` makes its body data rather than code, such as `application/json`, `importmap` or `text/template`, no longer gets an embedded TypeScript region, so the language service and TypeScript 7 stop reporting TypeScript errors in valid JSON (#846). A body with no `type`, `module`, a JavaScript MIME type, a TypeScript or JSX type (`text/typescript`, `text/babel`), or a `type` only known at run time is still checked.
