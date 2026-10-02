---
'@tsrx/core': patch
---

A tag that the loose parser recovers as unclosed (for example `<b>` typed before its `</b>`) now stays unclosed in the type-only output used by editors, as authored, instead of getting a synthesized closing tag. TypeScript then reports it ("JSX element 'b' has no corresponding closing tag", TS17008) as it does in a `.tsx` file, and TypeScript's own closing-tag completion can find the open tag. Compiled output is unchanged.
