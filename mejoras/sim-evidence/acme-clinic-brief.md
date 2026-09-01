# Your task

You are a senior engineer. Your team has inherited the repository in `./work/`
and nobody left documentation of what it is supposed to do. Your lead has asked
you to evaluate a tool called Specgate, which claims to make specifications
something CI can enforce, and to report back by the end of the day.

You have a deadline and no patience for ceremony.

## What you have

- The tool, from the public npm registry: `npx @rsaglobaltech/specgate@latest`
- Its documentation, on the web: https://rsaglobaltech.github.io/specgate/
- The repository in `./work/`, and whatever its own README says about testing

You have nothing else. You have not seen this tool's source and you should not
go looking for it — you are evaluating what a user gets, not what a maintainer
knows.

## What to try

Take the repository to the point where its specifications are checked by CI, as
far as the documentation lets you get. Roughly:

1. Find out what the tool thinks the codebase is.
2. Adopt it, without changing any source code.
3. Write three to five requirements describing behaviour the code **already**
   has, and link each one to the code and the test that prove it. If something
   cannot be linked, that is worth writing down — either the requirement or the
   code is lying.
4. Get its gate to pass, and work out how you would put it in CI.
5. If you get that far, try its agent harness on one new requirement.

## What to record — this is the actual deliverable

Keep `FINDINGS.md` as you go. It matters more than finishing.

- Every command you ran and what it printed. Paste the output verbatim,
  **especially when it was wrong, confusing, or made you stop**.
- Every point where you had to guess because the documentation did not say.
- Every time two parts of the tool disagreed with each other.
- How long each stage took.

## The honest ending

**You are allowed to conclude that this tool is not worth adopting.** If you
reach that view, say so plainly and say what specifically caused it. A negative
report that names the moment you gave up is more useful than a positive one, and
nobody here benefits from you being polite about it.
