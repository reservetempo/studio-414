---
description: Add items to the plan, then work through it with subagents
argument-hint: [things to add to the plan]
---

Run the plan workflow. Follow the rules in `CLAUDE.md` throughout, including the 150k-token context budget for you and for every subagent.

Things to add to the plan (may be empty): $ARGUMENTS

1. Read `.claude/plan.md`.
2. If there are things to add:
   - Split them into tasks: one per separate change, and split anything big (for example by layer) so each task fits a subagent well under 150k tokens.
   - Work out what's unclear for each task. To find out what's there, use a quick targeted grep, or a read-only `Explore` subagent asked for a short summary. Don't read whole files.
   - Ask all the questions with AskUserQuestion (up to 4 per call, more rounds if needed) before adding anything to the plan.
   - Add the tasks to "Next" with the answers written in, each one ready to hand to a subagent as is. Commit and push the plan on its own, as CLAUDE.md describes.
3. If there's nothing to add, go straight to step 4.
4. Work through "Next" in order, one subagent per task (`general-purpose` unless a more specific agent fits), one at a time. Run tasks in parallel only when they're independent and touch different files. Each prompt is self-contained and includes:
   - the goal, the files involved, the constraints and the user's answers;
   - what "done" looks like;
   - the finishing steps from "Push each task as soon as it is complete" in CLAUDE.md;
   - the context-budget rules: read only the parts of files needed, avoid needless screenshots, and if the task turns out bigger than expected, stop at a sensible point, push what's finished and report what's left;
   - the report format: commit hash, one-line summary, and anything the user must do or decide.
5. After each report, check it briefly with `git log -1 --stat <hash>`. Move the task to "Done" with its hash and one-line summary, add any leftover work the subagent reported to "Next" as a new task, then commit and push the plan before starting the next subagent. If a subagent failed, couldn't push, or hit a question only the user can answer, stop: note it in the plan, commit and push the plan, and tell the user.
6. When "Next" is empty, or when stopping, make sure the plan is committed and pushed, then tell the user what was pushed (hashes and summaries) and what's left.
7. If your context is getting close to 150k tokens, stop after the current task, save the plan (step 6), and tell the user to `/clear` and run `/z` to carry on.
