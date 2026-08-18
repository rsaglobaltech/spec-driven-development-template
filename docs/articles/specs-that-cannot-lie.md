<!-- csda:allow-placeholders — the article quotes the {{VAR}} template syntax. -->
<!--
  FOR PUBLICATION ON MEDIUM.

  Medium does not render Mermaid. Two options for each diagram below:
    1. Paste the fenced block into https://mermaid.live, export PNG, upload.
    2. Push this file to GitHub — it renders Mermaid natively — and embed the
       GitHub URL in Medium, which unfurls it.

  Suggested tags: spec-driven-development, ai-agents, software-architecture,
  developer-tools, engineering-management
-->

# Specs That Cannot Lie

## Domain-Driven Design, BDD and TDD as one checkable artefact — and what happened when we pointed a real agent at it.

There is broad agreement now that the bottleneck in software has moved. When an
agent can produce a thousand lines in ten minutes, the scarce resource stops
being typing speed and becomes **the ability to say precisely what you want**.
InfoQ [made this case well for enterprises](https://www.infoq.com/articles/enterprise-spec-driven-development/):
specifications become the interface between humans and agents, and the
organisations that treat that as a cultural change rather than a tool rollout
will pull ahead.

I agree with all of it. It is also, as written, entirely theory.

What that article does not contain — what almost none of the writing on
spec-driven development contains — is two things.

The first is what a specification has to **be** for an agent to build from it
safely. "Write good specs" is not an answer. What follows is a concrete one:
a Domain-Driven Design model with resolvable references, executable examples in
Gherkin, and a test discipline enforced mechanically rather than culturally —
joined into a single artefact that continuous integration can check.

The second is what happens when you actually run the loop. We built the
pipeline. We pointed a real agent at it. Within three runs it produced **ten
defects in our own machinery**, and one of them invalidated the premise of the
whole product.

Both halves are below. The second is the one I would read first if I were
evaluating anybody's tool, including ours.

---

## The failure mode nobody writes about

Spec-driven development has an obvious failure mode, and it is not that people
refuse to write specs. It is that **specifications drift into fiction**.

A requirement says the system does X. The code stopped doing X two sprints ago.
The document is still there, still confident, still wrong — and now an agent
reads it as ground truth and builds on a lie. You have not automated
engineering. You have automated the propagation of stale documentation at
machine speed.

Every design decision below exists to make that specific failure impossible, or
at least loud.

---

## What is actually in a specification

Most spec-driven tooling treats a specification as prose with headings. That is
why so much of it rots: prose has no referents, so nothing can check it.

A specification here is a **domain model**, in the Domain-Driven Design sense,
and it is structured enough to cross-check.

```mermaid
graph TD
  BC["<b>Bounded context</b><br/>BC-001 Invoicing"]
  AGG["<b>Aggregate</b><br/>AGG-001 Invoice<br/><i>owns its invariants</i>"]
  CMD["<b>Command</b><br/>CMD-001 IssueInvoiceCommand"]
  QRY["<b>Query</b><br/>QRY-002 GetInvoiceQuery"]
  EVT["<b>Event</b><br/>EVT-001 InvoiceIssued"]
  UC["<b>Use case</b><br/>UC-001 Issue Invoice<br/><i>actor: Billing clerk</i>"]
  REQ["<b>Requirement</b><br/>REQ-001"]
  RUL["<b>Business rule</b><br/>RUL-001 Invoices are<br/>immutable once issued"]

  REQ --> UC
  UC --> CMD
  UC --> QRY
  CMD --> AGG
  AGG --> EVT
  BC --> AGG
  RUL --> BC

  classDef strat fill:#fff9db,stroke:#f08c00,color:#5c3d00;
  classDef tact fill:#e7f5ff,stroke:#1c7ed6,color:#0b3d61;
  classDef ev fill:#fff0f6,stroke:#c2255c,color:#611;
  class BC,RUL strat;
  class AGG,CMD,QRY,UC,REQ tact;
  class EVT ev;
```

Every box has an identifier. Every arrow is a reference the tool resolves.

That is the whole trick. Once the model has referents, a linter can ask
questions that prose cannot answer:

- Does every requirement have a use case that implements it?
- Does every use case name an **actor**? (A use case without an actor is a
  function, and you have skipped the question of who wants this.)
- Does every bounded context reference aggregates that exist?
- Does every event belong to an aggregate that exists?
- Does every business rule reference a context that exists?
- Does every scenario reference a requirement and a use case that exist?
- Are all identifiers unique?

`csda pack lint` runs eleven such rules. A dangling reference — an event
emitted by an aggregate nobody declared — fails the check. This is a compiler
for a domain model, and it catches the same category of mistake a compiler
catches: not "is this a good design", but "does this design refer to things
that are there".

You can also render the spine and look at it:

```bash
csda pack lint --pack-root ./packs --pack billing/backend --graph
```

which emits Mermaid — the REQ → UC → CMD/AGG/EVT graph — so an architecture
review can look at the domain rather than at a document about the domain.

---

## The chain that makes it checkable

Here is the part I would put on a slide if I only had one.

Domain-Driven Design gives you a model. Behaviour-Driven Development gives you
executable examples. Test-Driven Development gives you a discipline. Everyone
agrees these are good. In practice they live in three different places, drift
apart, and nobody notices until a release goes wrong.

The traceability matrix makes them **one chain, in one row**:

```mermaid
graph LR
  R["REQ-001<br/><i>requirement</i>"] --> S["SCN-001<br/><i>scenario id</i>"]
  S --> F["load_pack.feature<br/><i>Gherkin, BDD</i>"]
  F --> U["UC-001<br/><i>use case</i>"]
  U --> C["CMD-001<br/><i>command / query</i>"]
  C --> A["AGG-001<br/><i>aggregate, DDD</i>"]
  A --> E["EVT-001<br/><i>event</i>"]
  E --> T["src/…<br/><i>technical artefact</i>"]
  T --> X["…steps.ts<br/><i>test artefact, TDD</i>"]
  X --> ST["Status<br/><i>Draft → Implemented</i>"]

  classDef c fill:#ebfbee,stroke:#2f9e44,color:#143;
  class R,S,F,U,C,A,E,T,X,ST c;
```

Ten columns, one requirement per row. Read left to right it is a sentence:
*this requirement is demonstrated by this scenario, written in this feature
file, realised by this use case, which dispatches this command against this
aggregate, emitting this event, implemented here, proven by this test, and it
is currently in this state.*

Break any link and the build fails.

That is what makes DDD, BDD and TDD stop being three practices a team is
supposed to remember, and start being one artefact CI can check. The value is
not the vocabulary. It is that **the vocabulary is load-bearing**.

Which link is checked, and how:

```mermaid
graph TD
  A[Requirement REQ-007] --> B{Has a Gherkin scenario?}
  B -- no --> F[❌ build fails]
  B -- yes --> C{Scenario file exists on disk?}
  C -- no --> F
  C -- yes --> D{Has a test artefact?}
  D -- no --> G{Status past Draft?}
  G -- yes --> F
  G -- no --> P[✅ passes, still Draft]
  D -- yes --> P

  classDef bad fill:#ffe3e3,stroke:#c92a2a,color:#611;
  classDef good fill:#ebfbee,stroke:#2f9e44,color:#143;
  class F bad;
  class P,G good;
```

`csda validate --strict-tdd` fails your pull request when a requirement has no
scenario, when the scenario file it names does not exist, or when a requirement
has moved past `Draft` without a test. A guard test additionally asserts that
every path named in the matrix resolves on disk.

This is what makes drift expensive instead of invisible. A specification cannot
quietly become false, because the moment it does, CI goes red.

It is also, incidentally, the gap the InfoQ piece names as unsolved in current
tooling — *"undefined specification-to-implementation alignment validation"*.
It is solvable. It just has to be a gate rather than a document.

---

## BDD, and treating scenario quality as a lint rule

A Gherkin scenario is only worth having if it is falsifiable. In practice most
teams accumulate scenarios like this:

```gherkin
Scenario: Test login
  Given the system is ready
  When something happens
  Then it works
```

That passes review because it is syntactically a scenario. It is worthless: it
cannot fail for an interesting reason, and an agent handed it will produce
something that technically satisfies it.

So scenario quality is a lint rule, not a style preference. `pack lint` flags:

- **Generic titles** — "test login", "happy path"
- **Missing When** — a scenario with no action is an assertion, not a behaviour
- **Missing Then** — a scenario with no outcome cannot fail
- **Vague steps** — "something happens", "it works", "the system is ready"
- **Title drift** — the scenario named in the model no longer matches the title
  in the feature file

Under `--strict`, these become errors and fail CI.

This matters much more in an agent workflow than it did in a human one. A
developer reading "then it works" asks a colleague what that means. An agent
does not ask. It picks an interpretation, implements it confidently, and the
scenario goes green.

---

## TDD as a gate rather than a discipline

Test-Driven Development has always had an enforcement problem. Everyone agrees
with it; nobody can tell from the outside whether it happened.

The matrix has a **Test artifact** column and a **Status** column, and the rule
that connects them is mechanical:

> A requirement may sit in `Draft` with no test. The moment its status moves
> past `Draft`, it must name a test artefact — or `validate --strict-tdd` fails
> the build.

That is deliberately permissive at the start and unforgiving at the end. You
are allowed to think out loud in `Draft`. You are not allowed to call something
`In Dev` or `Implemented` while nothing proves it.

The agent prompt carries the same ordering, explicitly — *"Test artifact (write
this first — TDD)"* — and the gate the harness runs targets the scenario
belonging to the requirement under test, so the loop cannot mark work done
without executing the example that defines it.

