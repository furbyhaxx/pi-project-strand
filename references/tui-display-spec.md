# Wookiee TUI Display Specification

> **Single source of truth** for how every wookiee tool looks in the pi TUI.
> New tools and external extensions that want to match this style must follow
> this document. Everything here is derived directly from
> `src/tools/render/index.ts`, `frame.ts`, `summaries.ts`, `format.ts`, and
> `src/permissions/`.

---

## 1. Design Philosophy

- **Compact by default, expandable on demand.** A tool call occupies as few
  lines as possible. Long output is collapsed with a `… +N lines` hint.
- **Self-rendered frames.** All wookiee tools use `renderShell: "self"`,
  meaning the tool owns the full visual block — header AND result — instead
  of letting pi draw generic chrome around them.
- **Claude-Code visual grammar.** Bullet + connector + indented body is
  deliberately identical to Claude Code's tool display so users who know one
  tool feel at home with the other.
- **Width-safe.** Every rendered line is truncated to the terminal width via
  `truncateToWidth`. Nothing ever wraps.

---

## 2. Frame Anatomy

Every tool call produces a two-part frame that stacks vertically.

```
● Verb(target)                   ← Part 1: renderCall  (header)
  ↳ reason text                  ← Part 1: intent line (optional)
  ⎿  Summary line                ← Part 2: renderResult (connector + summary)
     body line 1                 ← Part 2: body (indented 5 spaces)
     body line 2
     … +N lines (ctrl+r to expand)
```

### Glyph Reference

| Symbol | Name        | Unicode | Source constant | Where used                          |
|--------|-------------|---------|-----------------|-------------------------------------|
| `●`    | BULLET      | U+25CF  | `BULLET`        | Header prefix; animates while running |
| `⎿`    | CONNECTOR   | U+238F  | `CONNECTOR`     | Summary line prefix                 |
| `↳`    | INTENT      | U+21B3  | `INTENT`        | Reason line prefix                  |
| `▶`    | Play        | U+25B6  | inline          | Running shell session               |
| `✓`    | Check       | U+2713  | inline          | Finished shell session              |
| `…`    | Ellipsis    | U+2026  | inline          | Collapse hint                       |

### Spacing / Indentation

```
Col 0   Col 2   Col 4+
│       │       │
●·Verb(target)          ← bullet at col 0, space, verb
·· ↳ ·reason            ← 2 spaces + glyph + space + text
·· ⎿ ··Summary          ← 2 spaces + connector + 2 spaces + text
·····body               ← 5 spaces (BODY_INDENT) + content
```

Literal: `BODY_INDENT = "     "` (5 spaces).

---

## 3. Color / Theme Tokens

All colors are looked up via `theme.fg(key, string)` — the token name is the
key. When no theme is injected (tests, plain mode) all tokens fall back to the
raw string (no color).

| Token       | Semantic meaning                           | Typical color  |
|-------------|--------------------------------------------|----------------|
| `toolTitle` | Verb text in the header; default bullet    | Bold white/gray |
| `accent`    | Target/path in the header                  | Cyan / bright  |
| `muted`     | Summary text, connector glyph, collapse hint, intent reason, done-session glyph | Dim gray |
| `success`   | Exit 0, ▶ running task, task-started label | Green          |
| `error`     | Non-zero exit, timed out, write failed     | Red            |
| `toolOutput`| Body content lines (file content, paths, diff, session rows) | Default fg |

> **Rule for new tools:** summary lines are always `muted`. Status glyphs use
> `success` or `error`. Body content lines use `toolOutput`. The verb is
> `toolTitle` + `bold`. The target is `accent`.

---

## 4. Bullet Animation States

The `●` bullet at the start of every header is the live status indicator.

