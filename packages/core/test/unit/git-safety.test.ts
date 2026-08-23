/**
 * What this tool is willing to hand to `git` (CodeQL: second-order command
 * line injection).
 *
 * `csda expand --pack-repo <url>` and `csda specops contribute` pass a
 * repository the caller named straight to `git clone`. Two shapes turn that
 * into command execution, and both are git behaving as documented:
 *
 *   --upload-pack=<cmd>    git runs <cmd>, thinking it is the far end
 *   ext::sh -c '<cmd>'     a transport whose job is to run a command
 *
 * Passing the value as its own argv element does not help — git parses argv,
 * not the shell.
 */

import { test } from "node:test";
import * as assert from "node:assert/strict";

import {
  UnsafeGitValueError,
  assertSafeGitRef,
  assertSafeGitRepo,
} from "../../src/domain/GitSafety";

test("a repository that git would read as an option is refused", () => {
  for (const hostile of ["--upload-pack=touch /tmp/pwned", "--config=core.pager=id", "-u"]) {
    assert.throws(() => assertSafeGitRepo(hostile), UnsafeGitValueError, hostile);
  }
});

test("the ext:: transport is refused, because a `--` cannot save it", () => {
  // This is the half a separator does not cover: after `--` it is still a URL,
  // and the URL is the payload.
  assert.throws(() => assertSafeGitRepo("ext::sh -c 'id > /tmp/pwned'"), UnsafeGitValueError);
  assert.throws(() => assertSafeGitRepo("  EXT::sh -c id"), UnsafeGitValueError);
});

test("the message says what is wrong and what to use instead", () => {
  // A refusal a person cannot act on is a refusal they route around.
  try {
    assertSafeGitRepo("ext::sh -c id", "pack repository");
    assert.fail("expected a refusal");
  } catch (err) {
    assert.match((err as Error).message, /ext:: transport/);
    assert.match((err as Error).message, /path, a bundle, or an http\(s\)\/ssh URL/);
  }
});

test("the shapes a pack repository really takes are still allowed", () => {
  // Refusing these would be refusing the feature: a pack is often a directory
  // or a bundle carried into an air-gapped network.
  for (const fine of [
    "https://github.com/acme/packs.git",
    "git@github.com:acme/packs.git",
    "ssh://git@host/acme/packs.git",
    "git://host/acme/packs.git",
    "file:///srv/packs",
    "/srv/packs",
    "./packs",
    "C:\\packs\\acme",
    "/tmp/acme-packs.bundle",
  ]) {
    assert.equal(assertSafeGitRepo(fine), fine, fine);
  }
});

test("an empty repository is refused rather than passed on as nothing", () => {
  assert.throws(() => assertSafeGitRepo(""), UnsafeGitValueError);
  assert.throws(() => assertSafeGitRepo(undefined), UnsafeGitValueError);
});

test("a ref is checked for the option shape, and nothing more", () => {
  // A ref has no transport, so `ext::` is not a question here — a branch may
  // legitimately be called almost anything.
  assert.throws(() => assertSafeGitRef("--upload-pack=id"), UnsafeGitValueError);
  assert.equal(assertSafeGitRef("v1.2.0"), "v1.2.0");
  assert.equal(assertSafeGitRef("feature/ext::odd-but-legal"), "feature/ext::odd-but-legal");
  assert.equal(assertSafeGitRef("  main  "), "main");
});
