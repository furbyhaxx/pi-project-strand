/**
 * ask_user_question — Interactive structured question tool for pi.
 *
 * Replicates the Claude Code AskUserQuestion interface: chip-tab navigation,
 * bordered box layout, preview pane, notes mode, multi-select, and the
 * auto-injected "Other..." escape hatch.
 *
 * This tool ships with pi-project-strand so the LLM always has a native
 * structured question mechanism regardless of what other extensions are loaded.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  Editor,
  type EditorTheme,
  Key,
  matchesKey,
  Text,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import { Type } from "typebox";

// ─── Shared types ────────────────────────────────────────────────────────────

export interface AskUserQuestionOption {
  label: string;
  description: string;
  preview?: string;
}

export interface AskUserQuestionQuestion {
  question: string;
  header: string;
  options: AskUserQuestionOption[];
  multiSelect: boolean;
}

export interface AskUserQuestionParams {
  questions: AskUserQuestionQuestion[];
  metadata?: { source?: string };
}

export interface AskUserQuestionAnnotation {
  notes?: string;
  preview?: string;
}

export interface AskUserQuestionResult {
  cancelled: boolean;
  answers?: Record<string, string>;
  annotations?: Record<string, AskUserQuestionAnnotation>;
}

export type DisplayOption = AskUserQuestionOption & { isOther?: boolean };
type InputMode = "other" | "notes" | null;

const OTHER_LABEL = "Other...";

// ─── Schema ───────────────────────────────────────────────────────────────────

const OptionSchema = Type.Object(
  {
    label: Type.String({ description: "Display text, 1-5 words." }),
    description: Type.String({ description: "Trade-off or implication shown below the label." }),
    preview: Type.Optional(Type.String({ description: "Optional markdown preview content — single-select only." })),
  },
  { additionalProperties: false }
);

const QuestionSchema = Type.Object(
  {
    question: Type.String({ description: "Full question text. Must end with '?'." }),
    header: Type.String({ description: "Short chip label shown in the tab bar. Max 12 characters." }),
    multiSelect: Type.Boolean({
      default: false,
      description: "true = user may select multiple options. Phrase the question in plural ('Which features…').",
    }),
    options: Type.Array(OptionSchema, {
      minItems: 2,
      maxItems: 4,
      description:
        "Answer options. 2-4 required. Do NOT include an Other option — it is added automatically by the harness.",
    }),
  },
  { additionalProperties: false }
);

const AskUserQuestionParameters = Type.Object(
  {
    questions: Type.Array(QuestionSchema, {
      minItems: 1,
      maxItems: 8,
      description: "1-8 questions to ask. Batch all related decisions into a single call.",
    }),
    metadata: Type.Optional(
      Type.Object(
        { source: Type.Optional(Type.String({ description: "Analytics tag, e.g. 'clarify' or 'remember'." })) },
        { additionalProperties: false }
      )
    ),
  },
  { additionalProperties: false }
);

// ─── Prompt guidance ──────────────────────────────────────────────────────────

export const PROMPT_SNIPPET =
  "Ask the user one or more structured questions with options, batching up to 8 related questions per call.";

export const PROMPT_GUIDELINES = [
  `Use ask_user_question when you face a decision where the user's preference materially changes the outcome, \
when you hit ambiguity you cannot resolve from context, or when you want to surface a recommendation \
while letting the user steer. Batch all related questions into one call (up to 8) rather than asking \
them sequentially in plain text.`,

  `Do NOT use ask_user_question for yes/no confirmation of risky or destructive actions (use the pi \
permission/confirm flow instead), for plan approval (use the planning flow), or when you can \
reasonably infer the answer from prior context or project conventions.`,

  `Authoring rules for ask_user_question: \
1-8 questions per call. \
2-4 options per question. \
Never include an "Other" option — the harness adds it automatically. \
Place your recommended option first and suffix its label with " (Recommended)". \
header must be ≤12 chars. \
label must be 1-5 words. \
question must end with "?". \
Use preview only for visual side-by-side comparisons (mockups, code, diagrams) on single-select questions only. \
Use multiSelect: true and plural phrasing ("Which features…") when answers are not mutually exclusive.`,
];

// ─── Input validation ─────────────────────────────────────────────────────────

export function validateParams(params: AskUserQuestionParams): string | undefined {
  if (params.questions.length < 1 || params.questions.length > 8) {
    return "questions must have 1–8 items";
  }
  const seenQuestions = new Set<string>();
  for (const q of params.questions) {
    if (seenQuestions.has(q.question)) {
      return "duplicate question text — result keying would collide";
    }
    seenQuestions.add(q.question);
    if (q.options.length < 2 || q.options.length > 4) {
      return "each question needs 2–4 options";
    }
    if (q.header.length > 12) {
      return `header exceeds 12 chars: "${q.header}"`;
    }
    if (!q.question.trimEnd().endsWith("?")) {
      return `question must end with "?": "${q.question}"`;
    }
    const seenLabels = new Set<string>();
    for (const opt of q.options) {
      const key = opt.label.trim().toLowerCase();
      if (seenLabels.has(key)) {
        return `duplicate label "${opt.label}" in question "${q.question}"`;
      }
      seenLabels.add(key);
      const normalised = key.replace(/[.!…]+$/u, "");
      if (normalised === "other") {
        return `do not include an "Other" option — the harness adds it automatically`;
      }
      if (q.multiSelect && opt.preview !== undefined) {
        return "preview is only supported on single-select questions";
      }
    }
  }
  return undefined;
}

// ─── State helpers ────────────────────────────────────────────────────────────

function displayOptions(q: AskUserQuestionQuestion): DisplayOption[] {
  return [...q.options, { label: OTHER_LABEL, description: "Type a custom answer.", isOther: true }];
}

export function wrapOptionIndex(current: number, delta: number, count: number): number {
  if (count <= 0) return 0;
  return (((current + delta) % count) + count) % count;
}

function optionHasPreview(q: AskUserQuestionQuestion): boolean {
  return !q.multiSelect && q.options.some((o) => o.preview !== undefined);
}

export function hasSubmitTab(questionCount: number): boolean {
  return questionCount > 1;
}

export function submitTabIndex(questionCount: number): number | undefined {
  return hasSubmitTab(questionCount) ? questionCount : undefined;
}

export function isSubmitTab(tabIndex: number, questionCount: number): boolean {
  return submitTabIndex(questionCount) === tabIndex;
}

export function missingQuestionHeaders(
  questions: AskUserQuestionQuestion[],
  answers: Record<string, string>
): string[] {
  return questions
    .filter((q) => !Object.hasOwn(answers, q.question))
    .map((q) => q.header);
}

export function nextQuestionOrSubmitTab(
  current: number,
  questions: AskUserQuestionQuestion[],
  answers: Record<string, string>
): number | "submit" {
  for (let offset = 1; offset <= questions.length; offset++) {
    const candidate = (current + offset) % questions.length;
    if (!Object.hasOwn(answers, questions[candidate]!.question)) return candidate;
  }
  return hasSubmitTab(questions.length) ? "submit" : current;
}

export function multiAnswerText(
  questionIndex: number,
  selection: Set<number>,
  options: DisplayOption[],
  selectedOtherQuestions: Set<number>,
  customOtherAnswers: Map<number, string>
): string {
  const labels = Array.from(selection)
    .sort((a, b) => a - b)
    .map((i) => options[i])
    .filter((o): o is DisplayOption => o !== undefined && o.isOther !== true)
    .map((o) => o.label);
  if (selectedOtherQuestions.has(questionIndex)) {
    const custom = customOtherAnswers.get(questionIndex);
    if (custom !== undefined) labels.push(custom);
  }
  return labels.join(", ");
}

export function answerDisplayText(answer: string): string {
  return answer === "" ? "(empty answer)" : answer;
}

function padAnsi(text: string, width: number): string {
  return text + " ".repeat(Math.max(0, width - visibleWidth(text)));
}

/**
 * Layout width for the question box.
 *
 * MUST never exceed the actual terminal width: pi-tui throws
 * "Rendered line exceeds terminal width" (and crashes the agent) if any
 * rendered line is wider than the terminal. This happens on narrow terminals
 * — e.g. a phone SSH session, or a desktop→mobile resize mid-dialog.
 *
 * We keep a lower guard of 1 so internal box math (innerWidth = width - 4,
 * `"─".repeat(width - 2)`) never goes degenerate, but we NEVER widen past the
 * real terminal width. The final render also truncates to the live width as a
 * belt-and-suspenders guarantee for the width === 0 edge.
 */
