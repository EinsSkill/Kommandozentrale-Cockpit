# Frontend Runtime Architecture – KZ 1.0

## Productive templates

The productive Apps Script web entry point renders exactly one of two presentation templates:

- `Index.html` — desktop presentation
- `MobileIndex.html` — mobile presentation

Legacy `FoodIndex.html` / `FoodMobileIndex.html` remain migration artifacts only. Legacy Food URLs resolve into the canonical cockpit.

## Shared runtime layer

Both productive templates explicitly include the same repository-owned runtime fragments:

1. `ClaudeRuntime.html`
2. `LiveAdapter.html`
3. `CalendarWellbeingEnhancements.html`
4. `FoodTrackingEnhancements.html`

`Code.gs` selects and evaluates the template only. It no longer reads rendered HTML back with `getContent()`, rewrites labels, or injects fragments using a closing-body regular expression.

## Design boundary

Desktop and mobile are intentionally separate presentation surfaces. KZ 1.0 does **not** force them into one visual template. Deduplication is applied to runtime/data behavior, while presentation-specific markup and interaction layout remain independent.

## Food path

`OPS.FOOD_* → getFoodV1() → FoodTrackingEnhancements → canonical cockpit`

No separate productive Food application path remains. Missing data stays missing instead of being replaced with invented sample values.
