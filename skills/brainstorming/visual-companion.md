# Visual Companion Guide

Pi-native visual brainstorming companion for showing mockups, diagrams, and options inside question flows.

## When to Use

Decide per-question, not per-session. The test: **would the user understand this better by seeing it than reading it?**

**Use visual previews** when the content itself is visual:
- UI mockups and wireframes
- architecture diagrams and relationship maps
- side-by-side layout comparisons
- design polish questions
- spatial relationships and flows

**Use plain chat** when the content is text or tabular:
- requirements and scope questions
- conceptual choices described in words
- tradeoff lists
- technical decisions
- clarifying questions

A question about a UI topic is not automatically a visual question. "Which wizard layout feels better?" is visual. "What should the wizard collect?" is conceptual.

## Default pi-native mechanism

Use `AskUserQuestion` with `preview` for single-select visual comparisons.

```ts
AskUserQuestion({
  questions: [{
    question: "Which layout works better?",
    header: "Layout",
    multiSelect: false,
    options: [
      {
        label: "Option A",
        description: "Single-column",
        preview: "```md\n[wireframe]\n```"
      },
      {
        label: "Option B",
        description: "Sidebar",
        preview: "```md\n[wireframe]\n```"
      }
    ]
  }]
})
```

## Recommended patterns

### Side-by-side layout choice
- Use a single-select `AskUserQuestion`
- Keep options to 2-4
- Put the recommended option first
- Use `preview` to show the competing layouts

### Visual A/B iteration
- Show a first comparison with previews
- After user feedback, generate a revised preview and ask the next question
- Keep each preview focused on one decision

### Mixed visual + textual flow
- Use visual preview for the layout or diagram itself
- Return to plain chat for scope, tradeoffs, and constraints
- Do not force every question into preview mode

## Preview authoring tips

- Keep previews simple and readable on narrow terminals and mobile-linked viewers
- Prefer wireframes and structural diagrams over pixel-perfect art
- Label each option clearly
- Show only the part of the design relevant to the decision
- Use markdown fences inside `preview` so the comparison renders cleanly

## Example flow

1. Ask if visual help would be useful.
2. Present a preview-based comparison for the specific visual question.
3. Let the user choose or provide feedback.
4. Either iterate visually or switch back to text discussion.

## Red Flags

**Never:**
- Use previews for purely textual or conceptual questions
- Overload one preview with too many unrelated decisions
- Depend on external browser servers or harness-specific shell launchers
- Hide tradeoffs that are better explained in text

**Always:**
- Use previews only when they genuinely improve understanding
- Keep the question focused
- Prefer pi-native `AskUserQuestion` flows
- Return to plain chat when visuals stop helping