```
State          Color token   Behavior
─────────────────────────────────────────────────────────────────────────
PENDING        toolTitle     Blinks: alternates toolTitle ↔ muted
               / muted       at 500 ms intervals. Timer starts on first
                             render, drives ctx.invalidate() each tick.
─────────────────────────────────────────────────────────────────────────
DONE / OK      success       Static green ●. Timer stopped.
─────────────────────────────────────────────────────────────────────────
DONE / ERROR   error         Static red ●. Timer stopped.
─────────────────────────────────────────────────────────────────────────
```

**Implementation note:** blink state lives in `ctx.state` as `_blinkTimer` +
`_blinkFrame`. When `isPartial` transitions to `false`, the interval is
cleared and the final color applied. The timer uses `setInterval` and must
be cleared on every non-partial render to avoid leaks.

---

## 5. Collapse Behaviour

Two collapse modes exist. Both emit a `… +N lines (ctrl+r to expand)` hint.
The `ctrl+r` label comes from `keyHint("app.tools.expand")`.

### 5a. HEAD collapse (default for most tools)

Shows the **first** N lines; hint appears **after** the body.

```
  ⎿  Read 100 lines (4.2 KB)
     1  first line
     2  second line
     … +98 lines (ctrl+r to expand)    ← AFTER the shown lines
```

### 5b. TAIL collapse (shell output)

Shows the **last** N lines; hint appears **before** the body.

```
  ⎿  exit 0 · 100 lines · 240ms
     … +98 lines (ctrl+r to expand)    ← BEFORE the shown lines
     99  second to last line
     100 last line
```

**Rationale:** for shell output the most relevant lines are at the end
(prompts, errors, last status). Showing the tail prevents the user from seeing
only the command invocation printed at the start.

### Default caps per tool

| Tool         | `collapsedLines` | Collapse mode |
|--------------|-----------------|---------------|
| `file_read`  | 15              | head          |
| `file_write` | 0 (summary only)| —             |
| `file_edit`  | 20              | head          |
| `find`       | 20              | head          |
| `grep`       | 20              | head          |
| `shell`      | 15              | **tail**      |
| `shell_write`| 0 (summary only)| —             |
| `shells`     | 30              | head          |

Caps are overridable via `display_options.collapsed_lines` in `settings.yaml`.

---

## 6. Tool Wireframes

Legend used in all wireframes:

```
[toolTitle]   = bold, toolTitle-colored text
[accent]      = accent-colored text
[muted]       = muted/dim text
[success]     = success/green text
[error]       = error/red text
[output]      = toolOutput-colored text
[blink]       = alternating toolTitle ↔ muted (animated)
```

---

### 6.1 `file_read` — Read a file, directory, or image

#### State: IN-FLIGHT

```
[blink]● [toolTitle]Read([accent]src/foo.ts)
  [muted]↳ verify the clamp logic     ← only when show_reason=true AND reason present
```

#### State: DONE — text file (collapsed)

```
[success]● [toolTitle]Read([accent]src/foo.ts)
  [muted]↳ verify the clamp logic
  [muted]⎿  Read 58 lines (1.9 KB)
     [output]1  import { foo } from "./foo.ts";
     [output]2  
     [output]3  export function clamp(v: number, lo: number, hi: number) {
     [muted]     … +55 lines (ctrl+r to expand)
```

#### State: DONE — text file (expanded)

```
[success]● [toolTitle]Read([accent]src/foo.ts)
  [muted]⎿  Read 58 lines (1.9 KB)
     [output]1  import { foo } from "./foo.ts";
     [output]2  
     … (all 58 lines, no hint)
     [output]58  }
```

Line numbers are right-aligned to the width of the highest line number.
`offset` param shifts the gutter start (e.g. `offset=40` → first line shows `40`).

#### State: DONE — directory listing

```
[success]● [toolTitle]Read([accent]src/)
  [muted]⎿  Listed 8 entries
     [output]config/
     [output]permissions/
     [output]tools/
     … (up to cap=15, then hint)
```

#### State: DONE — image

