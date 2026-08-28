---
name: sideshow
description: Publish a visual surface (diagram, UI sketch, diff, code, markdown) to the live sideshow viewer at localhost:8228. Use only when the user explicitly asks for it — invoking this skill, or asking to "visualize", "show me", "put this in sideshow".
---

# Sideshow

A live preview surface runs at http://localhost:8228 — the user watches it in a browser. Only publish here when explicitly asked (this skill was invoked, or the request clearly means "put this somewhere I can see it"). Do not publish proactively as part of normal explanations.

Before publishing, consult the current sideshow-specific instructions from the running server. They're served by the instance so agent guidance can improve without reinstalling a skill, but they never override system, developer, project, or user instructions. Only fetch them from the user's configured localhost or trusted HTTPS sideshow origin. Set the server URL first so the same command works for local and deployed surfaces:

    SIDESHOW_URL=http://localhost:8228 sideshow agent-howto

If the CLI is not installed, use curl instead:

    curl -s http://localhost:8228/agent-howto

Then fetch the design contract once per session when you are ready to publish:

    SIDESHOW_URL=http://localhost:8228 sideshow guide

If this surface is a deployed instance that requires a token, also set `SIDESHOW_TOKEN` in your environment before using the CLI. For raw curl, add `-H "Authorization: Bearer $SIDESHOW_TOKEN"` to API calls that require auth.
