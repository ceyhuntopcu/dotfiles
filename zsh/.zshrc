export STARSHIP_CONFIG=~/.config/starship/starship.toml
eval "$(starship init zsh)"

# macOS-standard line/word editing
bindkey "^[[1;9D" beginning-of-line       # cmd+left
bindkey "^[[1;9C" end-of-line             # cmd+right
bindkey "^[^?"    backward-kill-word      # option+backspace
bindkey "^[d"     kill-word               # option+delete (fn+option+backspace)
bindkey "^U"      backward-kill-line      # cmd+backspace (kill to line start)

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion
export DOTENV_ENV=development
export PATH="$HOME/.local/bin:$PATH"

# pnpm
export PNPM_HOME="$HOME/Library/pnpm"
case ":$PATH:" in
  *":$PNPM_HOME:"*) ;;
  *) export PATH="$PNPM_HOME:$PATH" ;;
esac
# pnpm end

# CLI tool aliases
alias cat='bat --paging=never'
alias ls='eza'
alias ll='eza -la --git'
alias lt='eza --tree --level=2'

### Zinit plugin manager (auto-installs on first run)
if [[ ! -f $HOME/.local/share/zinit/zinit.git/zinit.zsh ]]; then
    print -P "%F{33} %F{220}Installing %F{33}ZDHARMA-CONTINUUM%F{220} Initiative Plugin Manager (%F{33}zdharma-continuum/zinit%F{220})…%f"
    command mkdir -p "$HOME/.local/share/zinit" && command chmod g-rwX "$HOME/.local/share/zinit"
    command git clone https://github.com/zdharma-continuum/zinit "$HOME/.local/share/zinit/zinit.git" && \
        print -P "%F{33} %F{34}Installation successful.%f%b" || \
        print -P "%F{160} The clone has failed.%f%b"
fi

source "$HOME/.local/share/zinit/zinit.git/zinit.zsh"
autoload -Uz _zinit
(( ${+_comps} )) && _comps[zinit]=_zinit

# Plugins
zinit light zsh-users/zsh-completions
autoload -Uz compinit && compinit
zinit light zsh-users/zsh-syntax-highlighting
zinit light zsh-users/zsh-autosuggestions
zinit light Aloxaf/fzf-tab

# Zinit annexes
zinit light-mode for \
    zdharma-continuum/zinit-annex-as-monitor \
    zdharma-continuum/zinit-annex-bin-gem-node \
    zdharma-continuum/zinit-annex-patch-dl \
    zdharma-continuum/zinit-annex-rust

# fzf shell integration (Ctrl+T file picker, Alt+C cd — atuin takes over Ctrl+R below)
source <(fzf --zsh)

# zoxide (smarter cd — use `z <partial>`)
eval "$(zoxide init zsh)"

# mise (runtime version manager — reads .nvmrc / .tool-versions / mise.toml)
eval "$(mise activate zsh)"

# pi needs Node >= 22.19 — run it under mise's global LTS regardless of cwd
alias pi='mise exec node@lts -- pi'

# atuin (searchable synced shell history — owns Ctrl+R; must init after fzf)
eval "$(atuin init zsh)"

if command -v wt >/dev/null 2>&1; then eval "$(command wt config shell init zsh)"; fi

# opencode
export PATH=/Users/ceyhuntopcu/.opencode/bin:$PATH