We learned that last clause the hard way, which is the next section.

---

## Modelling dependencies rather than phases

The natural way to structure spec-driven work is as phases: discover, then
design, then tasks. It reads well on a slide. It is also how spec-driven
development earns its reputation for ceremony, because the moment you enforce
phases you are telling a team it may not write down an obvious task until a
document upstream is blessed.

So the artefacts form a **dependency graph**, and dependencies are enablers
rather than gates.

```mermaid
graph LR
  P[proposal.md<br/><i>why this change</i>] --> S[specs/**/spec.md<br/><i>what changes</i>]
  P --> D[design.md<br/><i>how it is built</i>]
  S --> T[tasks.md<br/><i>the work</i>]
  D --> T

  classDef a fill:#e7f5ff,stroke:#1c7ed6,color:#0b3d61;
  class P,S,D,T a;
```

You can write `tasks.md` before `design.md`. The tool will tell you what writing
each artefact unblocks, and what is still missing, but it will not stop you. The
graph is also **configurable** — a team that works BDD-first inserts a `feature`
artefact before `specs`, and the tool follows their shape rather than ours.

The difference sounds academic until you watch a team hit a phase gate at 4pm on
a Thursday and simply route around the tool. A rule that does not survive contact
with real work gets satisfied with fiction.

---

