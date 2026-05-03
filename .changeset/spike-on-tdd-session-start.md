---
"vitest-agent-reporter-shared": patch
---

## Bug Fixes

### `tdd_session_start` opens initial spike phase atomically

`DataStore.writeTddSession` now writes a `tdd_phases` row with `phase = 'spike'` in the same operation as the `tdd_sessions` insert. Previously the spike phase was lazy-opened by `record tdd-artifact` on first call, which produced a misleading `"auto-opened by record tdd-artifact"` transition reason and left `getCurrentTddPhase` returning `None` immediately after `tdd_session_start`. The lazy-open path in `record tdd-artifact` is retained as a defensive fallback for older `tdd_sessions` rows that predate this change.
