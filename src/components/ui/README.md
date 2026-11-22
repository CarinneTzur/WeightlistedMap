# Shared UI library

Build from the app's existing patterns. Shared styles are imported once through
index.css. Do not add separate scrollbar rules in individual component files.

## ScrollArea

Import `ScrollArea` from this directory and give it a bounded height or a flex
parent with min-height: 0. It forwards its ref for scroll-to-bottom behavior.
For existing elements (including textareas), add `ui-scroll-area` instead.
`coach-scroll-panel` remains a compatibility alias for the same shared style.
The source is the coach-directory scrollbar: 6px, transparent track, rounded
neutral thumb, brighter hover, no arrow buttons. Native platform rendering may vary.

## Button

Import `Button` for the existing dark pill control. It defaults to type="button",
forwards native attributes and refs, and includes hover, disabled, and keyboard
focus states. Set type="submit" explicitly inside forms where needed.

Preserve specialized layouts when adopting primitives. Future additions should
extract existing fields, cards, headings, and status pills with their real usage
rather than introduce a second visual design system.
