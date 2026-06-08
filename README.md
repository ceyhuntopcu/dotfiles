# dotfiles

Personal macOS dotfiles managed with [GNU Stow](https://www.gnu.org/software/stow/).

## Layout

```
warp/      # Warp terminal (settings, keybindings, themes, tab_configs)
starship/  # Starship prompt
```

## Usage

From the repo root:

```bash
stow warp      # symlinks warp/.warp/* → ~/.warp/*
stow starship  # symlinks starship/.config/starship/* → ~/.config/starship/*
```

To remove a package: `stow -D <name>`.
