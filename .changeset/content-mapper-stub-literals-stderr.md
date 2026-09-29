---
'@tsrx/content-mapper': patch
---

Keep a compile-failure export stub valid when an export is named `null`, `true`, or `false`, and route every console method to stderr so logging from a target compiler cannot corrupt the content-mapper protocol on stdout.
