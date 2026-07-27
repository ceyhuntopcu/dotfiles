#!/usr/bin/env bash
# Apply pi-powerline-footer customizations (layout + rounded borders only —
# no vim-mode wiring, no OneDark Pro color override).
#
# The pi-powerline-footer plugin lives inside its own npm package directory
# and gets wiped on `pi update` / package reinstall. Re-run this script
# afterwards, then restart pi.

set -euo pipefail

resolve_pkg() {
  local pkg="pi-powerline-footer"
  local candidate

  # This machine's actual pi-managed npm dir (confirmed location).
  candidate="${HOME}/.pi/agent/npm/node_modules/${pkg}"
  if [[ -d "$candidate" ]]; then
    printf '%s\n' "$candidate"
    return 0
  fi

  # Fallbacks, in case pi's npm layout changes.
  local resolved
  resolved="$(NODE_PATH="$(npm root -g 2>/dev/null || true)" node -e "try { console.log(require.resolve('${pkg}/package.json')); } catch (e) {}" 2>/dev/null || true)"
  if [[ -n "${resolved:-}" ]]; then
    dirname "$resolved"
    return 0
  fi

  for candidate in \
    "/opt/homebrew/lib/node_modules/${pkg}" \
    "/usr/local/lib/node_modules/${pkg}"; do
    if [[ -d "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  return 1
}

PKG="$(resolve_pkg || true)"
if [[ -z "${PKG:-}" || ! -d "$PKG" ]]; then
  echo "Cannot locate pi-powerline-footer. Is it installed?" >&2
  exit 1
fi

echo "→ Package: $PKG"

# ── 1. presets.ts — split the default top row into top/bottom groups ────────
python3 - "$PKG/presets.ts" <<'PY'
import sys
path = sys.argv[1]
src = open(path).read()

if "shell_mode\", \"path\", \"git\", \"context_pct" not in src and '"model", "thinking", "path"' in src:
    print("✓ presets.ts (already patched)")
    sys.exit(0)

old = '''  default: {
    leftSegments: ["model", "thinking", "shell_mode", "path", "git", "context_pct", "cache_read", "cost"],
    rightSegments: [],
    secondarySegments: ["extension_statuses"],
    separator: "powerline-thin",
    colors: DEFAULT_COLORS,
    segmentOptions: {
      model: { showThinkingLevel: false },
      path: { mode: "basename" },
      git: { showBranch: true, showStaged: true, showUnstaged: true, showUntracked: true },
    },
  },'''
new = '''  default: {
    leftSegments: ["model", "thinking", "path"],
    rightSegments: [],
    secondarySegments: ["shell_mode", "git", "context_pct", "cache_read", "cost"],
    separator: "powerline-thin",
    colors: DEFAULT_COLORS,
    segmentOptions: {
      model: { showThinkingLevel: false },
      path: { mode: "basename" },
      git: { showBranch: true, showStaged: true, showUnstaged: true, showUntracked: true },
    },
  },'''

if old not in src:
    print("presets.ts: needle not found (upstream changed?) — skipping", file=sys.stderr)
    sys.exit(1)

open(path, "w").write(src.replace(old, new, 1))
print("✓ presets.ts (default preset segments)")
PY

# ── 2. index.ts — independent top/bottom rows (no auto-promotion) ───────────
# Whitespace-tolerant: matches from the anchor comment to the function's
# closing return block by regex, instead of an exact-text needle, since this
# package's formatter leaves trailing spaces on otherwise-blank lines.
python3 - "$PKG/index.ts" <<'PY'
import re
import sys
path = sys.argv[1]
src = open(path).read()

if "[pi-config patch:independent-rows]" in src:
    print("✓ index.ts (independent-rows already patched)")
    sys.exit(0)

pattern = re.compile(
    r"  // Get all segments: primary first, then secondary\n"
    r".*?"
    r"  return \{\n"
    r"    topContent: buildContentFromParts\(topSegments, presetDef\),\n"
    r"    secondaryContent: buildContentFromParts\(secondarySegments, presetDef\),\n"
    r"  \};\n"
    r"\}",
    re.DOTALL,
)

new = '''  // [pi-config patch:independent-rows] Render primary and secondary rows
  // independently so secondary segments never get auto-promoted to the top
  // row on wide terminals — each row fits only its own configured segments.
  const mergedSegments = mergeSegmentsWithCustomItems(presetDef, config.customItems, {
    layout: config.layout,
    disabledSegments: config.disabledSegments,
  });
  const primaryIds = [...mergedSegments.leftSegments, ...mergedSegments.rightSegments];
  const secondaryIds = mergedSegments.secondarySegments;

  const baseOverhead = 2;
  const renderRow = (ids: typeof primaryIds): string[] => {
    const out: string[] = [];
    let used = baseOverhead;
    for (const segId of ids) {
      const { content, width, visible } = renderSegmentWithWidth(segId, ctx);
      if (!visible) continue;
      const needed = width + (out.length > 0 ? sepWidth : 0);
      if (used + needed <= availableWidth) {
        out.push(content);
        used += needed;
      }
    }
    return out;
  };

  const topSegments = renderRow(primaryIds);
  const secondarySegments = renderRow(secondaryIds);

  return {
    topContent: buildContentFromParts(topSegments, presetDef),
    secondaryContent: buildContentFromParts(secondarySegments, presetDef),
  };
}'''

if not pattern.search(src):
    print("index.ts: independent-rows anchor/end not found (upstream changed?) — skipping", file=sys.stderr)
    sys.exit(1)

open(path, "w").write(pattern.sub(new, src, count=1))
print("✓ index.ts (independent-rows)")
PY

# ── 3. index.ts — rounded corners on the top/secondary status rows ──────────
python3 - "$PKG/index.ts" <<'PY'
import sys
path = sys.argv[1]
src = open(path).read()

if "[pi-config patch:rounded-powerline]" in src:
    print("✓ index.ts (rounded-powerline already patched)")
    sys.exit(0)

old = '''  function renderPowerlinePrimaryLines(width: number, theme: Theme): string[] {
    if (!currentCtx) return [];

    const layout = getResponsiveLayout(width, theme);
    return layout.topContent ? [layout.topContent] : [];
  }

  function renderPowerlineSecondaryLines(width: number, theme: Theme): string[] {
    if (!currentCtx) return [];

    const layout = getResponsiveLayout(width, theme);
    return layout.secondaryContent ? [layout.secondaryContent] : [];
  }'''

new = '''  // [pi-config patch:rounded-powerline]
  function renderPowerlinePrimaryLines(width: number, theme: Theme): string[] {
    if (!currentCtx) return [];

    const layout = getResponsiveLayout(width, theme);
    if (!layout.topContent) return [];
    const border = (s: string) => theme.fg("borderMuted", s);
    const inner = layout.topContent;
    const innerW = visibleWidth(inner);
    const fill = Math.max(0, width - innerW - 2);
    return [border("╭") + inner + border("─".repeat(fill) + "╮")];
  }

  function renderPowerlineSecondaryLines(width: number, theme: Theme): string[] {
    if (!currentCtx) return [];

    const layout = getResponsiveLayout(width, theme);
    if (!layout.secondaryContent) return [];
    const border = (s: string) => theme.fg("borderMuted", s);
    const inner = layout.secondaryContent;
    const innerW = visibleWidth(inner);
    const fill = Math.max(0, width - innerW - 2);
    return [border("╰") + inner + border("─".repeat(fill) + "╯")];
  }'''

if old not in src:
    print("index.ts: rounded-powerline needle not found (upstream changed?) — skipping", file=sys.stderr)
    sys.exit(1)

open(path, "w").write(src.replace(old, new, 1))
print("✓ index.ts (rounded-powerline)")
PY

# ── 4. index.ts editorFactory — blank its own border lines (rounded rows are the box now) ─
python3 - "$PKG/index.ts" <<'PY'
import sys
path = sys.argv[1]
src = open(path).read()

if "[pi-config patch:no-editor-lines]" in src:
    print("✓ index.ts (no-editor-lines already patched)")
    sys.exit(0)

old = '''        const result: string[] = [];
        result.push(" " + bc("─".repeat(width - 2)));

        for (let i = 1; i < bottomBorderIndex; i++) {
          const prefix = i === 1 ? promptPrefix : contPrefix;
          result.push(`${prefix}${lines[i] || ""}`);
        }

        if (bottomBorderIndex === 1) {
          result.push(`${promptPrefix}${" ".repeat(contentWidth)}`);
        }

        result.push(" " + bc("─".repeat(width - 2)));'''

new = '''        const result: string[] = [];
        // [pi-config patch:no-editor-lines] suppressed — rounded powerline
        // borders (top/secondary rows) are the box edges now.
        result.push(" ".repeat(width));

        for (let i = 1; i < bottomBorderIndex; i++) {
          const prefix = i === 1 ? promptPrefix : contPrefix;
          result.push(`${prefix}${lines[i] || ""}`);
        }

        if (bottomBorderIndex === 1) {
          result.push(`${promptPrefix}${" ".repeat(contentWidth)}`);
        }

        result.push(" ".repeat(width));'''

if old not in src:
    print("index.ts: no-editor-lines needle not found (upstream changed?) — skipping", file=sys.stderr)
    sys.exit(1)

open(path, "w").write(src.replace(old, new, 1))
print("✓ index.ts (no-editor-lines)")
PY

echo "Done. Restart pi (Ctrl+D then pi) to pick up the changes."
