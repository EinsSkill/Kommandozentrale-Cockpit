# Operator / Briefing Contract – KZ 1.0

## Status

Phase 7 Wave 3 canonical distinction.

## Briefing

A Briefing is a persisted point-in-time output from `OPS.BRIEFINGS`. It may summarize Calendar, tasks, projects, mail, finance, health, AI Inbox, alerts and freshness as they were assessed when that briefing was created.

The cockpit may display that snapshot with its creation metadata. Briefing prose is **not** an input into the live Personal Operator decision.

## Personal Operator

The visible Operator is an ephemeral ViewModel. It is derived from the current cockpit state and is not persisted as a new source of truth.

Current inputs are:
- ordered OPS tasks;
- current, unacknowledged alerts as fallback when there is no task;
- current wellbeing guidance;
- curated read-only Personal Context from `getPersonalOperatorContextV1`.

The ViewModel exposes the existing presentation fields `step`, `why`, `notNow` and `mode`, plus lightweight provenance (`sourceMode = LIVE_DERIVED`).

## Source-of-truth boundary

Operational truth remains in OPS and the domain Sources of Truth. Long-term personal rules remain in the Second Brain. The Operator only derives a current recommendation from those inputs; it does not turn that recommendation into stored truth.

## Out of scope

This wave does not change Briefing generation, routine scheduling, Calendar/Mail services, visual design, permission runtime or persistence rules.