```
[success]● [toolTitle]Read([accent]assets/logo.png)
  [muted]⎿  Image image/png (scaled)
```

No body for images. The image data goes to the model, not the TUI.

#### State: DONE — error (file not found, permission denied, etc.)

```
[error]● [toolTitle]Read([accent]missing.ts)
  [muted]⎿  Error: ENOENT: no such file or directory
```

---

### 6.2 `file_write` — Write / create a file

#### State: IN-FLIGHT

```
[blink]● [toolTitle]Write([accent]src/new-file.ts)
  [muted]↳ create the new module
```

#### State: DONE

```
[success]● [toolTitle]Write([accent]src/new-file.ts)
  [muted]⎿  Wrote 42 lines (1.1 KB)
```

`file_write` is **summary-only** (`collapsedLines=0`). No body is shown
because the full content is always in the model's context; repeating it in
the TUI adds visual noise.

---

### 6.3 `file_edit` — Atomic text edits

#### State: IN-FLIGHT — single file

```
[blink]● [toolTitle]Update([accent]src/config/schema.ts)
  [muted]↳ add the new field
```

#### State: IN-FLIGHT — multiple files

```
[blink]● [toolTitle]Update([accent]src/config/schema.ts [muted]+2 more)
```

Note: `+N more` is rendered in `muted` inside the `accent` target area.

#### State: DONE — collapsed diff

```
[success]● [toolTitle]Update([accent]src/config/schema.ts)
  [muted]⎿  Updated 1 file · +3 −1
     [diff: - line]  -12  old value: "foo"
     [diff: + line]  +12  new value: "bar"
     [diff: + line]  +13  new value: "baz"
     [diff: + line]  +14  new value: "qux"
     [muted]     … +0 lines (ctrl+r to expand)
```

Diff lines are colored by `renderDiff` (pi built-in):
- Lines starting with `-` → red / strikethrough
- Lines starting with `+` → green
- Lines starting with ` ` (context) → `toolOutput`

The summary uses `·` as a separator and unicode `−` (U+2212) for removed count:
`Updated N file(s) · +X −Y`

#### State: DONE — multiple files

```
[success]● [toolTitle]Update([accent]src/a.ts [muted]+2 more)
  [muted]⎿  Updated 3 files · +12 −4
     …diff body…
```

---

### 6.4 `find` — Glob file search

#### State: IN-FLIGHT

```
[blink]● [toolTitle]Find([accent]**/*.ts in src)
  [muted]↳ find all TypeScript source files
```

Without a `path` arg: `● Find(**/*.ts)` — no `in …` suffix.

#### State: DONE — files found (collapsed)

```
[success]● [toolTitle]Find([accent]**/*.ts in src)
  [muted]⎿  Found 12 files
     [output]src/config/index.ts
     [output]src/config/schema.ts
     … (up to cap=20, then hint)
```

#### State: DONE — no results

```
[success]● [toolTitle]Find([accent]**/*.rs in src)
  [muted]⎿  No files found
```

---

### 6.5 `grep` — Content search

#### State: IN-FLIGHT

```
[blink]● [toolTitle]Grep([accent]toolTitle in src)
  [muted]↳ find all usages
```

Pattern is truncated at 64 chars if too long. `in <path>` appended when `path` param is set.

#### State: DONE — matches (collapsed)

```
[success]● [toolTitle]Grep([accent]toolTitle in src)
  [muted]⎿  Found 3 matches
     [output]src/tools/render/index.ts:28: const VERB: Record<string, string> = {
     [output]src/tools/render/index.ts:84: return fg(theme, "toolTitle", BULLET);
     [output]src/tools/render/index.ts:87: fg(theme, "toolTitle", VERB[name] ?? name)
     [muted]     … +0 lines (ctrl+r to expand)
```

Match count is derived by counting lines matching `/^.+:\d+: /` (the
`file:line: text` format), which excludes context lines and notice lines.

