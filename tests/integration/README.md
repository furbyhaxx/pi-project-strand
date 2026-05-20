# Integration Smoke Tests

This directory contains deterministic pi-native integration smoke coverage for `@furbyhaxx/pi-superpowers`.

## Requirements

- `pi` must be installed and available on `PATH`
- the current machine must be able to run `pi install -l <path-or-source>`
- `node` must be available for the `jiti` import smoke check
- no provider/model access is required for these checks

## Test strategy

The integration script creates:
- a temporary `PI_CODING_AGENT_DIR`
- a temporary project directory
- a project-local install of this package

It then performs deterministic checks that do not rely on `pi -p` prompt execution:
- verifies `.pi/settings.json` is written
- resolves the installed package entry back to the expected checkout
- verifies key skill and extension resources exist
- imports `extensions/superpowers-bootstrap.ts` through `jiti`
- runs `npm pack --dry-run` and checks the expected package contents appear

## What this proves

- the package installs into a fresh pi environment
- project-local package wiring is written correctly
- core resources are discoverable from the installed package entry
- the bootstrap extension is importable as shipped
- packaging still succeeds after the pi-native sync work

## What this does not prove

- full interactive subagent execution
- end-user TUI behavior
- provider/model-driven prompt routing

## Running manually

```bash
bash tests/integration/pi-superpowers-workflow.sh
```

Or via npm:

```bash
npm run test:integration
```

## Debugging failures

If the script fails:
- rerun it with `bash -x`
- inspect the generated `.pi/settings.json` in the temp project
- verify `pi install -l <path>` works outside the script
- verify `node --input-type=module` and `jiti` imports work in the current checkout
