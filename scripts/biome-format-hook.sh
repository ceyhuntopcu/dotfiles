#!/usr/bin/env bash
# Format-on-edit hook, shared by Claude Code and Codex PostToolUse.
#
# Reads the hook's JSON event on stdin and formats edited files with the
# project's own Biome — but ONLY inside a repo that actually has a biome
# config, so it stays a no-op in non-Biome projects.
#
# - Claude Code (Edit/Write/MultiEdit) provides tool_input.file_path -> format
#   just that file (precise).
# - Codex (apply_patch) has no file_path in tool_input, so fall back to
#   formatting the Biome-relevant files git reports as modified in the repo.
set -uo pipefail

input=$(cat)
file=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty' 2>/dev/null)
cwd=$(printf '%s' "$input" | jq -r '.cwd // empty' 2>/dev/null)

biome_root() {
  # echo the nearest ancestor dir (of $1) containing a biome config, else nothing
  local d=$1
  while [ -n "$d" ] && [ "$d" != "/" ]; do
    if [ -f "$d/biome.json" ] || [ -f "$d/biome.jsonc" ]; then
      printf '%s' "$d"
      return 0
    fi
    d=$(dirname "$d")
  done
  return 1
}

is_formattable() {
  case "$1" in
    *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs|*.json|*.jsonc|*.css) return 0 ;;
    *) return 1 ;;
  esac
}

# Precise path (Claude Code).
if [ -n "$file" ]; then
  is_formattable "$file" || exit 0
  root=$(biome_root "$(dirname "$file")") || exit 0
  ( cd "$root" && npx --no-install @biomejs/biome format --write "$file" ) >/dev/null 2>&1 || true
  exit 0
fi

# Fallback (Codex apply_patch): format modified Biome-relevant files in the repo.
[ -n "$cwd" ] || exit 0
root=$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null) || exit 0
{ [ -f "$root/biome.json" ] || [ -f "$root/biome.jsonc" ]; } || exit 0
files=$(git -C "$root" diff --name-only --diff-filter=ACM -- \
  '*.ts' '*.tsx' '*.js' '*.jsx' '*.mjs' '*.cjs' '*.json' '*.jsonc' '*.css' 2>/dev/null || true)
[ -n "$files" ] || exit 0
( cd "$root" && printf '%s\n' "$files" | xargs npx --no-install @biomejs/biome format --write ) >/dev/null 2>&1 || true
exit 0
