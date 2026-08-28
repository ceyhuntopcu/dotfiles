import {
  CYAN,
  GREEN,
  MAGENTA,
  RED,
  YELLOW,
  style as coreStyle,
} from "./vendor/pi-tidy-core/index.js";

export {
  BOLD, CYAN, DIM, GREEN, MAGENTA, RED, RESET, YELLOW,
  nonEmptyLineCount, shortPath,
} from "./vendor/pi-tidy-core/index.js";

const EXTENSION_STYLES: Record<string, { icon: string; color: string }> = {
  subagent_spawn: { icon: "󰚩", color: MAGENTA },
  subagent_wait: { icon: "󰚭", color: CYAN },
  subagent_cancel: { icon: "󰜺", color: RED },
  subagent_check: { icon: "󰋼", color: CYAN },
  subagent_list: { icon: "󰉹", color: MAGENTA },
  executor_execute: { icon: "󰆍", color: MAGENTA },
  executor_skills: { icon: "󰂺", color: YELLOW },
  executor_resume: { icon: "󰐊", color: GREEN },
  webfetch: { icon: "󰖟", color: CYAN },
  websearch: { icon: "󰍉", color: MAGENTA },
};

export function style(name: string): { icon: string; color: string } {
  return EXTENSION_STYLES[name] ?? coreStyle(name);
}

export function grepResultCounts(text: string): { matches: number; files: number } {
  if (/^No matches found/.test(text.trim())) return { matches: 0, files: 0 };

  const nativeMatches = text.split("\n")
    .map((line) => line.match(/^(.+):\d+:/))
    .filter((match): match is RegExpMatchArray => match !== null);
  if (nativeMatches.length > 0) {
    return {
      matches: nativeMatches.length,
      files: new Set(nativeMatches.map((match) => match[1])).size,
    };
  }

  let currentFile: string | undefined;
  let matches = 0;
  const files = new Set<string>();
  for (const line of text.split("\n")) {
    if (/^\S/.test(line)) currentFile = line.trim();
    else if (currentFile && /^\s+\d+:/.test(line)) {
      matches++;
      files.add(currentFile);
    }
  }
  if (matches > 0) return { matches, files: files.size };

  return { matches: text.trim().split("\n").filter(Boolean).length, files: 0 };
}
