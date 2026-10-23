# Changelog

All notable changes are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/), and the project uses [semantic versioning](https://semver.org/).

## [1.0.0] - 2026-10-23

First stable release. The public API is the same as 0.1.0 and is now covered by semantic versioning.

### Changed
- README rewritten: a runnable example with real output, a table of what `verifyCase` guarantees and how each check works, an API reference with signatures, measured test count and timings, and known limits.
- Package version set to 1.0.0.

## [0.1.0] - 2026-10-23

### Added
- `generateCase`: deterministic case generator with two tones (classic and cozy), three settings (Ashby Hall, The Sapphire Express, Marigold Manor), ten suspect archetypes with distinct Amazon Polly voices, floor plans on a 16 x 9 grid.
- Counterexample guided clue selection: every chosen clue rules out an alternative explanation.
- `verifyCase` with Z3: unique culprit and means, key clue necessity, earliest solvable round, safe accomplice lies, safe objection slips, cross-checked against the built-in reasoner.
- `generateVerifiedCase`, `sliceFor`, `checkReply`, `evaluateTheory`, `proofChain`, `safeLiesForAccomplice`, `objectionSlip`, `publicView`, `describeFact`.
- Reveal extras: three line confession, newspaper headline, clock chimes, briefing slides, short card faces and short names.
- Browser-safe `fairplay/core` entry, a CLI example, and a browser playground.
