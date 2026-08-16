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

// Keep both lists in step with the dispatch table in
// bin/create-spec-driven-app.ts — tests/unit/setup-commands.test.ts asserts it.
const COMMANDS = [
  "init",
  "adopt",
  "doctor",
  "status",
  "ci",
  "alm",
  "validate",
  "expand",
  "plan",
  "report",
  "done",
  "req",
  "fix",
  "change",
  "pack",
  "specops",
  "harness",
  "config",
  "agents",
  "completion",
  "studio",
];

const SUBCOMMANDS: Record<string, string[]> = {
  pack: ["init", "lint", "infer", "bundle"],
  specops: ["add", "remove", "sync", "diff", "contribute"],
  harness: ["run", "prompt"],
  change: ["new", "list", "show", "status", "validate", "archive"],
  req: ["add", "link", "done", "list"],
  ci: ["init"],
  alm: ["sync"],
  agents: ["init"],
  config: ["init"],
  completion: ["bash", "zsh"],
};

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

function main() {
  const shell = process.argv[2];
  if (shell === "bash") {
    process.stdout.write(bashScript());
  } else if (shell === "zsh") {
    process.stdout.write(zshScript());
  } else {
    process.stderr.write(
      "Usage: csda completion <bash|zsh>\n" +
        "  csda completion zsh  > ~/.csda-completion.zsh && source it from ~/.zshrc\n" +
        "  csda completion bash > ~/.csda-completion.bash && source it from ~/.bashrc\n"
    );
    process.exit(shell ? 2 : 0);
  }
  process.exit(0);
}

if (require.main === module) main();

export { COMMANDS, SUBCOMMANDS, bashScript, zshScript };
