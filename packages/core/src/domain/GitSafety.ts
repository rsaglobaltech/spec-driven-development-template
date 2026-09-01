/**
 * Values this tool hands to `git`, checked before they get there.
 *
 * ## Why this exists
 *
 * `specgate expand --pack-repo <url>` and `specgate specops contribute` pass a
 * repository the caller named straight to `git clone`. Two things make that
 * more than a style concern, and CodeQL flags both as
 * `js/second-order-command-line-injection`:
 *
 * - **A value beginning with `-` is read as an option.** `--upload-pack=<cmd>`
 *   makes git run `<cmd>` on what it thinks is the far end. Passing the value
 *   as its own argv element does not help: git parses argv, not the shell.
 * - **`ext::` is a git transport that executes a command by design.**
 *   `ext::sh -c '…'` is not an exploit of git; it is git doing what it says.
 *
 * The defence is two-sided and both halves are needed. The `--` separator tells
 * git where options stop, and that is what these functions expect their callers
 * to add; this module refuses the values a separator cannot save — `ext::`
 * still executes after a `--`, because by then it is a URL and the URL is the
 * payload.
 *
 * ## What is deliberately still allowed
 *
 * Local paths, `file://`, `https://`, `ssh://`, `git://`, `git@host:path` and
 * `.bundle` files. A pack repository is often a directory or a bundle carried
 * into an air-gapped network, and refusing those would be refusing the feature.
 */

/** Transports that run a command as their normal operation. */
const EXECUTING_TRANSPORT = /^\s*ext::/i;

export class UnsafeGitValueError extends Error {}

/**
 * A repository the caller named, checked before `git` sees it.
 *
 * Returns the value so it can be used inline. Throws `UnsafeGitValueError`,
 * which callers turn into their own message.
 */
export function assertSafeGitRepo(value: unknown, what = "repository"): string {
  const repo = String(value ?? "").trim();
  if (!repo) {
    throw new UnsafeGitValueError(`No ${what} given.`);
  }
  if (repo.startsWith("-")) {
    throw new UnsafeGitValueError(
      `The ${what} "${repo}" starts with "-", so git would read it as an option ` +
        `rather than a location. Options like --upload-pack run a command.`
    );
  }
  if (EXECUTING_TRANSPORT.test(repo)) {
    throw new UnsafeGitValueError(
      `The ${what} "${repo}" uses git's ext:: transport, which runs a command by ` +
        `design. Use a path, a bundle, or an http(s)/ssh URL.`
    );
  }
  return repo;
}

/**
 * A ref — branch, tag or commit — the caller named.
 *
 * Narrower than a repository: a ref has no transport, so the only question is
 * whether git would read it as an option.
 */
export function assertSafeGitRef(value: unknown, what = "version"): string {
  const ref = String(value ?? "").trim();
  if (!ref) {
    throw new UnsafeGitValueError(`No ${what} given.`);
  }
  if (ref.startsWith("-")) {
    throw new UnsafeGitValueError(
      `The ${what} "${ref}" starts with "-", so git would read it as an option ` +
        `rather than a ref.`
    );
  }
  return ref;
}
