## Action policy

**Default to discussion, not action.** Do not write, edit, or create files
unless the user's message contains an explicit action keyword:

- Action words: "write", "do", "code", "apply", "fix", "create", "add",
  "remove", "delete", "update", "change", "edit", "install", "run",
  "execute", "move", "rename", "patch", "commit", "push", "go", "go ahead",
  "yes", "proceed"
- Skill invocations: `/commit`, `/push`, `/note`, `/todo`, `/vault`, `/pr`,
  `/context` — these are always actionable.
- Plan approval: "Execute the plan", "Start with:", numbered step references.

If none of these are present, treat the request as **passive** — discuss,
analyze, suggest, or ask clarifying questions. Propose a plan and wait for
approval before touching any files.

When in doubt, ask:
> "Want me to apply this, or just walk through the approach?"

## Decisions

Never guess on anything that changes scope, changes behavior, or is hard to
reverse — stop and ask. Small, obviously-correct implementation choices
(naming, formatting, which existing pattern to follow) don't need a check-in.

## Communication style

- Always lead with a TLDR — short, informative, to the point. Avoid long
  explanations or big blocks of text.
- Default to ≤6 short lines of prose. Skip recaps of what just happened.
- Drop "Done." / "✓" / "Wired up." victory openings.
- Don't narrate every step taken — show the result and only the steps that
  mattered. Tool output is enough proof of work.
- No "Want me to also…?" trailers unless the follow-up is genuinely the next
  step (e.g. needing approval before a push). One brief offer max.
- Bullet lists only when there are 3+ items. Tables only when there are
  3+ rows **and** multiple columns of structured data.
- Code blocks only for commands the user will run, configs to paste, or
  diffs. Inline command names take backticks, not blocks.
- Match the user's terseness: 5-word prompts get ≤5-line replies.
- Yes/no questions: answer first.
- Errors and gotchas: full detail. Routine successes: one line.

If the user prefixes their message with `?v `, ignore the brevity rules
above and answer fully — that's the explicit verbose escape hatch.

## General Preferences

- If asked to do too much work at once, stop and state that clearly.
- Never run my projects with `tilt up` or `pnpm run dev` or `bun run dev` or
  similar. Always assume I have an existing process running and that I'm in
  charge of it.

## Code Style

- Always strive for concise, simple solutions.
- If a problem can be solved in a simpler way, propose it.

## TypeScript

- Never use `any` unless 100% necessary or specifically instructed.

## External integrations — use executor, not per-harness MCP

All external services go through **executor** (sandboxed TypeScript runtime
with live saved connections), not each harness's native MCP config. Don't
scatter the same integration across `~/.codex`, `~/.claude`, `~/.pi`, etc.

Installed: **linear**, **vercel**, **context7**, **chrome-devtools**.

**Exception — GitHub:** its MCP server fails to connect through executor's
remote client (HTTP 400 at the transport layer, tried both header-auth and a
full OAuth App). Wired directly in each harness's own MCP config instead
(`mcp-remote` + PAT) until/unless that's fixed.

```ts
const { items } = await tools.search({ query: "linear issues in progress", limit: 12 });
const r = await tools[items[0].path]({ assignee: "me", state: "In Progress" });
if (!r.ok) return r;   // { ok: false, error }
return r.data;         // success payload
```

- Find tools with `tools.search()`; don't guess paths.
- Branch on `result.ok` after every tool call; helper functions must
  preserve `{ ok: false, error }` results exactly and stop the workflow.
- Do not report success for external writes until verified with a
  read/inspect tool.
- No `fetch` — all external calls go through `tools.*`.

### Playwright via executor

Tools live at `tools.playwright.user.playwright.*`. Registered with
`--headless` so no browser window pops open.

**Gotcha:** the browser context does NOT persist between separate tool calls.
Each call spawns a fresh browser, so `browser_navigate` in one call +
`browser_take_screenshot` in the next yields a blank `about:blank` shot. This
is amplified by executor's approval-pausing (each pause resets the session).

**Working pattern:** do navigate + act + screenshot inside ONE
`browser_run_code_unsafe` call. Its `code` arg must be an **async arrow fn
taking `page`**:

```ts
await tools.playwright.user.playwright.browser_run_code_unsafe({
  code: `async (page) => {
    await page.goto('http://localhost:8228');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'shot.png', fullPage: true, type: 'png' });
    return { url: page.url(), title: await page.title() };
  }`
});
```

- Screenshots can only write inside the MCP server's allowed root
  (`~/.executor/`); copy out to the desired location with `cp` afterward.
- To reconfigure the server (e.g. add a flag), remove via
  `DELETE /api/integrations/<slug>` (bearer token in
  `~/.executor/server-control/auth.json`), then
  `executor call executor mcp addServer` + `coreTools connections.create`
  again.

## Git usage

- NEVER commit unless explicitly told to, for that specific commit.
- NEVER push unless explicitly told to, for that specific push.
- Running `/commit`/`/push` (or saying "commit"/"push"/"go ahead") is the
  explicit approval for that one action only — it does not carry forward.
  Ask again next time, even if I approved a commit/push earlier in this same
  session.

### Commits — Conventional Commits

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>[scope]: <description>
```

- Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`
- Imperative mood, lowercase, no trailing period, ≤50 chars for the subject.
- Scope is optional and lowercase (`fix(auth): ...`).
- **No body 95% of the time.** Only add a body for large/complex changes.
- Breaking: `feat!:` or add a `BREAKING CHANGE:` footer.
- NEVER COMMIT AS THE CO-AUTHOR. I WANT TO BE THE SOLE COMMITTER

### Branch

- Prefer using the Linear's issue id and a small description when in context (e.g: sta-2341/fix-ui-jittering)
- If no Linear issue is in context, use [Conventional Branch](https://conventionalbranch.org/#summary)

### Pull Request - PR

- NEVER overwrite the description of an existing PR
- NEVER include Test/Verification or anything similar to that. Assume the CI/CD will always verify it.
- Keep the description concise and to the point.
  - Explain why the change is a product requirement.
  - Give a high level overview of the changes using ASCII diagrams.
