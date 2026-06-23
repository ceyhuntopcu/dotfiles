#!/usr/bin/env bash
#
# Symlink VS Code config into the editor User dir(s).
# VS Code is the canonical home; Cursor (a VS Code fork) shares the SAME files so
# both editors stay in sync. The cursor.* keys are harmlessly ignored by VS Code.
#
#   ./link.sh        # create the symlinks (backs up existing real files)
#   ./link.sh -D     # remove the symlinks

set -euo pipefail
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESTS=(
  "$HOME/Library/Application Support/Code/User"
  "$HOME/Library/Application Support/Cursor/User"
)

for DEST in "${DESTS[@]}"; do
  if [ "${1:-}" = "-D" ]; then
    for f in settings.json keybindings.json; do
      [ -L "$DEST/$f" ] && rm "$DEST/$f" && echo "unlinked $DEST/$f"
    done
    continue
  fi
  mkdir -p "$DEST"
  for f in settings.json keybindings.json; do
    if [ -e "$DEST/$f" ] && [ ! -L "$DEST/$f" ]; then
      mv "$DEST/$f" "$DEST/$f.bak"
      echo "backed up existing $f -> $f.bak"
    fi
    ln -sf "$SRC/$f" "$DEST/$f"
    echo "linked $DEST/$f"
  done
done

cat <<'EOF'

Extensions (VS Code marketplace):
  code --install-extension biomejs.biome \
       --install-extension eamodio.gitlens \
       --install-extension github.github-vscode-theme \
       --install-extension usernamehw.errorlens \
       --install-extension hoovercj.vscode-settings-cycler \
       --install-extension ms-vscode-remote.remote-ssh
  # JetBrains icon theme is Open VSX only — copy its folder into ~/.vscode/extensions/
EOF