#### State: DONE — no matches

```
[success]● [toolTitle]Grep([accent]xyzNotExist)
  [muted]⎿  No matches
```

---

### 6.6 `shell` — Shell execution

The `shell` tool has four sub-modes controlled by the `type` parameter.

#### 6.6.1 `type=oneshot` — synchronous execution

Header target: `command` (truncated at 64 chars, no ` · type` suffix for oneshot).

##### State: IN-FLIGHT

```
[blink]● [toolTitle]Shell Exec([accent]npm test)
  [muted]↳ run the test suite
```

##### State: DONE — exit 0 (collapsed, tail mode)

```
[success]● [toolTitle]Shell Exec([accent]npm test)
  [success]exit 0 [muted]· [muted]42 lines · 1240ms
     [muted]     … +40 lines (ctrl+r to expand)
     [output]  Tests: 38 passed
     [output]  Duration: 1.2s
```

Key points:
- The `exit N` prefix from the raw output text is **stripped** from the body
- Body uses **tail collapse** — shows the last N lines
- `exit 0` is `success` colored; `·` and `lines · Xms` are `muted`

##### State: DONE — exit non-zero

```
[error]● [toolTitle]Shell Exec([accent]npm test)
  [error]exit 1 [muted]· [muted]12 lines · 340ms
     [muted]     … +10 lines (ctrl+r to expand)
     [output]  Error: expect(1).toBe(2)
     [output]  at src/foo.test.ts:14
```

`exit 1` (or any non-0) is `error` colored. Everything else same as success.

##### State: DONE — timed out

```
[error]● [toolTitle]Shell Exec([accent]sleep 9999)
  [error]timed out · killed [muted]· [muted]0 lines
```

Both `timed out` and `killed` are `error` colored; duration is omitted on timeout.

#### 6.6.2 `type=background` — fire-and-forget

Header target: `command · background`

##### State: DONE (started)

```
[success]● [toolTitle]Shell Exec([accent]npm run dev · background)
  [success]▶ [muted]Shell task 3 started
```

`▶` is `success` colored. The label `Shell task N started` is `muted`.
No body. A background-exit notification is injected into the session when it
later exits.

#### 6.6.3 `type=monitor` — streaming with flood guard

Header target: `command · monitor`

##### State: DONE (started)

```
[success]● [toolTitle]Shell Exec([accent]tail -f app.log · monitor)
  [success]▶ [muted]Monitor task 5 started
```

Same structure as background but label says `Monitor task N started`.

#### 6.6.4 `type=wait` — join / sleep

##### Waiting on a task ID

Header target: `taskId` (numeric string)

```
[success]● [toolTitle]Shell Exec([accent]3 · wait)
  [muted]⎿  [task 3] exit 0
     [output]output of the waited task…
```

##### Scheduled wake (no task ID)

```
[success]● [toolTitle]Shell Exec([accent] · wait)
  [muted]⎿  scheduled wake in 30s
```

---

### 6.7 `shell_write` — Send stdin to a session

#### State: IN-FLIGHT

```
[blink]● [toolTitle]Shell Input([accent]→ session 3)
  [muted]↳ send enter key
```

#### State: DONE — success

```
[success]● [toolTitle]Shell Input([accent]→ session 3)
  [muted]⎿  sent 1 bytes
```

`sent N bytes` is fully `muted`. No body.

#### State: DONE — error (session not found or not writable)

```
[error]● [toolTitle]Shell Input([accent]→ session 99)
  [error]⎿  write failed (session not writable)
```

Error text is `error` colored (not muted).

---

### 6.8 `shells` — Session management

#### 6.8.1 `action=list`

##### State: DONE — sessions present

```
[success]● [toolTitle]List Shells([accent]list)
  [muted]⎿  3 sessions
     [success]▶ [output]3  background  npm run dev
     [success]▶ [output]5  monitor     tail -f app.log
     [muted]✓ [output]1  oneshot     git status
```

