# QMD Evaluation for Lucy QA

This document evaluates whether QMD should be added now as phase 2 for Lucy QA.

## Short answer

Recommendation:
- do not make QMD a required dependency yet
- do add QMD as an optional phase-2 retrieval accelerator after the current storage model is stable enough

Blunt conclusion:
- QMD is now more justified than before
- but it should still be optional, not foundational

## Why this evaluation is happening now

Earlier, Lucy QA only had:
- simple vault notes
- state files
- compact session summaries

That made semantic retrieval premature, because the stored knowledge was still too thin.

Now Lucy QA has a stronger memory base:
- Obsidian-style durable notes
- restart-safe state
- session-summary snapshots
- rolling session journal
- archived journals
- full-text search across notes and summaries

That means QMD can now be evaluated against a better storage structure instead of compensating for missing memory.

## What QMD appears to be good at

From the currently available public material, QMD appears useful for:
- local markdown search
- semantic search over markdown collections
- hybrid retrieval using keyword + vector search
- reranking for better relevance
- keeping search local to the machine
- helping agents search a vault without loading large files into context too early

This is attractive for Lucy QA because Lucy QA memory is markdown-heavy and local-first.

## What Lucy QA currently does well without QMD

Lucy QA already has a solid baseline without semantic retrieval:
- vault-based markdown memory
- session journal files
- session-summary archives
- full-text note search
- startup resume behavior
- searchable project knowledge in plain files

For many exact-match or near-exact-match cases, this is already enough.

Examples where the current system is already fine:
- find a known run ID
- find a bug draft by exact wording
- search for a known project name
- search recent session summaries by obvious keywords
- inspect journals manually

## Where QMD would genuinely help

QMD becomes valuable when the vault grows and the wording mismatch problem becomes real.

Examples:
- asking "what did we decide about the login redirect weirdness" when the note used different wording
- finding related bug patterns across multiple projects
- retrieving relevant past QA heuristics from journals without exact keyword overlap
- locating similar failures or decisions when the user remembers meaning but not exact terms
- reducing context waste by ranking files before Lucy QA reads them

So the main value of QMD for Lucy QA is not basic storage.
It is retrieval quality.

## Why QMD should still not be mandatory yet

### 1. Storage is still phase 1
Lucy QA memory structure is now much better, but still not final.

Still true today:
- note classes are lightweight
- journaling is phase 1, not transcript-grade
- retrieval targets are still evolving
- project/run/bug schema design is not fully mature

If QMD is made mandatory too early, Lucy QA risks optimizing search over still-changing memory structure.

### 2. Operational complexity would go up
Adding QMD likely means more moving parts such as:
- install/setup requirements
- collection/index management
- embed/build lifecycle
- update/reindex logic
- failure modes when the index is stale or missing

That is acceptable for an optional enhancement.
It is less acceptable as a hard dependency right now.

### 3. Current full-text search is still useful and explainable
The current search has advantages:
- simple
- local
- inspectable
- easy to debug
- no hidden embedding/index lifecycle

That is still a good default for phase 1 memory.

## Recommendation

### Recommended decision now
Adopt QMD as:
- optional phase-2 retrieval enhancement
- not required for Lucy QA core operation
- not the source of truth

### Keep as source of truth
Continue using the Obsidian-style vault as canonical storage for:
- notes
- journals
- session summaries
- state-derived artifacts

### Use QMD only for retrieval acceleration
If added, QMD should be used for:
- semantic vault search
- hybrid retrieval for journals/notes
- ranking candidate files before loading them into Lucy QA context

Not for:
- replacing the vault
- replacing current plain-file persistence
- becoming the only way Lucy QA can remember things

## Best integration model

The best architecture for Lucy QA would be:

1. vault remains canonical storage
2. full-text search remains baseline fallback
3. QMD is added as an optional semantic/hybrid search layer
4. Lucy QA falls back gracefully when QMD is unavailable

That means:
- no lock-in
- no hard failure if QMD is missing
- easier debugging
- easier portability

## Suggested rollout plan

### Phase 2A: evaluation spike
Do a small integration spike only.

Success criteria:
- can index the Lucy QA vault locally
- can query notes/journals with semantic or hybrid retrieval
- returns useful results for realistic Lucy QA queries
- degrades cleanly when QMD is absent

Suggested test queries:
- "what were the unresolved checkout login issues"
- "find past runs related to redirect loop"
- "what bug patterns did we record for staging login"
- "what did we decide about flaky checkout flow"

### Phase 2B: optional CLI command
If the spike looks good, add something like:
- memory search --semantic
or
- memory search --engine qmd

Keep default behavior as the current full-text search unless QMD clearly proves better and reliable enough.

### Phase 2C: selective auto-use
Only after reliability is clear, let Lucy QA automatically prefer QMD for:
- broad natural-language recall
- journal retrieval
- cross-project memory lookup

But keep full-text fallback always available.

## Adoption criteria

QMD should be added beyond experiment only if most of these are true:
- retrieval quality is clearly better than current full-text search for real Lucy QA queries
- setup is local-first and practical
- indexing is reliable enough not to become routine maintenance burden
- failure behavior is graceful
- it does not slow down normal Lucy QA workflows too much
- the value is visible specifically on journals and older project memory, not just toy examples

## Recommendation grade

My current grade is:
- should we evaluate it now? yes
- should we integrate it as optional phase 2? probably yes
- should we make it core/mandatory now? no

## Final verdict

QMD now makes sense as the next retrieval experiment because Lucy QA finally has enough structured memory to benefit from better recall.

But Lucy QA should still keep this architecture:
- vault first
- full-text baseline
- QMD optional enhancement

That is the safest and most maintainable path.
