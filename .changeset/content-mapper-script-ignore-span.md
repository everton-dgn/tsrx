---
'@tsrx/content-mapper': patch
---

An `ignore` directive for a TSRX error whose holder contains a `<script>` no longer stretches from the tag in the generated JSX to the script body appended at the end of the file. TypeScript diagnostics in the gap, including the rest of the component, stay visible. The tag and the appended body are still ignored on their own, so the mistake is not reported twice.
