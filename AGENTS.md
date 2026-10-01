## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the five default triage labels. See `docs/agents/triage-labels.md`.

### Domain docs

Use the single-context layout. See `docs/agents/domain.md`.

### Issue completion commits

- After an issue passes acceptance, prepare exactly one coherent commit containing that issue's accepted project changes.
- Before running `git commit`, report the exact files and purpose of the staged payload, include the completed verification, and ask the user for explicit approval. Commit only after the user approves that payload.
- Stage issue-scoped files deliberately. Keep local evidence, generated artifacts, caches, and unrelated user assets out of the commit.

### Decision synchronization

At each phase boundary, and before tickets are created, implementation starts or resumes, or a ticket closes, check whether a decision confirmed after the current spec or tickets changes the product goal, observable behaviour, constraints, architecture, or acceptance criteria.

- Synchronize product goals and observable behaviour to the canonical spec and every affected open ticket before implementation continues.
- Create or supersede an ADR only when the decision is hard to reverse, surprising without context, and the result of a real trade-off. Preserve superseded decisions as history.
- Keep open-ticket acceptance criteria and blocking edges aligned with the updated spec. Preserve closed tickets; represent later changes with a linked follow-up ticket.
- Report the artifacts changed and any unresolved conflict. For external tracker writes, follow the project's execution and permission rules.
- This check complements the installed skills; skill invocation remains governed by each skill's metadata and explicit user invocations.
