# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project does not currently follow Semantic Versioning strictly (it is
a pre-1.0 educational/portfolio project), but version numbers are bumped
for each notable milestone.

## [0.2.0] - 2026-07-19

### Added

- **World map**: coastlines rendered from Natural Earth 110m data (via
  world-atlas, generated offline into a static asset — no runtime network
  I/O), a day/night terminator overlay, a satellite visibility footprint
  circle, and a ground track split into past (solid) / future (dashed)
  segments.
- **NET contact windows and contact phase**: `mergeNetWindows()` merges
  per-station passes into contiguous multi-station visibility windows;
  `contactPhaseAt()` classifies the current instant as `CONTACT` / `PREP`
  / `IDLE` / `NO_WINDOW`, driving a NET T− countdown in the TopBar and the
  24h pass timeline's merged NET lane.
- **Operations Checklist**: a 6-item read-only checklist (orbit source,
  TLE age, telemetry, data providers, ground stations, next contact)
  derived from provider health and freshness state.
- **Advisories**: `deriveAdvisories()` raises operator-facing advisories
  only on genuine degradation (stale/unavailable data, provider errors,
  missing API token), with deterministic ids, critical-first ordering, and
  acknowledge/re-raise-on-recurrence semantics (`reconcileAcks()`); a new
  Advisory panel with ACK buttons, and an Event Log split into
  ADVISORIES + EVENT LOG with level and type filter chips.
- **Command Rehearsal lifecycle**: rehearsal commands now progress through
  `CREATED → REHEARSAL_ACK → REHEARSAL_EXEC | REHEARSAL_FAIL` on a
  wall-clock-driven state machine, with a 15% injected training-scenario
  fault rate, per-rehearsal context (`createdInMode`,
  `createdAtWallClock`, `contextTimestamp`), and independent LIVE_READ_ONLY
  / REPLAY histories.
- **Provider request lifecycle**: `ProviderRequestState`
  (`NOT_REQUESTED`/`LOADING`/`SUCCEEDED`/`FAILED`) is now tracked per live
  provider, distinguishing "still loading" from "genuinely failed," with
  `FETCH_FAILED` vs `PARSE_FAILED` failure reasons.
- **Operational Assessment**: advisories and the ops checklist are now
  derived from a single shared `OperationalSnapshot`
  (`deriveOperationalAssessment()`), assembled once per read by
  `MissionStore.buildOperationalSnapshot()` / `getOperationalAssessment()`,
  so the two views can never disagree about the same underlying state.
  `ChecklistStatus` gained `CHECKING` / `PENDING` / `CONFIG_REQUIRED` /
  `INFO` members (renamed from `OK` to `PASS`) so loading and
  configuration-needed states no longer read as a false `FAIL`.
- **Control Plane boundary**: a new `src/services/control/` module —
  `ControlPlanePort`, `ControlPlaneCapabilities` with `false`-literal
  capability fields, `ControlPlaneStatus` with a single `"DISABLED"`
  member, and `parseControlPlaneMode()`, whose only implementation,
  `DisabledControlPlaneAdapter`, throws `CONTROL_PLANE_DISABLED` from
  every control method and performs no I/O. `Rehearsal Plane` status
  (`deriveRehearsalPlaneStatus()`) is modeled separately from Control
  Plane status. A new, presentational `ControlPlaneStatusChip` is shown in
  the TopBar. An optional build-time flag, `VITE_CONTROL_PLANE_MODE`, is
  read but can only ever resolve to `DISABLED`; unrecognized values log a
  `WARN` `CTRL` event instead of being silently ignored.
- **Tests**: grew from 10 files / 57 tests (0.1.0) to 22 files / 240 tests,
  including a TypeScript-AST-based `tests/architecture.test.ts` that
  enforces the Control Plane's dependency-direction boundary and the
  absence of client-side secret references across the entire `src/` tree.
- **Docs**: added `docs/control-plane-boundary.md` and
  `docs/scc-comparison.md`.

### Changed

- The command-rehearsal and Control Plane network-silence tests were
  extended from stubbing `fetch` alone to stubbing six I/O surfaces
  (`fetch`, `XMLHttpRequest`, `WebSocket`, `navigator.sendBeacon`,
  `EventSource`, `WebTransport`) and parameterizing across both
  rehearsal-capable modes (LIVE_READ_ONLY, REPLAY).
  `RehearsalConsole` now calls `store.getRehearsals()` once per render
  instead of per usage site.
- Pass-prediction horizons were unified to 24h across SIMULATED (was 8h)
  and REPLAY (was 12h) to match the "NEXT 24H" panels.
- `App.tsx` now derives advisories and the checklist from a single
  `store.getOperationalAssessment()` call instead of two independent
  calls.

### Fixed

- **Antimeridian / pole-safe map rendering**: land polygons and the
  satellite footprint circle were previously drawn as single SVG polygons
  in raw ±180° longitude, which produced false world-spanning edges/fill
  bands where a ring crossed the antimeridian, and could lose most of a
  footprint's area when centered near a pole. Added
  `src/domain/mapPolygon.ts` (longitude unwrapping, pole-cap ring closure,
  a polar-band special case for pole-centered footprints) and reworked
  `WorldMap` to render unwrapped, seam-shifted polygon copies with
  separately-drawn outlines.
- Ground-track past/future split previously left a gap of up to ~45
  seconds at the split point; the boundary sample is now shared between
  the two segments.
- `ReplayProvider` now reports `requestState: FAILED` /
  `failureReason: PARSE_FAILED` when the bundled replay fixture's TLE
  fails SGP4 engine initialization, so a broken fixture still raises a
  CRITICAL provider advisory instead of silently reading as healthy.

### Security

- **Non-transmission guarantees strengthened**: `CommandRehearsal.transmitted`
  remains the literal type `false`, now backed by a runtime assertion
  (`assertNotTransmitted()`), `Object.freeze` on every created rehearsal,
  and a network-silence test suite spanning six I/O APIs across both
  rehearsal-capable modes (previously `fetch` only, LIVE_READ_ONLY only).
- **Control Plane disabled by construction**: the new
  `src/services/control/` module ships exactly one adapter, whose
  capability flags are `false`-literal types (not `boolean`) and whose
  methods are typed to return `never`. A TypeScript-AST test suite
  (`tests/architecture.test.ts`) enforces that this module can never
  import providers, the API client, the store, or rehearsal code, and
  that rehearsal/provider code can never import it.
- **No secrets in the browser**: `tests/architecture.test.ts` now scans
  every file under `src/` for `process.env` access and exact references
  to the `SATNOGS_API_TOKEN` literal, confirming the server-only token
  boundary documented in `docs/safety-and-scope.md` holds across the
  whole client tree, not just the files known to touch telemetry.

## [0.1.0] - 2026-07-19

Initial read-only satellite mission dashboard (SIMULATED / LIVE_READ_ONLY
/ REPLAY), CelesTrak/SatNOGS integration via an Express BFF, client-side
SGP4 propagation and pass prediction, a Command Rehearsal console with
`transmitted: false` type and I/O guarantees, and the initial
`docs/architecture.md` / `docs/safety-and-scope.md` design documents.
10 test files, 57 tests (commit `338230c`).
