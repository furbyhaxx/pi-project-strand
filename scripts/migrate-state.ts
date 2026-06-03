// THROWAWAY: run once against /mnt/Projects, then delete this file.
// Usage: npx jiti scripts/migrate-state.ts <path-to-old-state.json> <strand-name>
import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { migrateLegacyState } from "../extensions/project-tracker-migrate.js";
import { DEFAULT_STRANDS } from "../extensions/project-tracker-core.js";

const [, , statePath, strandName = "granular"] = process.argv;
if (!statePath) { console.error("usage: migrate-state.ts <state.json> [strand]"); process.exit(1); }
const template = DEFAULT_STRANDS[strandName];
if (!template) { console.error(`unknown strand ${strandName}; have: ${Object.keys(DEFAULT_STRANDS).join(", ")}`); process.exit(1); }

const legacy = JSON.parse(readFileSync(statePath, "utf-8"));
copyFileSync(statePath, `${statePath}.bak`);
const migrated = migrateLegacyState(legacy, template, strandName);
writeFileSync(statePath, `${JSON.stringify(migrated, null, 2)}\n`, "utf-8");
console.log(`Pass-1 migration written. Backup at ${statePath}.bak. Now run the interactive Pass-2 backfill (design §9).`);
