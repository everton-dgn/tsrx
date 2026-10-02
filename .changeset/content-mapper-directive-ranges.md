---
'@tsrx/content-mapper': patch
---

A TSRX error inside an element that holds a `<script>` body no longer hides TypeScript errors in other components. The directive that hides TypeScript's copy of the error spanned from the element's first to its last generated code, and the body is checked at the end of the generated file, so the range covered every component in between. It now covers each piece of the element's generated code separately.
