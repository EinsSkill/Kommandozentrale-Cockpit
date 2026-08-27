# System Status Truth Contract – KZ 1.0

## Status

Phase 7 Wave 4 canonical status-surface distinction.

## Frontend path state

`KZLive.sourceState()` describes only the browser-to-Apps-Script endpoint load state for the seven progressive cockpit paths. It remains the correct signal for boot/progress UI and latency diagnostics.

A successful endpoint call does **not** imply that the underlying domain source is healthy or fresh.

## Combined system truth

`KZLive.systemTruthState()` is the status used for visible system-health indicators. It combines:

- current frontend endpoint states; and
- authoritative operational statuses from `OPS.SYNC_STATE` returned by `getDashboardBaseV31()`.

Precedence is conservative:

1. frontend or backend `ERROR` → error;
2. frontend paths still loading/waiting → loading;
3. missing `SYNC_STATE` evidence → warning;
4. any non-`OK` backend status such as `DEGRADED` or `UNKNOWN` → warning;
5. only all-ready frontend paths plus present all-`OK` backend rows → OK.

Therefore the cockpit must never render a fully green/all-current claim merely because its API calls succeeded.

## DASHBOARD_STATE

`DASHBOARD_STATE` remains untouched in OPS for migration/history safety, but it is no longer read by `getDashboardBaseV31()` and is not a runtime authority for the current cockpit.

## Presentation

- Desktop header label, dot color and glow use the combined system truth state.
- Mobile header dot uses the same combined state and exposes its label via `title`/`aria-label`.
- The existing System detail view continues to show per-source and per-path rows.

## Out of scope

This wave does not change sync writers, source freshness rules, OPS schema, visual design, Food, permissions, or Apps Script deployment.
