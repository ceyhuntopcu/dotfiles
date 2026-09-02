export type WaitProgressStatus = "running" | "done" | "error";

/** Minimal read-only projection used by the blocked wait card. */
export interface WaitProgressSnapshot {
  readonly id: string;
  readonly title: string;
  readonly status: WaitProgressStatus;
  readonly backend: string;
  readonly modelLabel?: string;
  readonly tokens?: number;
  readonly contextWindow?: number;
  readonly createdAt: number;
  readonly settledAt?: number;
  readonly turns: number;
  readonly latestOutput?: string;
  readonly errorText?: string;
}

export interface WaitProgressDetails {
  readonly pending: readonly string[];
  readonly agents: ReadonlyArray<{
    readonly id: string;
    readonly status: WaitProgressStatus;
    readonly turns: number;
    readonly elapsedMs: number;
  }>;
}

export interface WaitProgress {
  readonly text: string;
  readonly details: WaitProgressDetails;
}

const PREVIEW_LIMIT = 180;

function formatElapsedAt(snapshot: WaitProgressSnapshot, now: number): string {
  const end = snapshot.settledAt ?? now;
  const seconds = Math.max(0, Math.round((end - snapshot.createdAt) / 1000));
  const minutes = Math.floor(seconds / 60);
  return minutes > 0 ? `${minutes}m${String(seconds % 60).padStart(2, "0")}s` : `${seconds}s`;
}

function formatContext(tokens: number | undefined, window: number | undefined): string {
  if (!Number.isFinite(window) || window === undefined || window <= 0) return "?%/?";
  const safeTokens = Number.isFinite(tokens) && tokens !== undefined ? Math.max(0, tokens) : undefined;
  const percent = safeTokens === undefined ? "?" : String(Math.round(Math.min(100, (safeTokens / window) * 100)));
  const windowText = window >= 1_000_000 ? `${(window / 1_000_000).toFixed(1).replace(".0", "")}M` : `${Math.round(window / 1000)}k`;
  return `${percent}%/${windowText}`;
}

function compactPreview(value: string | undefined): string | undefined {
  const normalized = value?.replace(/\s+/g, " ").trim();
  if (!normalized) return undefined;
  return normalized.length > PREVIEW_LIMIT ? `${normalized.slice(0, PREVIEW_LIMIT - 1)}…` : normalized;
}

function statusMarker(status: WaitProgressStatus): string {
  if (status === "running") return "●";
  if (status === "done") return "✓";
  return "✕";
}

/**
 * Render the live contents of a blocking wait: every awaited child stays
 * visible, including completed or failed children, so one slow child cannot
 * hide the fact that the rest have already settled.
 */
export function formatWaitProgress(
  snapshots: ReadonlyArray<WaitProgressSnapshot>,
  waitingSince: number,
  now = Date.now(),
): WaitProgress {
  const pending = snapshots.filter(snapshot => snapshot.status === "running");
  const waitSeconds = Math.max(0, Math.round((now - waitingSince) / 1000));
  const waitElapsed = waitSeconds >= 60
    ? `${Math.floor(waitSeconds / 60)}m${String(waitSeconds % 60).padStart(2, "0")}s`
    : `${waitSeconds}s`;
  const lines = [`Waiting for ${pending.length} of ${snapshots.length} subagents · ${waitElapsed}`];

  for (const snapshot of snapshots) {
    const model = snapshot.modelLabel?.replace(/^.*\//, "") ?? snapshot.backend;
    const meta = [
      model,
      formatContext(snapshot.tokens, snapshot.contextWindow),
      `${snapshot.turns} ${snapshot.turns === 1 ? "turn" : "turns"}`,
      formatElapsedAt(snapshot, now),
    ].join(" · ");
    lines.push("", `${statusMarker(snapshot.status)} ${snapshot.id} [${snapshot.status}] ${snapshot.title}`, `  ${meta}`);
    if (snapshot.errorText) lines.push(`  Error: ${snapshot.errorText}`);
    const preview = compactPreview(snapshot.latestOutput);
    if (preview) lines.push(`  Latest: ${preview}`);
    else if (snapshot.status === "running") lines.push("  Latest: (no text output yet)");
  }

  return {
    text: lines.join("\n"),
    details: {
      pending: pending.map(snapshot => snapshot.id),
      agents: snapshots.map(snapshot => ({
        id: snapshot.id,
        status: snapshot.status,
        turns: snapshot.turns,
        elapsedMs: Math.max(0, (snapshot.settledAt ?? now) - snapshot.createdAt),
      })),
    },
  };
}
