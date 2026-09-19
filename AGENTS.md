# Bitwiser contributor instructions

## Start here

- Read this file, [architecture](docs/architecture.md), and [development workflow](docs/development-workflow.md), then inspect the relevant source and tests.
- This repository is `hyun090305/Bitwiser-dev`; the default integration branch is `main`. Verify the remote, branch, HEAD, and working-tree status before editing.
- Preserve existing user changes. Use a task branch or isolated checkout; do not reset unrelated work.
- Check for more specific `AGENTS.md` / `AGENTS.override.md` instructions in the directories you touch.

## Issue is the implementation contract

- When given an Issue, fetch its current body and discussion. Treat the maintained body (goal, scope, constraints, and acceptance criteria) as the source of truth for requested behavior.
- Use the recorded base commit to understand the spec, then compare it with the actual checkout. Re-read affected code when the base has moved; never silently implement against stale assumptions.
- Distinguish accepted decisions from suggestions in comments. Incorporate explicit user/maintainer decisions into the Issue body when authorized; do not treat every comment as a new requirement.
- Preserve stable acceptance IDs (`AC-1`, `AC-2`, etc.) through implementation and review. Do not weaken criteria or tests to make a change pass.
- Resolve ordinary implementation choices from the code. Ask only when unresolved requirements change observable behavior or conflict with the requested scope. Continue independent work.
- If Issue access is unavailable, report it and request/provide an exact body snapshot. Do not invent requirements or claim to have read the Issue.
- Follow the user's explicit current instructions; reconcile any resulting scope change with the Issue so later reviews have the same contract.

## Preserve Bitwiser behavior

- Keep changes focused. Follow existing JavaScript module patterns; avoid unrelated refactors, dependencies, formatting sweeps, and generated-data churn.
- Preserve full web, Electron, and demo entry points. Shared modules must keep the demo's offline/local-storage boundary and full-version account/ranking paths intact.
- Preserve stage IDs, unlock paths, Korean/English parity, fixed IO, and existing save compatibility unless the Issue explicitly changes them.
- Keep combinational evaluation separate from time: rendering/input preview must not advance D memory. A tick samples all next states and commits them together. Failed ticks must not partially mutate state.
- Preserve grading observation timing (`before_tick` / `after_tick`) and the divider's explicit contract. Incomplete/cancelled grading is not a pass. Result views/playback must reflect the grader's trace.
- Reuse circuit snapshots and versioned records. Preserve v2 read/v3 write compatibility and D/EN roles; do not persist transient Q/tick/button state as a circuit design.
- Cost/ranking changes must preserve version checks and historical records. Keep the two language files' star thresholds aligned.
- See the linked domain documents in architecture.md before changing these contracts. They describe current behavior, not permission to expand the task.

## Validation

- Inspect `package.json` for real commands; there is no generic `npm run build` or lint script.
- For JavaScript, circuit, stage, or data behavior changes, run `npm test`, then the browser/Electron checks relevant to the changed surface in the workflow's validation table.
- For shared web/demo markup, styles, modules, or catalog changes, also run `npm run build:demo`.
- For documentation/template-only changes, check links, referenced paths/commands, template structure, and `git diff --check`; do not add product tests just for prose.
- `stages:generate`, `stages:memory20`, and `stages:compact` rewrite stage data. Run them only for an intended stage-data change, then review the generated diff.
- Report commands actually run, outcomes, and unverified checks with reasons. Historical test counts in docs are not evidence for the current commit.
- Keep generated build/test outputs, credentials, and local runtime caches out of commits.

## Pull requests

- Implement on a task branch and open a PR when requested/authorized by the task. Use [.github/pull_request_template.md](.github/pull_request_template.md).
- Link the Issue with `Closes #NUMBER` only if the PR delivers the whole Issue; use `Refs #NUMBER` for partial delivery.
- Map every acceptance ID to changed code/docs, validation evidence, and a status: met, unmet, or unverified. Document deviations and remaining limitations.
- Recheck the latest Issue and complete diff before requesting review. Update the PR description when scope changes.
- Do not merge, deploy, or change repository/service settings unless the user's task authorizes those actions.

## Code Review Rules

- Read the linked Issue and relevant code, then compare every acceptance criterion with the complete PR diff and evidence. A green test run or PR summary alone does not prove the requested behavior.
- Check regressions in the affected full web/demo/Electron paths, stage/save compatibility, atomic D ticks, grading observation boundaries, and versioned cost records. Apply only checks relevant to the diff.
- Report actionable findings with the criterion ID (when relevant), concrete trigger, expected/actual behavior, and precise file/line. Distinguish an implementation defect from missing validation evidence. Never claim an unrun check passed.
