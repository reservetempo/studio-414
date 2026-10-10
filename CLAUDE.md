# Studio 414: working rules

## Delegate every task to a subagent

- The main session only plans, delegates and reviews. It does not edit project files itself. The one exception is the plan (see "The plan").
- Each task goes to its own subagent, started with the Agent tool (`general-purpose` unless a more specific agent fits).
- Write each subagent prompt so it stands on its own: the goal, the files involved, any constraints, and what "done" looks like. The subagent can't see this conversation.
- Independent tasks can run in parallel, but only when they touch different files. Tasks that touch the same files run one after another.
- If a request covers several separate changes, split it into several tasks, one subagent each.

## Context budget (150k tokens)

- Subagents are there to keep the main session's context small while it manages each step. Each task is scoped so the subagent's context stays small too. The main session and every subagent must stay under 150k tokens.
- The main session doesn't read whole files or dump long output. It uses short, targeted reads and greps only to plan, ask questions and review, and relies on the subagents' short reports.
- If the main session gets close to the limit, it stops after the current task, makes sure the plan is saved, and tells the user to `/clear` and run `/z` to carry on.
- A task must be finishable comfortably under 150k tokens: one feature or one layer (for example the back end separately from the front end), touching a handful of files. Bigger requests are split into several tasks in the plan before anything is delegated.
- Subagent prompts give file paths and the facts that matter, not pasted file contents.
- Subagents read only the parts of files they need (grep first, then partial reads), avoid needless screenshots, and keep their report short: the commit hash, a one-line summary, and anything the user must do or decide.
- If a subagent finds its task is bigger than expected, it stops at a sensible point, pushes what's finished, and reports what's left, so the main session can add it to the plan as a new task.

## The plan

- The plan lives in `.claude/plan.md`: tasks in order under "Next", finished ones under "Done" with their commit hash. Each task is written so it can be handed to a subagent as is.
- Before a task is added, any question needed to complete it is asked (AskUserQuestion), and the answers are written into the task.
- Only the main session edits the plan. Subagents don't touch it.
- The main session commits and pushes the plan on its own, never in a task's commit: `git commit -m "Update plan" .claude/plan.md`, then `git pull --rebase origin main` and `git push origin main`. It does this straight after each change and before starting the next subagent, because a subagent's `git pull --rebase` fails while the plan has uncommitted changes. When tasks run in parallel, it updates the plan once the whole batch has reported.
- `/z <things to add>` adds them to the plan (asking questions first) and then works through it. `/z` on its own works through the next tasks.

## Push each task as soon as it is complete

Every subagent finishes its task like this:

1. Check the change works. For anything visible on the site, preview it with the `studio-414` launch config and look at the part that changed.
2. Stage only the files this task changed (`git add <paths>`, never `git add -A` or `git add .`), so work from other tasks running at the same time isn't picked up.
3. Commit with a short message in the imperative mood that describes the change (for example "Add dark mode toggle to switcher").
4. Run `git pull --rebase origin main`, then `git push origin main`.
5. Report back the commit hash, a one-line summary, and anything the user must do or decide.

- One task gives one commit and one push. Don't batch several tasks into one push.
- Work goes straight to `main`, as earlier commits did.
- If a push fails (for example a rebase conflict), the subagent stops and reports the problem. It does not force-push.
- The main session reads each report, moves the task to "Done" in the plan, and tells the user what was pushed.
