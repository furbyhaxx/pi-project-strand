
# Completed

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



# Open

## Bugs

### Parallel Tool Calls corrupt our files:

> ✅ Fixed in v0.5.0 — `project_strand` now serializes the read-modify-write via `withFileMutationQueue` and writes through per-write unique temp files. (If other tools that write shared files in parallel are found, apply the same pattern.)

````
ask_user_question 1 question (Strands)
 ✓ Which of these strands should I design and write into .pi/project.jsonc? → integration, automation,
 change, spike


 All four. Writing them now.


 project_strand
 Defined strand "integration" with 5 knot(s): Survey → Fork & Patch → Build → Device-Validate → Document.
 Written to /Projects/furbyhaxx/grapheneos-pixel-10a/.pi/project.jsonc. It is now available to
 /project:new:slice.



 project_strand
 ENOENT: no such file or directory, rename
 '/Projects/furbyhaxx/grapheneos-pixel-10a/.pi/project.jsonc.tmp' ->
 '/Projects/furbyhaxx/grapheneos-pixel-10a/.pi/project.jsonc'


 The automation test hit a file rename race condition from running parallel writes, so I need to execute
 those sequentially instead and then move on to testing the change and spike.

 The parallel writes collided on the temp file. Retrying sequentially.


 project_strand
 Error: strand "automation" already exists


 So the automation actually did get written despite the ENOENT error—the rename operation just failed
 partway through. Let me verify what's in the file.

 It actually wrote despite the error. Let me verify file state before continuing.


 file_read
 {
   "strands": {
     "DeepResearch": {
       "description": "Use for substantial research slices where a broad question/topic must be scoped,
 source material gathered, deeply analyzed, synthesized, and finalized into reproducible artifacts under
 docs/research/{topic-or-scope}/.",
       "knots": [
         {
           "name": "Preparation",
           "focus": "Broad source scouting and scope shaping: collect high-value sources, record decision
 points/rule-outs, and prepare docs/research/{topic-or-scope}/ for targeted analysis."
         },
         {
           "name": "DeepResearch",
           "focus": "Targeted deep analysis of the selected sources: extract evidence, compare claims,
 and preserve traceable notes/materials under docs/research/{topic-or-scope}/."
         },
         {
           "name": "Synthesis",
           "focus": "Aggregate research outputs into the actually relevant findings: reconcile conflicts,
 separate evidence from interpretation, and identify what matters for the chosen scope."
         },
         {
           "name": "Finalization",
           "focus": "Produce the final question answer/fact extraction/report package with citations,
 reproducibility notes, and a clear artifact index for docs/research/{topic-or-scope}/."
         }
       ]
     },
     "quick": {
       "description": "Use for small, well-scoped slices that only need a compact path from proof to
 implementation to wrap-up.",
       "knots": [
         {
           "name": "Prototype",
           "focus": "Establish a minimal, observable proof of the slice direction and de-risk the core
 approach."
         },
         {
           "name": "Realization",
           "focus": "Implement the slice completely enough to satisfy its success criteria with real
 behavior, not placeholders."
         },
         {
           "name": "Finalization",
           "focus": "Verify, document, clean up, and prepare the slice for sign-off."
         }
       ]
     },
     "granular": {
       "description": "Use for complex or high-risk slices that benefit from multiple quality gates
 before release.",
       "knots": [
         {
           "name": "Proof-of-Work",
           "focus": "Demonstrate feasibility, identify constraints, and prove the core work can be done."
         },
         {
           "name": "Alpha",
           "focus": "Build the first functional implementation covering the main path with known gaps
 explicitly tracked."
         },
         {
           "name": "Beta",
           "focus": "Harden behavior, cover important edge cases, and validate against realistic usage."
         },
         {
           "name": "Gamma",
           "focus": "Stabilize the slice, resolve remaining major issues, and prepare release-candidate
 quality."
         },
         {
           "name": "RC1",
           "focus": "Run release-candidate validation, catch regressions, and verify readiness against
 success criteria."
         },
         {
           "name": "RC2",
           "focus": "Perform final regression checks and polish after RC1 fixes with no known critical
 blockers."
         },
         {
           "name": "Release",
           "focus": "Finalize documentation, evidence, cleanup, and sign-off for production-ready
 completion."
         }
       ]
     },
     "automation": {
       "description": "Use for building reproducible build/CI/release automation pipelines, the project's
 long-term end goal.",
       "knots": [
         {
           "name": "Design",
           "focus": "Design the pipeline: inputs, stages, artifacts, triggers, secrets, and
 reproducibility/idempotency requirements."
         },
         {
           "name": "Implement",
           "focus": "Implement the scripts/workflows for the full pipeline with real steps, not
 placeholders."
         },
         {
           "name": "Dry-Run",
           "focus": "Execute an end-to-end dry-run/test pass and confirm artifacts are produced as
 designed."
         },
         {
           "name": "Harden",
           "focus": "Harden for failure modes: retries, caching, error handling, secret hygiene, and
 reproducibility across runs."
         },
         {
           "name": "Document",
           "focus": "Document operation, recovery, and maintenance of the pipeline with evidence of a
 successful run."
         }
       ]
     }
   }
 }          "focus": "Document the patch set, build steps, update strategy, and validation evidence for
 reproducibility."
         }
       ]
     }
   }
 }


 I see the JSON file got corrupted during a write operation — the integration strand was lost entirely,
 and there's trailing garbage text after the closing braces that's breaking the file's validity. I need
 to identify where the valid JSON actually ends and clean up that leftover content.

 The best approach is to rewrite the entire file from scratch with all the strands properly included —
 DeepResearch, quick, granular, automation, integration, change, and spike — so I can ensure everything
 is valid and complete without any collision issues.

 The parallel collision corrupted the file — integration got clobbered and there's trailing garbage 
 making it invalid JSON. I'll rewrite the whole file cleanly with all strands, adding integration, 
 change, and spike.

```