## Domain knowledge as a versioned dependency

Enterprises do not have one authentication requirement. They have the same
authentication requirements in eleven services, subtly diverging.

So domain knowledge ships as a **pack**: a versioned, schema-validated bundle of
requirements, use cases, aggregates, events and Gherkin scenarios, installed the
way you install a library.

```mermaid
graph LR
  subgraph Pack repository
    PK[auth/backend<br/>pack.yaml @ v1.2.0]
  end
  subgraph Your project
    L[.specops.lock<br/><i>version + sha256 digest</i>]
    SP[docs/specs/**]
    FT[features/**]
  end
  PK -->|specops add| L
  L --> SP
  L --> FT
  SP -.->|specops contribute| PK

  classDef p fill:#fff9db,stroke:#f08c00,color:#5c3d00;
  classDef q fill:#e7f5ff,stroke:#1c7ed6,color:#0b3d61;
  class PK p;
  class L,SP,FT q;
```

Three properties matter here.

**It is pinned by content, not by label.** The lockfile records a `sha256` over
the pack's file tree. Re-installing the same version with different content
fails loudly — that is what a moved tag, a rewritten history or a poisoned cache
looks like, and a version number is a label rather than a promise.

**Upgrades are reviewed as intent.** `specops diff --as-change` renders a version
bump as a proposal describing what requirements moved, instead of a file diff
nobody reads.

