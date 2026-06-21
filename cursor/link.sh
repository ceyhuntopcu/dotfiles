#!/usr/bin/env bash
#
# Symlink Cursor settings into the Cursor User directory.
# Cursor requires the files named exactly settings.json / keybindings.json in its
# User dir (a path with spaces), so this uses manual symlinks instead of stow.
#
#   ./link.sh        # create the symlinks (backs up existing real files)
#   ./link.sh -D     # remove the symlinks

set -euo pipefail
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="$HOME/Library/Application Support/Cursor/User"

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

Twilight theme: the source lives in ./twilight-theme/. To install it:
  cd twilight-theme && zip -r -X /tmp/twilight.vsix package.json themes
  /Applications/Cursor.app/Contents/Resources/app/bin/cursor --install-extension /tmp/twilight.vsix
Then set workbench.preferred{Dark,Light}ColorTheme to "Twilight" / "Twilight Light".
EOF