- `▶` = `success` color for running sessions
- `✓` = `muted` color for finished sessions
- ID, kind, command are `toolOutput` colored
- Columns are aligned: ID right-padded to widest ID, kind right-padded to widest kind

##### State: DONE — no sessions

```
[success]● [toolTitle]List Shells([accent]list)
  [muted]⎿  0 sessions
```

#### 6.8.2 `action=output`

```
[success]● [toolTitle]List Shells([accent]output 3)
  [muted]⎿  [muted]task 3 ([success]running[muted]) · [muted]42 lines
     [output]line 1 from session 3
     [output]line 2 from session 3
     … (tail collapsed)
```

- `running` = `success` colored; `done` = `muted`
- Output uses **tail collapse** (same as shell oneshot)

#### 6.8.3 `action=stop`

```
[success]● [toolTitle]List Shells([accent]stop 3)
  [muted]⎿  stopped 3
```

Single summary line, no body.

---

## 7. Permission Prompt Wireframes

When a tool call hits an `ask` decision in the permission engine, a modal
dialog is shown using `ctx.ui.select` / `ctx.ui.input`.

### 7.1 The main permission select

```
╔═══════════════════════════════════════════════════════════╗
║  shell(command=rm -rf ./dist)                             ║
║   ⎿ clean the build output                               ║
║  [judge: allow — safe path under ./dist]                  ║ ← only if LLM judge ran
║                                                           ║
║  ▶ Allow once                                             ║
║    Allow always                                           ║
║    Deny                                                   ║
╚═══════════════════════════════════════════════════════════╝
```

- Title text is the full formatter template output:
  `{{tool.name}}({{match.param.name}}={{match.param.value}})\n ⎿ {{reason}}`
- Judge line is appended when LLM judge returned a `suggest` verdict (not a
  definitive allow/deny).
- Selection is `ctx.ui.select` — pi handles focus/highlight rendering.

### 7.2 Allow always — pattern input

Shown after "Allow always" is chosen:

```
╔═══════════════════════════════════════════════════════════╗
║  Pattern to allow always                                  ║
║                                                           ║
║  > rm -rf *_____________                                  ║ ← pre-filled, editable
╚═══════════════════════════════════════════════════════════╝
```

Pre-fill derivation:
- `shell` tool → first 2 tokens + ` *` (e.g. `rm -rf *`)
- path tools → exact value (e.g. `/home/arnold/project/src/**`)

### 7.3 Deny — reason input (optional)

```
╔═══════════════════════════════════════════════════════════╗
║  Reason for denial (optional)                             ║
║                                                           ║
║  > _____________                                          ║
╚═══════════════════════════════════════════════════════════╝
```

Empty input is accepted (reason becomes `undefined`).

### 7.4 No-UI auto-deny

When `hasUI=false` (CI, piped, JSON mode), any `ask` decision resolves to
`deny` automatically with the message:
`"no UI to confirm this action; denied"`

No dialog is shown. This is a hard non-overridable safety rule.

---

## 8. `/tasks` Slash Command

The `/tasks` command opens a two-step TUI select flow for managing shell sessions.

### Step 1 — Session list

```
╔═══════════════════════════════════════════════════════════╗
║  Shell sessions                                           ║
║                                                           ║
║  ▶ 3 [background] running — npm run dev                   ║
║    5 [monitor] running — tail -f app.log                  ║
║    1 [oneshot] exited — git status                        ║
║    Close                                                  ║
╚═══════════════════════════════════════════════════════════╝
```

- Format: `{id} [{kind}] {running|exited} — {command.slice(0, 50)}`
- "Close" is always the last option

### Step 2 — Action for chosen session

```
╔═══════════════════════════════════════════════════════════╗
║  Session 3                                                ║
║                                                           ║
║  ▶ Stop                                                   ║
║    Cancel                                                 ║
╚═══════════════════════════════════════════════════════════╝
```