**Learning flows back.** `specops contribute` sends a local change upstream to
the pack, so what one team discovers becomes context for every other team. This
is the InfoQ article's "each gap strengthens the harness", implemented as a
command rather than described as a virtue.

---

## The loop, and the fact that it never merges

At the top adoption level an agent drives the work. One requirement at a time,
each in its own git worktree:

```mermaid
sequenceDiagram
  participant H as csda harness
  participant W as git worktree
  participant A as your agent
  participant G as the gate

  H->>H: plan → next pending requirement
  H->>W: create worktree on harness/REQ-007
  H->>A: prompt (Gherkin + rules + boundary)
  A->>W: writes code and tests
  H->>G: validate --strict-tdd
  H->>G: your test command, filtered to REQ-007's scenario
  alt gate green
    G-->>H: pass
    H->>W: csda done + commit
  else gate red
    G-->>H: failure output
    H->>A: retry, with the failure in the prompt
  end
  H-->>H: report — never merges
```

Two things are deliberate.

**The agent is any shell command.** `claude -p`, `aider --message-file`,
`opencode run` — the harness only requires that your command contain a
`{prompt_file}` placeholder. No vendor is baked in.

**It never merges.** It leaves branches. A human reviews and merges, always.

---

## What happened when we ran it

Here is the part I have not seen written down anywhere else.

We pointed the loop at a real greenfield project — a spec viewer, fifteen
requirements, specs supplied by a domain pack — with Claude as the agent. Three
runs. Every finding below is a defect in **our** machinery, not the agent's.

### Run 1: it worked, and that was luck

The agent produced eighteen files across the correct hexagonal layers, wrote the
step definitions, and its scenario passed. It did not touch the feature files or
the specs, which is the boundary that would have voided the exercise.

Then I checked whether the gate had actually verified any of that.

It had not. The gate ran the project's build and unit tests, and it ran
`validate --strict-tdd` — but the requirement was still `Draft` at that moment,
so strict-TDD did not demand its test, and the test command had no way to target
the scenario under test. **The loop could mark a requirement "Implemented" with
its scenario never executed.**

The work was good because the agent was good. Nothing checked. That is worse
than a failure, because it would have reported success just as confidently on
bad work.

### Run 2: the gate rejected correct work

Second requirement. Failed both attempts.

The agent's code was right — the scenario passed when run by hand. The gate had
run the *entire* suite instead of one scenario, because a configuration key in
the base branch silently overrode the filter, and thirteen unimplemented
scenarios failed. **A misconfigured gate fails identically to a real failure.**

Worse: diagnosing it took a second full agent run, because a failed run deleted
the worktree and committed nothing. The branch came back byte-identical to its
base. Fifteen minutes of agent time spent recovering information the first run
already had and threw away.

### Run 3: the account hit its spend limit

Which turned out to be the best possible test, because by then the fixes were
in:

```
❌ REQ-002  fail (2 attempts)  → harness/REQ-002
     Agent exited 1.
     │ You've hit your monthly spend limit · raise it at claude.ai/settings/usage
     └ full output: --format json · reproduce: --keep-worktrees
     ↳ the attempt is committed on harness/REQ-002 — review it
```

Before the fixes: `Agent exited 1`, and 861 lines of the agent's work deleted
along with the worktree.

### The tally

Ten defects, from three runs. The gate that approved without verifying. The
harness that blocked its own second run by leaving untracked files in the
project. A test that had been *weakened* to accommodate that, filtering the
offending directory out of its own clean-tree assertion in order to pass. A
report that captured the full failure output and then printed only its first
line. A default timeout that both real runs disproved.

