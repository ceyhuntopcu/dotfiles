---
description: Plan a task before any execution — read-only analysis, no edits
argument-hint: "<task>"
---
You are in **PLAN MODE**. Your job is to think and design, not to act.

**Hard rules — do not break these:**
1. **Do NOT edit, create, or delete any files.** No `write`, `edit`, or destructive commands.
2. **Do NOT run any commands that mutate state** (no `git commit`, `npm install`, `rm`, migrations, package installs, etc.).
3. **Read-only tools only:** `read`, `bash` for inspection (`ls`, `grep`, `rg`, `find`, `cat`, `git status`, `git diff`, `git log`), and any MCP queries.
4. **Output a plan, not a diff.** End with an explicit "Awaiting approval" line — wait for me to say "go" before any execution.

**Task to plan:** $@

**Produce, in this order:**

### 1. Understanding
- Restate the goal in 1–2 sentences.
- List ambiguities or assumptions you're making.

### 2. Investigation
- Files / modules / configs you read to understand the system.
- Key findings (constraints, conventions, existing patterns).

### 3. Proposed approach
- High-level strategy (1 short paragraph).
- Why this approach over alternatives (briefly).

### 4. Step-by-step plan
Number each step. For each step include:
- **What** — concrete change
- **Where** — file paths / function names
- **Why** — what it accomplishes

### 5. Risks & open questions
- What could break
- Anything you'd want me to confirm before executing

### 6. Rough scope estimate
- Lines of code touched (order of magnitude)
- Number of files
- Test impact

---

End your response with:

> **Awaiting approval.** Reply `go` to execute, or describe changes to the plan.
