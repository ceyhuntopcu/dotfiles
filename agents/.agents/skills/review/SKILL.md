---
name: review
description: Review local git changes with conventional comments. Works with staged or unstaged changes via git diff.
---

# Review local changes

Review the user's local git changes and leave feedback using the Conventional Comments format.

## Steps

1. Decide what to review:
   - If there are staged changes (`git diff --cached`), review those.
   - Otherwise review unstaged changes (`git diff`).
   - If both are empty, say there's nothing to review and stop.
2. Read the diff, opening surrounding context of changed files when needed to judge correctness.
3. Leave feedback as Conventional Comments — one per point, each prefixed with a label:
   - `praise:` something done well
   - `nitpick:` minor, non-blocking (style/naming)
   - `suggestion:` a concrete improvement
   - `issue:` a bug or correctness problem
   - `question:` something unclear
   - `todo:` a small required change

   Add `(blocking)` or `(non-blocking)` when it clarifies severity.
4. Anchor each comment to a `file:line`.
5. End with a short summary: overall assessment plus the few most important items to address.

Focus on correctness, clarity, and consistency with the surrounding code. Be specific and concrete — point to the handful of changes that actually matter rather than rewriting everything.
