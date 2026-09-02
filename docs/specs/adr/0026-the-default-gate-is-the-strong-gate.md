# ADR-0026 — The default gate is the strong gate

**Status:** Accepted · **Date:** 2026-09-02 · **Supersedes:** nothing ·
**Applies from:** 1.0

## Context

`validate` runs a base set of checks. The checks that catch the failures this
product exists to prevent — `--strict-tdd`, `--strict-links`,
`--strict-coverage` — are all opt-in, and until recently none of them appeared
in the CI invocation the tool itself generated.

A cold evaluator put the consequence plainly:

> "The gate that would have caught half of what I broke, `--strict-links`, is
> off by default and missing from all three places that recommend a CI
> invocation. Anyone following the documentation ends up with a weaker gate than
> the tool can give them."

That is not a documentation defect that better docs would fix. Three independent
engineers followed the documented path and all three ended up with a gate that
approved a corrupt matrix. When every user of the recommended path gets the weak
configuration, the weak configuration *is* the product.

The counter-argument is real and was weighed: a default that fails more will
fail on projects that were green yesterday, and some of those failures will be
the tool's heuristics rather than the project's mistakes. `--strict-coverage` in
particular matches names, and a project that names its tests some other way
would start failing through no fault of its own.

## Decision

**From 1.0, `validate` runs the strong gate by default**: the base checks plus
`--strict-tdd`, `--strict-links` and `--strict-coverage`.

`--lenient` selects the current base-only behaviour, for a project that is
mid-adoption and does not want the strong gate yet. The individual `--strict-*`
flags keep working and become no-ops when already implied, so existing CI
invocations continue to mean what they meant.

Three constraints on how it lands:

1. **It ships in 1.0, not before.** It is a breaking change to what a green run
   means, and a green-to-red flip in a minor release is exactly the kind of
   surprise that gets a tool removed from a pipeline.
2. **The 0.9 line warns.** `validate` prints which strong checks would have run
   and what they would have found, without failing. A user should meet this
   change as information before they meet it as a red build.
3. **The failure has to be worth the interruption.** Every check promoted to the
   default carries a fix line naming the file and the edit. A default that fails
   without saying what to do is worse than one that stays off.

## Consequences

**What gets better.** The documented path and the strong path become the same
path. `ci init`, `getting-started.md` and `validate` stop being three different
opinions about how strict a gate should be. A user who does nothing gets the
gate the tool is for.

**What gets worse.** Adoption gets harder in exactly the place adoption already
hurts: a brownfield repository whose matrix was written by hand will light up on
first contact. `--lenient` exists for that, and `adopt` will suggest it. The
risk is that `--lenient` becomes the thing everybody types, which would put us
back where we started with an extra flag — so the 1.0 measurement includes how
many simulated adoptions reach for it.

**What we are not claiming.** A strong default does not make a green run mean
"this requirement is correctly implemented". `--strict-coverage` checks that a
scenario is *named* by the artifact that claims to prove it, not that it is
proved: this tool does not execute the suite during `validate`, and attributing
coverage per scenario would need it to. `done --check --test-cmd` is where
execution happens. The limit is stated in the flag's own help text and stays
stated.

## Alternatives considered

**Leave the defaults and fix the documentation.** Rejected: three engineers
followed the documentation and got the weak gate anyway. If the recommended path
produces the wrong configuration, the configuration is the problem.

**Promote only `--strict-links`.** Tempting — it is the cheapest and has no
heuristic in it. Rejected because it is also the one that produced a false sense
of safety: `--strict-links` is `fs.existsSync`, so a link that merely lies passes
it, and promoting only the check that cannot detect a lie would make the default
gate more trusted without making it more truthful.

**Make it configurable per project instead of a flag.** Deferred, not rejected.
A `gate:` block in `harness.config.yaml` is a reasonable 1.x feature. It is not
a substitute for choosing a default, because the project that most needs the
strong gate is the one that never opens the config file.
