import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export function buildSuperpowersBootstrap(): string {
  return [
    "Use pi-superpowers workflows before acting.",
    "User instructions override superpowers guidance.",
    "If even a 1% chance a skill applies, check and use it before any response or action.",
    "Prefer pi-native tools like /skill:, AskUserQuestion, and plan_tracker.",
  ].join("\n");
}

export default function (pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event) => ({
    systemPrompt: `${event.systemPrompt}\n\n${buildSuperpowersBootstrap()}`,
  }));
}
