
- need something for the user to start brainstorming, deciding and creating a new slice/plan, something like `/project:new:slice <request>` that interactively, together with the LLM/Agent, captures what the user want and the best strategy, etc with research and decicions on success criteria, what done means, etc.
- `project.jsonc` allows defining a single sequence of knots but we should allow (and ship defaults) named sequences for different use cases like for example:
```jsonc
{
  "strands": {
    "quick": {
      "description": "Quick strand for simple, scoped or smaller work with knots Prototype->Realization->Finalization",
      "knots": [
        {
          "name": "Prototype",
          "focus": "Pre work phase where we start by online and local research and intel gathering to be able to decide how to do it, maybe building quick prototypes for different approaches and benchmarking them to be able to ground our decicion how to go ahead and build the final prototype."
        },
        {
          "name": "Realization",
          "focus": "Based on the `Prototype` knot's data, decicions, observations, user feedback and outcome, we build the final implementation of the feature/change including required tests, ready for finalization to be submitted for review"
        },
        {
          "name": "Finalization",
          "focus": "Validation, Review and Polishing to finalize the strand"
        }
      ]
    }, // end quick
    "granular": {
      "description": "Granular strand for more complex or large scope work with knots PoW->Alpha->Beta->Gamma->Rc1->Rc2->Release"
      "knots": [
        {
          "name": "Proof-of-Work",
          "focus": "Quick experiment/proof of work: provde the approach and establish design, API, patterns, layout, and decicions for later knots."
        },
        {
          "name": "Alpha",
          "focus": "First real, integrated implementation",
        },
        {
          "name": "Beta",
          "focus": "Ready to show someone else",
        },
        {
          "name": "Gamma",
          "focus": "Staging-ready, all core features",
        },
        {
          "name": "RC1",
          "focus": "Feature complete, polishing",
        },
        {
          "name": "RC2",
          "focus": "Early-adopter ready",
        },
        {
          "name": "Release",
          "focus": "Production confident",
        },
      ]
    }, // end granular
  }
}
```
  Maybe we should also add with this change a new user command `/project:new:strand <request>` which starts an interactive, LLM/Agent driven, workflow to design and add a new custom strand to the project.
  When the user requests a new feature/slice/change the Agent/LLM drives a structured interactive workflow based on the users request to identify requirements, constraints, scope, complexity, etc and based on this will use the ask_user_question tool to let the user choose which strand to use for it (with previews per strand, recommondation and pro's and con's).