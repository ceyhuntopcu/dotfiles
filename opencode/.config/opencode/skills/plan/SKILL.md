---
name: plan
description: Plan-first mode — draft a plan, wait for explicit approval before touching anything, then track execution as a visible checklist. Use when the user wants to plan work before implementing it.
---

# Plan

## Drafting

Research/read as needed, then produce a plan: goal, the approach, ordered steps, and anything risky or uncertain. Do not write, edit, create, or delete any files, and do not run anything beyond read-only commands, while drafting or presenting the plan.

Present the plan and stop. Do not proceed on your own read of the plan looking reasonable — wait for the user to explicitly approve it (e.g. "yes", "approved", "go ahead", "start").

## After approval

The moment the plan is approved, write it to a checklist file at `./PLAN.md` in the current project (create it if missing) with one checkbox per step or phase:

```markdown
# <plan title>

- [ ] Step 1 — <short description>
- [ ] Step 2 — <short description>
...
```

Then execute step by step. After each step completes, check it off in `PLAN.md` immediately (`- [ ]` → `- [x]`) before moving to the next one — don't batch the updates to the end. If a step turns out to need sub-steps, expand it in place rather than silently absorbing the extra work into one checkbox.

If you hit something not covered by the plan, stop and ask before improvising — don't silently expand scope.

At the end, show the final `PLAN.md` state so the user can see everything that was done.
