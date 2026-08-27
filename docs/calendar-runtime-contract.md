# Calendar Runtime Contract – KZ 1.0

## Status

Phase 7 Wave 2 canonical contract.

## Source of truth

Google Calendar remains the source of truth for Calendar events. The cockpit never mirrors event truth into OPS for display and this wave introduces no Calendar writes.

## Canonical runtime

`src/CalendarService.gs` is the only server module allowed to enumerate Google calendars or read events. The public canonical endpoint is `getCalendarViewV4(request, force)`.

The canonical response supports `day`, `week`, and `month`, exposes `rangeStart` / `rangeEnd`, calendar metadata, selected calendar IDs, and normalized event objects.

`getCalendarWeekV3(force)` remains only as a compatibility wrapper for older callers. It must delegate to `getCalendarViewV4` and must never access `CalendarApp` directly.

Both the live cockpit adapter and `CalendarWellbeingEnhancements.html` use `getCalendarViewV4` as their runtime endpoint.

## Presentation state

Calendar selection/filtering is presentation state. The `Möglichkeiten` calendar stays hidden by default unless the user selects it. Filter preferences may be stored locally in the browser; they do not write to Google Calendar.

## Out of scope

Calendar scrolling, layout polish, navigation UX, and other work tracked by `TASK_000024` are intentionally not part of this contract refactor.
