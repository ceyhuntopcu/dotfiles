# dotfiles

Personal macOS dotfiles managed with [GNU Stow](https://www.gnu.org/software/stow/).

## Layout

```
zsh/        # ~/.zshrc — starship, fzf, zoxide, mise, atuin, aliases
starship/   # Starship prompt
ghostty/    # Ghostty config — cmux reads this for terminal visuals
cmux/       # cmux terminal (app/terminal/sidebar settings)
warp/       # Warp terminal (settings, keybindings, themes, tab_configs)
zed/        # Zed editor settings
pi/         # pi agent config (settings, modes, keybindings, models)
rectangle/  # Rectangle window manager (exported config, not stowed — import via app)
Brewfile    # Homebrew packages and casks (`brew bundle dump` output)
```

## Setup on a new machine

```bash
brew bundle            # install everything in Brewfile
stow zsh starship ghostty cmux warp zed pi
```

Rectangle isn't stow-shaped — import `rectangle/RectangleConfig.json` from the app's settings.

## Usage

From the repo root, `stow <name>` symlinks a package into `$HOME`
(e.g. `stow ghostty` → `~/.config/ghostty/*`). Remove with `stow -D <name>`.

After editing cmux or ghostty configs, reload in place with `cmux reload-config` (no app restart).

After installing/removing brew packages, refresh the Brewfile:

```bash
brew bundle dump --file=Brewfile --force
```

## CLI stack

- **Prompt/shell**: starship, fzf (Ctrl+T files, Alt+C cd), zoxide (`z`), atuin (Ctrl+R history)
- **Runtimes**: mise (reads `.nvmrc` / `mise.toml`; nvm still installed for legacy)
- **Git**: gh, lazygit, git-delta, graphite
- **Modern coreutils**: ripgrep, fd, bat (`cat`), eza (`ls`/`ll`/`lt`)
- **Multiplexer**: zellij