- "Stop" → `escalateKill` + `store.remove` + `ctx.ui.notify("stopped N", "info")`
- "Cancel" / dismissed → no-op
- When no sessions exist → `ctx.ui.notify("no shell sessions", "info")` (no dialog)
- No-UI fallback → `process.stdout.write(JSON.stringify(list))` (JSON dump)

---

## 9. Width Safety

All rendered lines are clamped to terminal width using pi's `truncateToWidth`
from `@earendil-works/pi-tui`. This is applied inside the `comp()` helper:

```typescript
render: (width: number) =>
  Number.isFinite(width) && width > 0
    ? lines.map((l) => truncateToWidth(l, width))
    : lines,
```

**Rules for new tools:**
- Never pre-truncate manually — use `trunc(str, 64)` only for *semantic*
  shortening of a target token in the header (so the header reads well), not
  for layout safety.
- Always return your `Component` via `comp([...lines])`, not a raw object,
  so the width clamping is applied automatically.
- `truncateToWidth` is ANSI-aware (uses `visibleWidth` internally) — styled
  strings with escape codes are safe.

---

## 10. Adding a New Tool — Checklist

Follow these steps to produce a display that is consistent with this spec:

1. **Pick a verb** — single word, title-cased, unique. Add it to `VERB` in
   `src/tools/render/index.ts`.

2. **Define `callTarget()`** — implement the `case "your_tool":` branch.
   Return a string that fits comfortably in one line at ~80 cols. Use
   `trunc(str, 64)` if the target could be long. Use `fg(theme, "muted", …)`
   inside the target string for secondary info (like `+N more`).

3. **Define `renderResult()` `case "your_tool":`** — use the `out()` helper:
   ```typescript
   return out(
     dim(yourSummary(…)),   // summary line — always dim/muted
     lines.map(l => fg(theme, "toolOutput", l)),  // body lines
   );
   ```
   For tail-mode: pass `true` as the third arg to `out()`.

4. **Set a `DEFAULT_CAPS` entry** — choose 0 (summary-only), 15, 20, or 30
   depending on expected output volume.

5. **Write a summary builder** in `summaries.ts` — pure function, no deps,
   deterministic. Unit-test it.

6. **Test the renderer** in `renderers.test.ts`:
   - Test `renderCall` header for the happy path
   - Test `renderResult` summary line and body
   - Test collapse hint appears at the right position (head vs. tail)
   - Test empty / no-results state

7. **Register in `installToolSuite`** with `renderShell: "self"` (via
   `makeToolRenderers`). This is how pi knows to use your `renderCall` /
   `renderResult` instead of its generic chrome.

8. **Document it** — add a section 6.X wireframe in this file covering:
   - IN-FLIGHT state (blink bullet)
   - All DONE states (success, error, empty)
   - Edge cases (multiple targets, tail vs head, etc.)

---

## 11. Quick Reference — Summary Line Formats

All summary lines are `muted`. Separator is space-padded ` · ` (space + middle dot + space).

```
file_read (file)   Read N lines (X KB)
file_read (dir)    Listed N entries
file_read (image)  Image <mime> [(scaled)]
file_write         Wrote N lines (X KB)
file_edit          Updated N file[s] · +X −Y
find (found)       Found N file[s]
find (empty)       No files found
grep (found)       Found N match[es]
grep (empty)       No matches
shell (oneshot)    <exit N | timed out · killed> · N line[s] · Xms
shell (bg/mon)     ▶ Shell|Monitor task N started
shell (wait)       [task N] exit N  |  scheduled wake in Xt
shell_write (ok)   sent N bytes
shell_write (err)  write failed …        ← error color, not muted
shells (list)      N session[s]
shells (output)    task N (running|done) · N line[s]
shells (stop)      stopped N
```
