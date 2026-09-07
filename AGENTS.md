# Agent Instructions

This repository follows the shared agent baseline supplied by the active harness (concise communication, simplicity first, surgical changes, goal-driven execution). Repo-specific additions below.

## Project links

- **GitHub repo / issues (tracker of record):** [brennenlester/mainsail](https://github.com/brennenlester/mainsail)
- **Play (canonical):** [https://mainsail-brennen1.vercel.app](https://mainsail-brennen1.vercel.app) — after merge, share only this URL (not `*-git-codex-*` or other hashed preview URLs) unless the user asks for a pre-merge preview.
  - This hostname must track latest Production. GitHub Action `Alias canonical play URL` re-aliases it when `VERCEL_TOKEN` is set; otherwise run `./scripts/alias-canonical-play.sh` after a production deploy.
  - Auto-updating fallbacks (if the branded alias is temporarily stale): [mainsail-git-main-brennen1.vercel.app](https://mainsail-git-main-brennen1.vercel.app) or [poke-wine-kappa.vercel.app](https://poke-wine-kappa.vercel.app).
- **Linear project (historical, read-only):** [Ivyward](https://linear.app/brennen-lester/project/ivyward-f73601c7fa30) — BRE-* history only; never create or mutate Linear work for this project

## GitHub-Issues-first workflow

All implementation changes must be tied to a GitHub issue in this repo. GitHub Issues are the **only** tracker for new planning and implementation.

| Mode | When to use | Cursor skill |
|------|-------------|--------------|
| Planning | Work has no issue yet, or needs to be broken into PR-sized issues | `gh-issue-planning` |
| Implementation | Executing a specific issue or logical bundle | `gh-issue` |
| Tooling | Discover `gh` auth / issue commands | `gh-tools` |

Rules:

- Do not make repo changes unless the work is tied to a GitHub issue.
- If the user asks for a change without an issue, use `gh-issue-planning` first, then stop before implementation unless the user explicitly asks to continue.
- Use `gh-issue` when implementing a specific issue (e.g. `gh-issue #81`).
- Keep implementation briefs, review cycles, and shipped notes in **GitHub issue comments**, not committed repo markdown.
- **Linear is historical only.** Agents may *read* Linear (BRE-* issues, old comments) for context. Do **not** create, update, close, assign, label, or comment on Linear issues/projects for Ivyward work — including via Linear MCP/API. Route all new tracking to GitHub Issues.
- Deprecated aliases: `/linear-issue` → `gh-issue`, `/linear-issue-planning` → `gh-issue-planning`, `/linear-tools` → `gh-tools`.

## Git conventions

- **Default branch:** `main`
- **Canonical checkout:** the `[main]` entry from `git worktree list` (today `/Users/brennen/dev/mainsail`). Treat it as read-only orchestration space — do not implement issues there.
- **Feature branches:** `cursor/<issue-slug>` (e.g. `cursor/81-agents-linear-read-only`). Do **not** use the legacy `codex/` prefix for new branches.
- **Issue worktrees:** create as siblings under `/Users/brennen/dev/` named `mainsail-<short-slug>` (e.g. `/Users/brennen/dev/mainsail-81-agents-linear`). Prefer a dedicated worktree when `main` is dirty or the issue is non-trivial; move the agent root into that worktree before editing.
- Commit messages should reference the GitHub issue number (e.g. `#81`).

## Documentation

- **Repo docs:** durable product, setup, architecture, and user-facing documentation (README, etc.).
- **GitHub issue docs:** per-issue narrative — scope in the issue body; implementation/review/shipped notes in comments.
- Do not commit per-issue scratch markdown, implementation diaries, or review notes to the repo.

## Repo-specific conventions

**Pixels / SFX / atlas:** read `.cursor/skills/ivyward-assets/SKILL.md` when the work is a sprite, Imagine PNG, walk cycle, WAV, SFX, or atlas pack.

**Visual QA / HUD / browser:** read `.cursor/skills/ivyward-browser-qa/SKILL.md` when the work is visual QA, HUD, a screenshot, canvas check, or a browser playtest.
