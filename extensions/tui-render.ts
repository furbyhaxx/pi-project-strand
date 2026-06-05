import { keyHint } from "@earendil-works/pi-coding-agent";
import type { Theme } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { truncateToWidth } from "@earendil-works/pi-tui";

export type FrameStatus = "success" | "warning" | "error";

export interface ToolRenderContextLike {
  args?: unknown;
  expanded?: boolean;
  isError?: boolean;
  isPartial?: boolean;
  state?: Record<string, unknown>;
  invalidate?: () => void;
}

const BULLET = "●";
const CONNECTOR = "⎿";
const INTENT = "↳";
const BODY_INDENT = "     ";
const BLINK_TIMER_KEY = "_projectStrandBlinkTimer";
const BLINK_FRAME_KEY = "_projectStrandBlinkFrame";
const RESULT_STATUS_KEY = "_projectStrandResultStatus";

function fallbackTheme(theme: Theme | undefined): Theme {
  return (theme ?? {
    fg: (_key: string, text: string) => text,
    bg: (_key: string, text: string) => text,
    bold: (text: string) => text,
  }) as Theme;
}

export function fg(theme: Theme, key: string, text: string): string {
  return fallbackTheme(theme).fg(key, text);
}

export function bold(theme: Theme, text: string): string {
  const t = fallbackTheme(theme) as Theme & { bold?: (s: string) => string };
  return t.bold ? t.bold(text) : text;
}

export function bg(theme: Theme, key: string, text: string): string {
  const t = fallbackTheme(theme) as Theme & { bg?: (k: string, s: string) => string };
  return t.bg ? t.bg(key, text) : text;
}

export function component(lines: string[]): Component {
  return {
    render(width: number): string[] {
      return Number.isFinite(width) && width >= 0
        ? lines.map((line) => truncateToWidth(line, width))
        : lines;
    },
    invalidate() {},
  };
}

export function liveComponent(renderLines: (width: number) => string[]): Component {
  return {
    render(width: number): string[] {
      const lines = renderLines(width);
      return Number.isFinite(width) && width >= 0
        ? lines.map((line) => truncateToWidth(line, width))
        : lines;
    },
    invalidate() {},
  };
}

function stateOf(context?: ToolRenderContextLike): Record<string, unknown> {
  if (!context) return {};
  if (!context.state) context.state = {};
  return context.state;
}

function clearBlinkTimer(context?: ToolRenderContextLike): void {
  const state = stateOf(context);
  const timer = state[BLINK_TIMER_KEY] as ReturnType<typeof setInterval> | undefined;
  if (timer) clearInterval(timer);
  delete state[BLINK_TIMER_KEY];
  delete state[BLINK_FRAME_KEY];
}

function statusBullet(theme: Theme, context?: ToolRenderContextLike): string {
  const state = stateOf(context);

  if (context?.isPartial) {
    if (!state[BLINK_TIMER_KEY] && context.invalidate) {
      state[BLINK_FRAME_KEY] = false;
      const timer = setInterval(() => {
        state[BLINK_FRAME_KEY] = !state[BLINK_FRAME_KEY];
        context.invalidate?.();
      }, 500);
      timer.unref?.();
      state[BLINK_TIMER_KEY] = timer;
    }
    const blinkFrame = Boolean(state[BLINK_FRAME_KEY]);
    return fg(theme, blinkFrame ? "muted" : "toolTitle", BULLET);
  }

  clearBlinkTimer(context);

  const resultStatus = state[RESULT_STATUS_KEY] as FrameStatus | undefined;
  const isError = context?.isError || resultStatus === "error";
  return fg(theme, isError ? "error" : "success", BULLET);
}

export function markFrameStatus(context: ToolRenderContextLike | undefined, status: FrameStatus): void {
  const state = stateOf(context);
  state[RESULT_STATUS_KEY] = status;
}

export function semanticTruncate(value: string, max = 64): string {
  const chars = Array.from(value);
  if (chars.length <= max) return value;
  return `${chars.slice(0, Math.max(1, max - 1)).join("")}…`;
}

export function textContent(result: { content?: Array<{ type: string; text?: string }> } | undefined): string {
  const first = result?.content?.find((item) => item.type === "text" && typeof item.text === "string");
  return first?.text ?? "";
}

export function firstLine(text: string): string {
  return text.split("\n")[0] ?? "";
}

export function plural(count: number, singular: string, pluralText = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralText}`;
}

function expandKeyHint(): string {
  try {
    return (keyHint as (id: string, description?: string) => string)("app.tools.expand");
  } catch {
    return "ctrl+r to expand";
  }
}

export function collapseHead(
  body: string[],
  theme: Theme,
  expanded: boolean | undefined,
  cap = 15
): string[] {
  if (cap <= 0 || expanded || body.length <= cap) return cap <= 0 ? [] : body;
  const hidden = body.length - cap;
  return [
    ...body.slice(0, cap),
    fg(theme, "muted", `… +${hidden} ${hidden === 1 ? "line" : "lines"} (${expandKeyHint()})`),
  ];
}

export function renderFrameCall(
  theme: Theme,
  context: ToolRenderContextLike | undefined,
  verb: string,
  target?: string,
  reason?: string
): Component {
  return liveComponent(() => {
    const targetText = target ? `${fg(theme, "toolTitle", bold(theme, verb))}(${fg(theme, "accent", target)})` : fg(theme, "toolTitle", bold(theme, verb));
    const lines = [`${statusBullet(theme, context)} ${targetText}`];
    if (reason?.trim()) lines.push(`  ${fg(theme, "muted", INTENT)} ${fg(theme, "muted", reason.trim())}`);
    return lines;
  });
}

export function renderFrameResult(
  theme: Theme,
  context: ToolRenderContextLike | undefined,
  summary: string,
  body: string[] = [],
  options: { status?: FrameStatus; cap?: number } = {}
): Component {
  const status = options.status ?? "success";
  markFrameStatus(context, status);
  return liveComponent(() => {
    const connectorColor = status === "error" ? "error" : status === "warning" ? "warning" : "muted";
    const lines = [`  ${fg(theme, connectorColor, CONNECTOR)}  ${summary}`];
    for (const line of collapseHead(body, theme, context?.expanded, options.cap ?? 15)) {
      lines.push(`${BODY_INDENT}${line}`);
    }
    return lines;
  });
}

export function outputLines(theme: Theme, text: string): string[] {
  if (!text) return [];
  return text.split("\n").map((line) => fg(theme, "toolOutput", line));
}
