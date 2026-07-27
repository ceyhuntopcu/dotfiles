# Global Instructions

These rules apply to **every session, every project, every mode, every model**. They override defaults but do not override explicit per-project `AGENTS.md` rules that contradict them.

## 🔒 Git safety — never commit or push without explicit permission

**Forbidden unless I explicitly tell you to do so in the current turn:**

- `git commit` (and any variant: `--amend`, `-m`, `commit -a`, etc.)
- `git push` (and any variant: `--force`, `-u`, tags, etc.)
- `git tag` that creates a tag
- `git merge` / `git rebase` that produces a commit
- `git reset --hard` on anything that has commits I might lose
- `git stash drop` / `stash clear`
- Anything that rewrites history: `git filter-branch`, `git rebase -i`, `git reflog expire`, etc.
- Force-deleting branches with unmerged work (`git branch -D`)

**Allowed freely (read-only / non-destructive):**

- `git status`, `git diff`, `git log`, `git show`, `git blame`, `git branch` (list), `git remote -v`
- `git add` / `git restore` / `git checkout <file>` — staging is fine; just don't commit
- Creating new branches (`git checkout -b`, `git branch <name>`) — branches are cheap and reversible

**Explicit means explicit.** Phrases like "commit this", "push it", "make a PR" in *this* message count. A general goal like "fix the bug" does **not** authorize a commit at the end — finish, summarize what changed, and stop.

When in doubt, **stage the changes, summarize the diff, and ask before committing**.

## ✅ What to do instead of committing

After making changes:

1. Show me a summary of what files changed and why.
2. Optionally `git add` the relevant files.
3. Stop. Wait for my next instruction.
4. If I say "commit it" — then write a conventional-commit message and commit.
5. If I say "push" — then push.

## 🚫 Other destructive commands — same rule

Apply the same "ask first" principle to anything irreversible on shared state:

- `npm publish` / `pnpm publish` / `yarn publish` / `cargo publish`
- `rm -rf` outside of `node_modules`, `dist`, `.next`, `build`, `target`, or other clearly-derived directories
- Database migrations against non-local DBs
- `kubectl apply`, `terraform apply`, `aws ...`, deployments
- Sending emails / messages via APIs
- Anything that costs money or affects other people

Local-only destructive commands (e.g. `rm node_modules`, `docker system prune`) are fine.

## 💬 Communication style

- Be concise. Skip preamble.
- Show file paths clearly when discussing code.
- When you finish a task, end with a short summary of what changed — not a victory lap.

## 🧵 Subagent delegation — divide and conquer automatically

Proactively use `subagent_spawn` for this **without waiting for me to ask** whenever a task has multiple genuinely independent parts that can be explored/researched/reviewed separately — e.g. "understand how X's backend works" (split by layer: schema, API routes, services, frontend), "research these N libraries," "check what changed across these M unrelated modules."

- Default harness: `pi`, model: Kimi 2.7 Code (`fireworks/accounts/fireworks/models/kimi-k2p7-code`) — cheap and fast for exploration/research legwork. Only reach for the `claude`/`codex` harnesses when the task specifically calls for that model's judgment, not by default.
- Give each subagent a fully self-contained prompt (exact paths/context it needs) — it cannot see this conversation.
- Max 4 concurrent — if there are more independent parts than that, batch them.
- Wait for all of them, then synthesize their findings into one coherent answer for me — don't just paste their raw output back.
- Skip all of this for small/fast tasks (e.g. checking 2-3 small files) — spawning and waiting on subagents costs more than just doing it directly in a few seconds.

### Specific patterns to apply automatically

- **PR/diff review**: for a review covering multiple changed files or packages, spawn one Kimi subagent per file/package to flag issues in its slice, then synthesize into one review — don't review a large diff top-to-bottom yourself.
- **Cross-package research**: when a question spans multiple packages (e.g. `packages/db` + `packages/schemas` + `apps/web`), split exploration by package instead of reading across all of them yourself.
- **Debugging with multiple hypotheses**: when a bug has 2+ plausible root causes, spawn one subagent per hypothesis to investigate and rule in/out in parallel, rather than chasing one theory at a time.
- **Refactor blast-radius check**: before a large rename/API/schema change, spawn subagents to check different call-sites/consumers across the codebase for what would break.
- **Researching external libraries**: when comparing/evaluating multiple unrelated libraries or dependencies, spawn one subagent per library.

### Cross-model verification

After finishing significant work (a real implementation, a design decision, anything security- or correctness-sensitive — not small edits), spawn **one verification subagent using a different model family than whatever did the primary work**, and have it critique/check the result before treating it as final:

- Primary work was done by Claude (Fable, via `claude` harness or `anthropic` provider) → verify with the `codex` harness (GPT).
- Primary work was done by GPT/Codex (`codex` harness or `openai-codex` provider) → verify with the `claude` harness (Fable).
- Primary work was done by anything else (Kimi, GLM, DeepSeek via Fireworks) → verify with either the `claude` or `codex` harness — pick one.

Report the verifier's findings to me plainly — don't silently "fix" disagreements yourself. If the verifier flags something, tell me what it flagged and what you did about it.

## 🧠 Persistent memory

This section is your long-term memory — it is loaded into your context every session. Use it so I don't have to repeat myself across sessions.

- **When you learn something durable** about me, my preferences, my projects, my tools, or how I like to work, append it as a concise bullet under "Remembered facts" (one fact per line). Do this proactively when I state a preference or correct you — you don't need to ask permission to remember.
- **Act on these facts automatically** — they're already in your context at the start of every session; don't wait to be reminded.
- **Keep it curated, not a log**: edit or delete bullets that become outdated or wrong. Only durable, cross-session facts belong here — never one-off task details.
- This file is version-controlled, so your edits persist and are safe.

### Remembered facts

- My name is Ceyhun (ceyhun@planned.com); I work on **Planned**, an event-management platform in a pnpm monorepo.
- My CLI stack: **Claude Code** is my batteries-included daily driver; **Pi** is my tool for **Kimi** (fast/cheap model via Fireworks).
- <!-- append new facts below this line -->

