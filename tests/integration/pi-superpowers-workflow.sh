#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TMP_AGENT="$(mktemp -d)"
TMP_PROJ="$(mktemp -d)"
TMP_PACK_OUT="$(mktemp)"
trap 'rm -rf "$TMP_AGENT" "$TMP_PROJ" "$TMP_PACK_OUT"' EXIT

cd "$TMP_PROJ"
PI_CODING_AGENT_DIR="$TMP_AGENT" pi install -l "$ROOT"

test -f .pi/settings.json

PACKAGE_ENTRY="$(node -e 'const fs=require("fs"); const settings=JSON.parse(fs.readFileSync(".pi/settings.json","utf8")); if(!Array.isArray(settings.packages)||settings.packages.length!==1){process.exit(2)} process.stdout.write(settings.packages[0])')"
PACKAGE_PATH="$(node -e 'const fs=require("fs"); const path=require("path"); const settings=JSON.parse(fs.readFileSync(".pi/settings.json","utf8")); process.stdout.write(path.resolve(process.cwd(), settings.packages[0]))')"
PACKAGE_VERSION="$(node -e 'const fs=require("fs"); const path=require("path"); const pkg=JSON.parse(fs.readFileSync(path.join(process.argv[1], "package.json"), "utf8")); process.stdout.write(pkg.version)' "$ROOT")"

echo "package entry: $PACKAGE_ENTRY"
echo "resolved package path: $PACKAGE_PATH"

test "$PACKAGE_PATH" = "$ROOT"

test -f "$PACKAGE_PATH/package.json"
test -f "$PACKAGE_PATH/skills/brainstorming/SKILL.md"
test -f "$PACKAGE_PATH/skills/brainstorming/visual-companion.md"
test -f "$PACKAGE_PATH/skills/using-git-worktrees/SKILL.md"
test -f "$PACKAGE_PATH/extensions/plan-tracker.ts"
test -f "$PACKAGE_PATH/extensions/project-tracker.ts"
test -f "$PACKAGE_PATH/extensions/superpowers-bootstrap.ts"
test -f "$PACKAGE_PATH/skills/frs-strategy/SKILL.md"

(
  cd "$PACKAGE_PATH"
  node --input-type=module -e 'import jitiFactory from "jiti"; const jiti = jitiFactory(import.meta.url,{interopDefault:true}); const mod = await jiti("./extensions/superpowers-bootstrap.ts"); if (typeof mod.default !== "function" || typeof mod.buildProjectStrandBootstrap !== "function") process.exit(3); console.log(typeof mod.default, typeof mod.buildProjectStrandBootstrap);'
)

(
  cd "$PACKAGE_PATH"
  npm pack --dry-run > "$TMP_PACK_OUT" 2>&1
)
grep -nE "pi-project-strand@${PACKAGE_VERSION}|extensions/project-tracker.ts|skills/frs-strategy/SKILL.md" "$TMP_PACK_OUT"

echo "integration smoke passed"
