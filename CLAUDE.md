# Studio 414: working rules

## Delegate every task to a subagent

- The main session only plans, delegates and reviews. It does not edit project files itself.
- Each task the user asks for goes to its own subagent, started with the Agent tool (`general-purpose` unless a more specific agent fits).
- Write each subagent prompt so it stands on its own: the goal, the files involved, any constraints, and what "done" looks like. The subagent can't see this conversation.
- Independent tasks can run in parallel, but only when they touch different files. Tasks that touch the same files run one after another.
- If a request covers several separate changes, split it into several tasks, one subagent each.

## Push each task as soon as it is complete

Every subagent finishes its task like this:

1. Check the change works. For anything visible on the site, preview it with the `studio-414` launch config and look at it.
2. Stage only the files this task changed (`git add <paths>`, never `git add -A` or `git add .`), so work from other tasks running at the same time isn't picked up.
3. Commit with a short message in the imperative mood that describes the change (for example "Add dark mode toggle to switcher").
4. Run `git pull --rebase origin main`, then `git push origin main`.
5. Report back the commit hash and a one-line summary.

- One task gives one commit and one push. Don't batch several tasks into one push.
- Work goes straight to `main`, as earlier commits did.
- If a push fails (for example a rebase conflict), the subagent stops and reports the problem. It does not force-push.
- The main session reads each subagent's report and tells the user what was pushed.
