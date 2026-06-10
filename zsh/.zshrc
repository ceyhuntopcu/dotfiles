export STARSHIP_CONFIG=~/.config/starship/starship.toml
eval "$(starship init zsh)"

# macOS-standard line/word editing
bindkey "^[[1;9D" beginning-of-line       # cmd+left
bindkey "^[[1;9C" end-of-line             # cmd+right
bindkey "^[^?"    backward-kill-word      # option+backspace
bindkey "^[d"     kill-word               # option+delete (fn+option+backspace)
bindkey "^U"      backward-kill-line      # cmd+backspace (Warp sends ^U)

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion
export DOTENV_ENV=development
export PATH="$HOME/.local/bin:$PATH"

# CLI tool aliases
alias cat='bat --paging=never'
alias ls='eza'
alias ll='eza -la --git'
alias lt='eza --tree --level=2'

# fzf shell integration (Ctrl+T file picker, Alt+C cd — atuin takes over Ctrl+R below)
source <(fzf --zsh)

# zoxide (smarter cd — use `z <partial>`)
eval "$(zoxide init zsh)"

# mise (runtime version manager — reads .nvmrc / .tool-versions / mise.toml)
eval "$(mise activate zsh)"

# atuin (searchable synced shell history — owns Ctrl+R; must init after fzf)
eval "$(atuin init zsh)"
