# Permission Runtime Contract – KZ 1.0

## Authority

Runtime authorization reads the active `OPS.PERMISSIONS` table. `PERMISSIONS.md` defines the stable policy model; OPS is the structured operational projection used by Apps Script.

Only these permission classes are valid at runtime and in new audit rows:

- `AUTO`
- `AUTO_IF_REVERSIBLE`
- `APPROVAL`
- `FORBIDDEN`

`USER_APPROVED` is not a permission class.

## Fail-closed behavior

`authorizeActionV1_()` resolves an exact active `action_type`. If no exact active rule exists, it resolves the active `unknown_action` rule. Ambiguous/missing rules, invalid classes, unconfirmed rule conditions, missing reversibility evidence, unresolved approval, and forbidden/hard-limit actions block before mutation.

## Approval evidence

An `APPROVAL` rule may proceed only when the call site marks both:

- `directUserAction: true`; and
- `approvalSatisfied: true`.

This is intentionally scoped to the concrete operation being invoked. A scheduled/system call cannot satisfy approval merely by setting an approval flag.

## Reversibility

`AUTO_IF_REVERSIBLE` rules whose OPS row requires reversibility proceed only when the call site explicitly supplies `reversible: true`.

## Runtime coverage in Phase 7 Wave 5

The guard covers current mutating entrypoints for:

- task completion/reopening;
- AI Inbox review;
- alert acknowledgement;
- wellbeing setup/save;
- Food setup/log/pantry/shopping/recipe writes;
- Health and Weather sync runs;
- Health and Weather trigger/config setup.

Second Brain and Personal Operator remain read-only.

## Audit

`appendAudit_()` validates every new `permission_class` against the four canonical classes. Historical audit rows are not rewritten.