None of them was visible by reading the code. Every one would have shipped.

---

## What this means for the "agents write all the code" idea

The strategic writing on spec-driven development tends to end at the same place:
eventually humans stop authoring code and only review specs.

I think that is directionally right and currently unsupported, and our own data
is the reason.

If you remove the human from writing, the gate becomes the only thing standing
between an agent's output and your main branch. We discovered — by running it,
not by reasoning about it — that **our gate approved work it had not verified**.
Not through a subtle bug. Through two ordinary design oversights that combined.

So the honest sequencing is the reverse of how it is usually presented:

> You do not earn the right to remove human authorship by adopting specs. You
> earn it by demonstrating that your gate can tell good work from bad — and the
> only way to demonstrate that is to run it, repeatedly, and count how often it
> is wrong in each direction.

We now instrument exactly that: how often the gate fails real work, and how often
it passes work it should not have. It is the metric that mattered and the one we
did not have.

---

## Adopting it without a big bang

Each level is useful alone and requires nothing above it.

```mermaid
graph LR
  L1["<b>L1 · ~1 hour</b><br/>Traceable specs<br/><code>onboard</code> · <code>adopt</code>"]
  L2["<b>L2 · ~1 hour</b><br/>A PR gate<br/><code>validate --strict-tdd</code>"]
  L3["<b>L3 · ~1 day</b><br/>Versioned domain packs<br/><code>specops add/sync/diff</code>"]
  L4["<b>L4 · ~1 week</b><br/>Agent-driven delivery<br/><code>agents init</code> · <code>harness run</code>"]
  L1 --> L2 --> L3 --> L4

  classDef l fill:#ebfbee,stroke:#2f9e44,color:#143;
  class L1,L2,L3,L4 l;
```

Brownfield is the expected case, not the exception. `csda onboard` reads an
existing repository and *proposes* the capabilities its layout already implies,
with the evidence for each, and writes nothing. `csda adopt` then installs the
spec skeleton without touching a line of source.

Most teams should stop at L2 and stay there for a while. A PR gate that fails
when a requirement loses its test is worth more than any amount of agent
orchestration on top of specs nobody trusts.

---

## Where it does not work yet

Three things, stated plainly.

**Multi-repository orchestration does not exist.** One specification cannot
decompose into work across several repositories. The unit is the project. For
now the issue tracker is the cross-repo identifier — `csda alm sync` keeps Jira
and Azure Boards in step — which is less elegant and much cheaper than the
alternative.

**Specs live in git, and that creates friction for non-developers.** This is the
sharpest criticism in the InfoQ piece and it lands. Our answer is not to move
specs out of git — git is what lets CI verify anything — but to publish
read-only surfaces for people who will never open a pull request.

**One dogfood project and one pilot is not a sample.** Nobody outside our own
repositories has used this in anger. Everything above is what we measured on our
own work, and I would not present it as more than that.

---

## The uncomfortable conclusion

The industry writing about spec-driven development is mostly strategy. It is
good strategy. But strategy has a way of describing the destination while
skipping the part where you discover your instruments were lying to you.

We built the pipeline. Running it three times found ten defects, including a gate
that approved work without checking it — which, had we shipped confidently
instead of running it, would have been a tool that automated the exact failure it
was designed to prevent.

If you are evaluating any of these tools, including ours, the question worth
asking is not what the specification format looks like. It is:

**Has anyone run the loop, and what broke?**

If the answer is no, the format does not matter yet.

---

*The tool is `create-spec-driven-app`, MIT-licensed and on npm. v0.6.0 at the
time of writing: 687 tests, 11 curated domain packs, 20 architecture decision
records, published with SLSA provenance and a multi-arch container image.*

```bash
npx create-spec-driven-app@latest onboard   # reads your repo, proposes capabilities
npx create-spec-driven-app@latest adopt     # writes the skeleton, touches no code
npx create-spec-driven-app@latest validate . --strict-tdd
```
