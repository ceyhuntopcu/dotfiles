#!/usr/bin/env bash
#
# Symlink VS Code config into VS Code's User dir.
# (VS Code isn't stow-shaped because its path has spaces.)
#
#   ./link.sh        # create the symlinks (backs up existing real files)
#   ./link.sh -D     # remove the symlinks

set -euo pipefail
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="$HOME/Library/Application Support/Code/User"

if [ "${1:-}" = "-D" ]; then
  for f in settings.json keybindings.json; do
    [ -L "$DEST/$f" ] && rm "$DEST/$f" && echo "unlinked $DEST/$f"
  done
  exit 0
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
