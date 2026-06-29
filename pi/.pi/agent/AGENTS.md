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