export function boxLayoutWidth(terminalWidth: number): number {
  return Math.max(1, terminalWidth);
}

export function wrapInlineItems(items: string[], width: number): string[] {
  const safe = Math.max(1, width);
  const lines: string[] = [];
  let current = "";
  for (const item of items) {
    const fitted = visibleWidth(item) > safe ? truncateToWidth(item, safe) : item;
    if (!current) { current = fitted; continue; }
    const candidate = `${current} ${fitted}`;
    if (visibleWidth(candidate) <= safe) {
      current = candidate;
    } else {
      lines.push(current);
      current = fitted;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

// ─── Option rendering helpers ─────────────────────────────────────────────────

type Style = (text: string) => string;

export interface OptionLabelLineStyles {
  accent: Style;
  selected: Style;
  text: Style;
}

export function optionMarker(multiSelect: boolean, focused: boolean, selected: boolean): string {
  if (selected) return multiSelect ? "[X]" : "✓";
  return multiSelect ? "[ ]" : focused ? "●" : "○";
}

export function formatOptionLabelLine(
  focused: boolean,
  selected: boolean,
  marker: string,
  label: string,
  styles: OptionLabelLineStyles
): string {
  const prefix = focused ? styles.accent("› ") : "  ";
  const style = selected ? styles.selected : focused ? styles.accent : styles.text;
  return `${prefix}${style(`${marker} ${label}`)}`;
}

export function formatOptionDescriptionText(
  description: string,
  isOther: boolean | undefined,
  selected: boolean,
  customAnswer: string | undefined
): string {
  return isOther && selected && customAnswer !== undefined ? answerDisplayText(customAnswer) : description;
}

function plainPreviewLines(text: string, width: number): string[] {
  const lines: string[] = [];
  for (const src of text.split("\n")) {
    const wrapped = wrapTextWithAnsi(src || " ", Math.max(1, width));
    lines.push(...(wrapped.length > 0 ? wrapped : [""]));
  }
  return lines.length > 0 ? lines : [""];
}

function createCancelledResult(): AskUserQuestionResult {
  return { cancelled: true };
}

function stringifyResult(result: AskUserQuestionResult): string {
  return JSON.stringify(result, null, 2);
}

// ─── Extension ────────────────────────────────────────────────────────────────

export default function askUserQuestionExtension(pi: ExtensionAPI) {
  pi.registerTool({
    name: "ask_user_question",
    label: "Ask User",
    description:
      "Present the user with 1-8 structured questions in an interactive TUI dialog. " +
      "Each question shows 2-4 labelled options plus an automatic 'Other…' text input. " +
      "Single-select questions advance immediately on Enter; multi-select questions use Space to toggle and Enter to confirm. " +
      "Use when the user's preference materially changes the direction of work and you cannot infer it from context. " +
      "Do NOT use for yes/no risk confirmations (use the permission flow) or plan approval. " +
      "Returns: { cancelled: bool, answers: { [questionText]: selectedLabel | customText }, annotations }. " +
      "Requires an interactive terminal — throws in non-TTY or print mode.",
    promptSnippet: PROMPT_SNIPPET,
    promptGuidelines: PROMPT_GUIDELINES,
    parameters: AskUserQuestionParameters,

    async execute(_toolCallId, params: AskUserQuestionParams, _signal, _onUpdate, ctx) {
      const validationError = validateParams(params);
      if (validationError) {
        throw new Error(`ask_user_question: ${validationError}`);
      }
      if (!ctx.hasUI || !process.stdin.isTTY || !process.stdout.isTTY) {
        throw new Error("ask_user_question requires an interactive terminal");
      }

      const questions = params.questions;
      let shouldTerminateAfterDialog = false;
      let result: AskUserQuestionResult;

      ctx.ui.setWorkingVisible(false);
      try {
        result =
          (await ctx.ui.custom<AskUserQuestionResult>((tui, theme, _keybindings, done) => {
            // ── State ─────────────────────────────────────────────────────────
            let currentTabIndex = 0;
            let optionIndex = 0;
            let submitPickerIndex = 0;
            let inputMode: InputMode = null;
            let pendingEscape = false;
            let showHelp = false;
            let statusMessage = "";
            let cachedLines: string[] | undefined;

            const answers: Record<string, string> = {};
            const annotations: Record<string, AskUserQuestionAnnotation> = {};
            const selectedSingle = new Map<number, number>();
            const selectedMulti = new Map<number, Set<number>>();
            const selectedOtherQuestions = new Set<number>();
            const customOtherAnswers = new Map<number, string>();
            const emptySelectionWarnings = new Set<number>();

            const editorTheme: EditorTheme = {
              borderColor: (s) => theme.fg("accent", s),
              selectList: {
                selectedPrefix: (t) => theme.fg("accent", t),
                selectedText: (t) => theme.fg("accent", t),
                description: (t) => theme.fg("muted", t),
                scrollInfo: (t) => theme.fg("dim", t),
                noMatch: (t) => theme.fg("warning", t),
              },
            };
            const editor = new Editor(tui, editorTheme);

            const multiQuestion = questions.length > 1;
            const reviewTabIndex = questions.length;

            function refresh() { cachedLines = undefined; tui.requestRender(); }

            function currentQuestionIndex(): number {
              return Math.min(currentTabIndex, questions.length - 1);
            }
            function onSubmitTab(): boolean {
              return multiQuestion && currentTabIndex === reviewTabIndex;
            }
            function currentQuestion(): AskUserQuestionQuestion {
              return questions[currentQuestionIndex()]!;
            }
            function currentOptions(): DisplayOption[] {
              return displayOptions(currentQuestion());
            }

            function preferredOptionIndex(fallback = optionIndex): number {
              const qi = currentQuestionIndex();
              const count = currentOptions().length;
              if (count <= 0) return 0;
              const otherIdx = count - 1;
              if (currentQuestion().multiSelect) {
                const sel = selectedMulti.get(qi);
                const first = sel
                  ? Array.from(sel).sort((a, b) => a - b).find((i) => i >= 0 && i < count)
                  : undefined;
                if (first !== undefined) return first;
                if (selectedOtherQuestions.has(qi)) return otherIdx;
                return 0;
              }
              const sel = selectedSingle.get(qi);
              if (sel !== undefined && sel >= 0 && sel < count) return sel;
              if (selectedOtherQuestions.has(qi)) return otherIdx;
              return fallback;
            }

            function focusCurrentTab(fallback = optionIndex) {
              optionIndex = onSubmitTab() ? 0 : preferredOptionIndex(fallback);
            }

            function currentMultiSelection(): Set<number> {
              const qi = currentQuestionIndex();
              let sel = selectedMulti.get(qi);
              if (!sel) { sel = new Set<number>(); selectedMulti.set(qi, sel); }
              return sel;
            }

            function isOptionSelected(
              question: AskUserQuestionQuestion,
              qi: number,
              index: number,
              option: DisplayOption,
              multiSel: Set<number>
            ): boolean {
              if (question.multiSelect) {
                return multiSel.has(index) || (option.isOther === true && selectedOtherQuestions.has(qi));
              }
              return selectedSingle.get(qi) === index;
            }

            function updateCurrentMultiAnswer() {
              const q = currentQuestion();
              const qi = currentQuestionIndex();
              const sel = currentMultiSelection();
              const opts = currentOptions();
              const hasSelection = sel.size > 0 || selectedOtherQuestions.has(qi);
              if (!hasSelection) { delete answers[q.question]; return; }
              answers[q.question] = multiAnswerText(qi, sel, opts, selectedOtherQuestions, customOtherAnswers);
            }

            function allAnswered(): boolean {
              return questions.every((q) => Object.hasOwn(answers, q.question));
            }

            function finishWithAnswers() {
              const finalAnnotations = Object.keys(annotations).length > 0 ? annotations : undefined;
              done({ cancelled: false, answers, annotations: finalAnnotations });
            }

            function moveToNextQuestionOrReview() {
              if (!multiQuestion) { finishWithAnswers(); return; }
              const next = nextQuestionOrSubmitTab(currentQuestionIndex(), questions, answers);
              currentTabIndex = next === "submit" ? reviewTabIndex : next;
              focusCurrentTab(0);
              submitPickerIndex = 0;
              statusMessage = "";
              refresh();
            }

            function dismissToChat() {
              shouldTerminateAfterDialog = true;
              done(createCancelledResult());
            }

            function saveAnnotation(q: AskUserQuestionQuestion, patch: AskUserQuestionAnnotation) {
              const current = annotations[q.question] ?? {};
              annotations[q.question] = { ...current, ...patch };
            }

            function saveSingleAnswer(option: DisplayOption) {
              const q = currentQuestion();
              const qi = currentQuestionIndex();
              selectedSingle.set(qi, optionIndex);
              selectedOtherQuestions.delete(qi);
              customOtherAnswers.delete(qi);
              answers[q.question] = option.label;
              if (option.preview) saveAnnotation(q, { preview: option.preview });
              moveToNextQuestionOrReview();
            }

            function saveMultiAnswer() {
              const q = currentQuestion();
              const qi = currentQuestionIndex();
              const sel = currentMultiSelection();
              const hasSelection = sel.size > 0 || selectedOtherQuestions.has(qi);
              if (!hasSelection && !emptySelectionWarnings.has(qi)) {
                emptySelectionWarnings.add(qi);
                statusMessage = "No options selected. Press Enter again to confirm an empty answer.";
                refresh();
                return;
              }
              if (hasSelection) { updateCurrentMultiAnswer(); } else { answers[q.question] = ""; }
              moveToNextQuestionOrReview();
            }

            function startInput(mode: InputMode) {
              inputMode = mode;
              pendingEscape = false;
              statusMessage = mode === "other" ? "Type a custom answer." : "Add a note for the focused option.";
              editor.setText(
                mode === "other" ? (customOtherAnswers.get(currentQuestionIndex()) ?? "") : ""
              );
              refresh();
            }

            editor.onSubmit = (value) => {
              const text = value.trim();
              if (!text) { statusMessage = "Input cannot be empty."; refresh(); return; }
              const q = currentQuestion();
              if (inputMode === "other") {
                const qi = currentQuestionIndex();
                const opts = currentOptions();
                selectedOtherQuestions.add(qi);
                customOtherAnswers.set(qi, text);
                if (q.multiSelect) {
                  updateCurrentMultiAnswer();
                } else {
                  selectedSingle.set(qi, opts.length - 1);
                  answers[q.question] = text;
                }
                inputMode = null;
                editor.setText("");
                moveToNextQuestionOrReview();
                return;
              }
              if (inputMode === "notes") {
                saveAnnotation(q, { notes: text });
                inputMode = null;
                editor.setText("");
                statusMessage = "Note saved.";
                refresh();
              }
            };

            function confirmFocusedOption() {
              const q = currentQuestion();
              const opts = currentOptions();
              const option = opts[optionIndex];
              if (!option) return;
              if (option.isOther) { startInput("other"); return; }
              if (q.multiSelect) { saveMultiAnswer(); } else { saveSingleAnswer(option); }
            }

            function toggleFocusedMultiOption() {
              const q = currentQuestion();
              const opts = currentOptions();
              const option = opts[optionIndex];
              if (!option) return;
              if (option.isOther) { startInput("other"); return; }
              const sel = currentMultiSelection();
              if (sel.has(optionIndex)) { sel.delete(optionIndex); } else { sel.add(optionIndex); }
              updateCurrentMultiAnswer();
              emptySelectionWarnings.delete(currentQuestionIndex());
              statusMessage =
                q.multiSelect && Object.hasOwn(answers, q.question) ? "Answer updated." : "";
              refresh();
            }

            // ── Input handling ───────────────────────────────────────────────

            function handleInput(data: string) {
              if (matchesKey(data, Key.ctrl("c"))) { dismissToChat(); return; }

              if (inputMode) {
                if (matchesKey(data, Key.escape)) {
                  inputMode = null; editor.setText(""); statusMessage = ""; refresh(); return;
                }
                editor.handleInput(data); refresh(); return;
              }

              if (showHelp) { showHelp = false; refresh(); return; }

              if (matchesKey(data, Key.escape)) {
                if (pendingEscape) { dismissToChat(); return; }
                pendingEscape = true;
                statusMessage = "Press Esc again to dismiss and return to chat.";
                refresh(); return;
              }
              pendingEscape = false;

              const totalTabs = multiQuestion ? questions.length + 1 : questions.length;
              if (matchesKey(data, Key.tab) || matchesKey(data, Key.right)) {
                currentTabIndex = (currentTabIndex + 1) % totalTabs;
                focusCurrentTab(); submitPickerIndex = 0; statusMessage = ""; refresh(); return;
              }
              if (matchesKey(data, Key.shift("tab")) || matchesKey(data, Key.left)) {
                currentTabIndex = (currentTabIndex - 1 + totalTabs) % totalTabs;
                focusCurrentTab(); submitPickerIndex = 0; statusMessage = ""; refresh(); return;
              }

              if (onSubmitTab()) {
                if (matchesKey(data, Key.up) || matchesKey(data, "k")) {
                  submitPickerIndex = wrapOptionIndex(submitPickerIndex, -1, 2);
                  statusMessage = ""; refresh(); return;
                }
                if (matchesKey(data, Key.down) || matchesKey(data, "j")) {
                  submitPickerIndex = wrapOptionIndex(submitPickerIndex, 1, 2);
                  statusMessage = ""; refresh(); return;
                }
                if (matchesKey(data, Key.enter)) {
                  if (submitPickerIndex === 1) { dismissToChat(); return; }
                  const missing = missingQuestionHeaders(questions, answers);
                  if (missing.length > 0) {
                    statusMessage = `Answer remaining questions before submitting: ${missing.join(", ")}`;
                    refresh(); return;
                  }
                  finishWithAnswers(); return;
                }
                return;
              }

              const q = currentQuestion();
              const opts = currentOptions();

              if (matchesKey(data, Key.up) || matchesKey(data, "k")) {
                optionIndex = wrapOptionIndex(optionIndex, -1, opts.length);
                statusMessage = ""; refresh(); return;
              }
              if (matchesKey(data, Key.down) || matchesKey(data, "j")) {
                optionIndex = wrapOptionIndex(optionIndex, 1, opts.length);
                statusMessage = ""; refresh(); return;
              }
              if (matchesKey(data, Key.space)) {
                if (q.multiSelect) toggleFocusedMultiOption();
                return;
              }
              if (matchesKey(data, Key.enter)) { confirmFocusedOption(); return; }
              if (matchesKey(data, "o")) { startInput("other"); return; }
              if (matchesKey(data, "n")) { startInput("notes"); return; }
              if (matchesKey(data, Key.question)) { showHelp = true; refresh(); }
            }

            // ── Rendering ────────────────────────────────────────────────────

            function chipBarLines(width: number): string[] {
              const chips = questions.map((q, i) => {
                const answered = Object.hasOwn(answers, q.question);
                const active = !onSubmitTab() && i === currentQuestionIndex();
                const marker = answered ? "✓" : "○";
                const raw = `[${marker} ${q.header}]`;
                if (active) return theme.bg("selectedBg", theme.fg("text", raw));
                return theme.fg(answered ? "success" : "muted", raw);
              });
              if (multiQuestion) {
                const raw = "[✓ Submit]";
                chips.push(
                  onSubmitTab()
                    ? theme.bg("selectedBg", theme.fg("text", raw))
                    : theme.fg(allAnswered() ? "success" : "dim", raw)
                );
              }
              return wrapInlineItems(chips, width);
            }

            function addBoxLine(lines: string[], content: string, innerWidth: number) {
              lines.push(
                `${theme.fg("accent", "│ ")}${padAnsi(truncateToWidth(content, innerWidth), innerWidth)}${theme.fg("accent", " │")}`
              );
            }

            function optionLines(q: AskUserQuestionQuestion, width: number): string[] {
              const opts = displayOptions(q);
              const qi = currentQuestionIndex();
              const multiSel = q.multiSelect ? currentMultiSelection() : new Set<number>();
              const lines: string[] = [];

              for (let i = 0; i < opts.length; i++) {
                const opt = opts[i]!;
                const focused = i === optionIndex;
                const selected = isOptionSelected(q, qi, i, opt, multiSel);
                const marker = optionMarker(q.multiSelect, focused, selected);
                lines.push(
                  formatOptionLabelLine(focused, selected, marker, opt.label, {
                    accent: (t) => theme.fg("accent", t),
                    selected: (t) => theme.fg("warning", t),
                    text: (t) => theme.fg("text", t),
                  })
                );
                const customOtherSelected =
                  opt.isOther === true && selected && customOtherAnswers.has(qi);
                const desc = formatOptionDescriptionText(
                  opt.description,
                  opt.isOther,
                  selected,
                  customOtherAnswers.get(qi)
                );
                const descStyle = customOtherSelected ? "warning" : "muted";
                for (const dl of wrapTextWithAnsi(desc, Math.max(1, width - 6))) {
                  lines.push(`      ${theme.fg(descStyle, dl)}`);
                }
              }
              return lines.map((l) => truncateToWidth(l, width));
            }

            function renderPreviewLayout(
              lines: string[],
              q: AskUserQuestionQuestion,
              innerWidth: number
            ) {
              const leftWidth = Math.max(24, Math.min(38, Math.floor((innerWidth - 3) * 0.42)));
              const rightWidth = Math.max(12, innerWidth - leftWidth - 3);
              const opts = currentOptions();
              const previewText = opts[optionIndex]?.preview ?? "No preview for this option.";
              const leftLines = optionLines(q, leftWidth);
              const rightLines = plainPreviewLines(previewText, rightWidth - 2).map((l) =>
                theme.fg("text", l)
              );
              const rows = Math.max(leftLines.length, rightLines.length);
              addBoxLine(
                lines,
                `${theme.fg("accent", "Options")}${" ".repeat(Math.max(1, leftWidth - 7))}   ${theme.fg("accent", "Preview")}`,
                innerWidth
              );
              for (let i = 0; i < rows; i++) {
                const left = padAnsi(leftLines[i] ?? "", leftWidth);
                const right = padAnsi(rightLines[i] ?? "", rightWidth);
                addBoxLine(lines, `${left} ${theme.fg("muted", "│")} ${right}`, innerWidth);
              }
            }

            function renderStandardLayout(
              lines: string[],
              q: AskUserQuestionQuestion,
              innerWidth: number
            ) {
              for (const line of optionLines(q, innerWidth)) addBoxLine(lines, line, innerWidth);
            }

            function renderSubmitPickerRow(index: number, label: string): string {
              const focused = submitPickerIndex === index;
              const prefix = focused ? theme.fg("accent", "› ") : "  ";
              const row = `${prefix}${index + 1}. ${label}`;
              return focused
                ? theme.bg("selectedBg", theme.fg("text", row))
                : theme.fg(index === 0 ? "success" : "muted", row);
            }

            function renderSubmitTab(lines: string[], innerWidth: number) {
              addBoxLine(lines, theme.fg("accent", theme.bold("Review your answers")), innerWidth);
              addBoxLine(lines, "", innerWidth);
              for (const q of questions) {
                if (!Object.hasOwn(answers, q.question)) continue;
                const answer = answerDisplayText(answers[q.question] ?? "");
                addBoxLine(lines, `${theme.fg("muted", "• ")}${theme.fg("accent", q.header)}`, innerWidth);
                for (const al of wrapTextWithAnsi(`→ ${answer}`, Math.max(1, innerWidth - 2))) {
                  addBoxLine(lines, `  ${theme.fg("text", al)}`, innerWidth);
                }
              }
              const missing = missingQuestionHeaders(questions, answers);
              if (missing.length > 0) {
                addBoxLine(lines, "", innerWidth);
                addBoxLine(
                  lines,
                  theme.fg("warning", `⚠ Answer remaining questions before submitting: ${missing.join(", ")}`),
                  innerWidth
                );
              }
              addBoxLine(lines, "", innerWidth);
              addBoxLine(lines, renderSubmitPickerRow(0, "Submit answers"), innerWidth);
              addBoxLine(lines, renderSubmitPickerRow(1, "Cancel / return to chat"), innerWidth);
            }

            function render(width: number): string[] {
              if (cachedLines) return cachedLines;
              const safeWidth = boxLayoutWidth(width);
              const innerWidth = Math.max(1, safeWidth - 4);
              const lines: string[] = [];
              const q = currentQuestion();
              const title = onSubmitTab()
                ? " Review answers "
                : ` Question ${currentQuestionIndex() + 1}/${questions.length} `;
              const topFill = Math.max(0, safeWidth - visibleWidth(title) - 3);

              lines.push(theme.fg("accent", `╭─${title}${"─".repeat(topFill)}╮`));
              for (const cl of chipBarLines(innerWidth)) addBoxLine(lines, cl, innerWidth);
              addBoxLine(lines, "", innerWidth);

              if (!onSubmitTab()) {
                for (const ql of wrapTextWithAnsi(q.question, innerWidth)) {
                  addBoxLine(lines, theme.fg("text", ql), innerWidth);
                }
                addBoxLine(lines, "", innerWidth);
              }

              if (onSubmitTab()) {
                renderSubmitTab(lines, innerWidth);
              } else if (showHelp) {
                const helpLines = [
                  "↑/↓ or j/k  move focus",
                  "space       toggle a multi-select option",
                  "enter       confirm this question",
                  "o / Other…  type a custom answer",
                  "n           add notes for the focused option",
                  "tab / shift+tab  jump between questions",
                  "esc esc     dismiss and return to chat",
                  "?           close this help",
                ];
                for (const hl of helpLines) addBoxLine(lines, theme.fg("muted", hl), innerWidth);
              } else if (inputMode) {
                addBoxLine(
                  lines,
                  theme.fg("accent", inputMode === "other" ? "Custom answer:" : "Notes:"),
                  innerWidth
                );
                for (const el of editor.render(innerWidth)) addBoxLine(lines, el, innerWidth);
              } else if (optionHasPreview(q)) {
                renderPreviewLayout(lines, q, innerWidth);
              } else {
                renderStandardLayout(lines, q, innerWidth);
              }

              addBoxLine(lines, "", innerWidth);
              if (statusMessage) addBoxLine(lines, theme.fg("warning", statusMessage), innerWidth);

              const controls = inputMode
                ? "Enter submit  •  Esc back"
                : onSubmitTab()
                  ? "↑↓/jk move  •  Enter confirm  •  Tab questions  •  Esc Esc return to chat"
                  : q.multiSelect
                    ? "↑↓/jk move  •  Space toggle  •  Enter confirm  •  o Other  •  n notes  •  ? help"
                    : "↑↓/jk move  •  Enter select  •  o Other  •  n notes  •  Tab questions  •  ? help";
              addBoxLine(lines, theme.fg("dim", controls), innerWidth);
              lines.push(theme.fg("accent", `╰${"─".repeat(safeWidth - 2)}╯`));

              // Truncate to the LIVE terminal width, never the (guarded) layout
              // width — this is the hard guarantee that no line exceeds the
              // terminal, even if width is 0 and safeWidth was floored to 1.
              cachedLines = lines.map((l) => truncateToWidth(l, Math.max(0, width)));
              return cachedLines;
            }

            return {
              render,
              invalidate: () => { cachedLines = undefined; },
              handleInput,
            };
          })) ?? createCancelledResult();
      } finally {
        ctx.ui.setWorkingVisible(true);
      }

      return {
        content: [{ type: "text", text: stringifyResult(result) }],
        details: result,
        ...(shouldTerminateAfterDialog ? { terminate: true } : {}),
      };
    },

    renderCall(args, theme) {
      const params = args as Partial<AskUserQuestionParams>;
      const count = params.questions?.length ?? 0;
      const headers = params.questions?.map((q) => q.header).join(", ") ?? "";
      let text = theme.fg("toolTitle", theme.bold("ask_user_question "));
      text += theme.fg("muted", `${count} question${count === 1 ? "" : "s"}`);
      if (headers) text += theme.fg("dim", ` (${headers})`);
      return new Text(text, 0, 0);
    },

    renderResult(result, _options, theme) {
      const details = result.details as AskUserQuestionResult | undefined;
      if (!details) {
        const first = result.content[0];
        return new Text(first?.type === "text" ? first.text : "", 0, 0);
      }
      if (details.cancelled) {
        return new Text(theme.fg("warning", "ask_user_question cancelled"), 0, 0);
      }
      const lines = Object.entries(details.answers ?? {}).map(
        ([question, answer]) =>
          `${theme.fg("success", "✓ ")}${theme.fg("accent", question)} ${theme.fg("muted", "→")} ${answer}`
      );
      return new Text(lines.join("\n"), 0, 0);
    },
  });
}
