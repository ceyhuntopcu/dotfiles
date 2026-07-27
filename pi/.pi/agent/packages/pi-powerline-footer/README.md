# pi-powerline-footer overrides

Adapted from Phil's dotfiles, minus his vim-mode wiring and OneDark Pro color
override — this version leaves segment colors on the package's own theme
defaults (which already follow pi's active theme) and doesn't touch cursor
shape or border color based on vim mode, since we don't run vim-motions-pi.

The plugin reads its layout/segment logic from inside its own npm package
directory (`~/.pi/agent/npm/node_modules/pi-powerline-footer/`). Those files
get **wiped on `pi update` / package reinstall**, so the source of truth lives
here and gets re-applied with one command.

## What it does

1. `presets.ts` — splits the crowded default top row into: **top** = model,
   thinking, path; **bottom** = shell_mode, git, context_pct, cache_read, cost.
2. `index.ts → computeResponsiveLayout()` — renders the top and bottom rows
   independently so bottom-row segments never get auto-promoted to the top
   row on wide terminals (stock behavior does this).
3. `index.ts → renderPowerlinePrimaryLines/renderPowerlineSecondaryLines` —
   wraps each row in rounded corners (`╭─...─╮` / `╰─...─╯`) using the
   `borderMuted` theme color, so editor + status rows read as one continuous
   rounded box instead of a rectangle with a plain line below it.

This intentionally skips: vim-mode-aware border/cursor/prompt coloring, the
OneDark Pro `theme.json` override, `/vibe generate` multi-word support, and
bash alias expansion — none of those were requested.

## Usage

After installing `pi-powerline-footer` (already added to `settings.json`
packages) or after any `pi update`/reinstall:

```bash
bash ~/Documents/GitHub/dotfiles/pi/.pi/agent/packages/pi-powerline-footer/apply.sh
```

Then restart pi (or `/reload` if that command exists in your version).

Idempotent — each patch checks for its own marker comment before touching the
file, so running it twice is safe.
