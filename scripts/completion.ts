#!/usr/bin/env node

/**
 * `completion <bash|zsh>` — print a shell completion script for `csda`.
 *
 *   # zsh
 *   csda completion zsh > ~/.csda-completion.zsh
 *   echo 'source ~/.csda-completion.zsh' >> ~/.zshrc
 *
 *   # bash
 *   csda completion bash > ~/.csda-completion.bash
 *   echo 'source ~/.csda-completion.bash' >> ~/.bashrc
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { commandNames, subcommandNames } = require("./lib/surface");

/**
 * Both lists come from the one surface declaration, so a command that exists
 * is completable by construction.
 *
 * They were hand-maintained, and the guard only compared top-level names by
 * scraping the dispatcher with a regex — so `harness init`, `change
 * instructions`, `alm link` and `alm status` all shipped uncompletable.
 */
const COMMANDS = commandNames();

const SUBCOMMANDS: Record<string, string[]> = subcommandNames();

function bashScript() {
  const cmds = COMMANDS.join(" ");
  const subCases = Object.entries(SUBCOMMANDS)
    .map(
      ([cmd, subs]) => `      ${cmd}) COMPREPLY=( $(compgen -W "${subs.join(" ")}" -- "$cur") ) ;;`
    )
    .join("\n");
  return `# csda bash completion
_csda() {
  local cur prev
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"
  if [ "$COMP_CWORD" -eq 1 ]; then
    COMPREPLY=( $(compgen -W "${cmds}" -- "$cur") )
    return
  fi
  if [ "$COMP_CWORD" -eq 2 ]; then
    case "$prev" in
${subCases}
    esac
  fi
}
complete -F _csda csda create-spec-driven-app
`;
}

function zshScript() {
  const cmds = COMMANDS.join(" ");
  const subCases = Object.entries(SUBCOMMANDS)
    .map(([cmd, subs]) => `        ${cmd}) compadd ${subs.join(" ")} ;;`)
    .join("\n");
  return `#compdef csda create-spec-driven-app
# csda zsh completion
_csda() {
  if (( CURRENT == 2 )); then
    compadd ${cmds}
    return
  fi
  if (( CURRENT == 3 )); then
    case "\${words[2]}" in
${subCases}
    esac
  fi
}
compdef _csda csda create-spec-driven-app
`;
}

function fishScript() {
  const lines = [
    "# csda fish completion",
    "# Only complete the first word when no subcommand has been given yet.",
    `complete -c csda -n __fish_use_subcommand -a "${COMMANDS.join(" ")}"`,
    `complete -c create-spec-driven-app -n __fish_use_subcommand -a "${COMMANDS.join(" ")}"`,
  ];
  for (const [cmd, subs] of Object.entries(SUBCOMMANDS)) {
    lines.push(
      `complete -c csda -n "__fish_seen_subcommand_from ${cmd}" -a "${subs.join(" ")}"`,
      `complete -c create-spec-driven-app -n "__fish_seen_subcommand_from ${cmd}" -a "${subs.join(" ")}"`
    );
  }
  return `${lines.join("\n")}\n`;
}

const GENERATORS = { bash: bashScript, zsh: zshScript, fish: fishScript };

/**
 * Where each shell loads completions from without being told.
 *
 * fish and zsh have a conventional directory; bash does not — its completions
 * are sourced from a file the user has to reference, so `--install` writes the
 * file and prints the one line to add. Pretending otherwise would leave the
 * user with a file that silently does nothing.
 */
function installTarget(shell) {
  const home = os.homedir();
  if (shell === "fish") {
    return { file: path.join(home, ".config/fish/completions/csda.fish"), autoloaded: true };
  }
  if (shell === "zsh") {
    return {
      file: path.join(home, ".zsh/completions/_csda"),
      autoloaded: false,
      hint: "Add to ~/.zshrc:  fpath=(~/.zsh/completions $fpath) && autoload -Uz compinit && compinit",
    };
  }
  return {
    file: path.join(home, ".csda-completion.bash"),
    autoloaded: false,
    hint: "Add to ~/.bashrc:  source ~/.csda-completion.bash",
  };
}

function usage() {
  process.stderr.write(
    "Usage: csda completion <bash|zsh|fish> [--install]\n\n" +
      "  csda completion fish --install     write it where fish already looks\n" +
      "  csda completion zsh > ~/.csda-completion.zsh\n" +
      "  csda completion bash >> ~/.bashrc\n"
  );
}

function main(argv) {
  const args = argv || process.argv.slice(2);
  const install = args.includes("--install");
  const shell = args.find((a) => !a.startsWith("-"));

  if (!shell || !GENERATORS[shell]) {
    usage();
    process.exit(shell ? 2 : 0);
  }

  const script = GENERATORS[shell]();

  if (!install) {
    process.stdout.write(script);
    process.exit(0);
  }

  const target = installTarget(shell);
  fs.mkdirSync(path.dirname(target.file), { recursive: true });
  fs.writeFileSync(target.file, script, "utf8");

  const where = target.file.replace(os.homedir(), "~");
  process.stdout.write(`✔  wrote ${where}\n`);
  process.stdout.write(
    target.autoloaded
      ? "   fish loads it automatically — open a new shell.\n"
      : `   ${target.hint}\n`
  );
  process.exit(0);
}

if (require.main === module) main(process.argv.slice(2));

export { COMMANDS, SUBCOMMANDS, bashScript, zshScript, fishScript, installTarget, GENERATORS };
