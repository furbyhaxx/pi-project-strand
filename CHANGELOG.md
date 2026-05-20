# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

## [0.3.0] - 2026-05-20

### Changed
- synced core workflow skills with newer upstream superpowers behavior for worktree handling, brainstorming, planning, execution, and review
- added a pi-native `superpowers-bootstrap` extension for skill-first guidance before agent turns
- replaced upstream browser-server visual brainstorming assumptions with pi-native `AskUserQuestion` preview guidance
- added upstream parity regression tests, README parity tests, bootstrap unit tests, and deterministic integration smoke coverage
- hardened verification, testing anti-pattern, and code review guidance with feedback-derived improvements
- documented pi-native provenance and non-ported upstream harness glue

## [0.2.1] - 2026-05-20

### Changed
- renamed the package to `@furbyhaxx/pi-superpowers`
- updated pi peer dependency scopes from `@mariozechner/*` to `@earendil-works/*`
- switched TypeBox usage from `@sinclair/typebox` to `typebox`
- updated repository, homepage, bugs URL, and installation instructions to the `furbyhaxx/pi-superpowers` fork
- added scoped-package publish metadata for public npm publishing
