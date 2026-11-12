# Git Workflow

## Branch naming

Branches are `<type>/<short-description>`, using the same types as commits: `feat/`, `fix/`, `docs/`, `chore/`, and so on (for example `fix/isolated-session-capture`, `chore/bump-node-22.23.4`). Dependabot uses `dependabot/…`. Branches named `release/<version>` are special: merging a PR from one triggers `.github/workflows/release.yml`, so never use that prefix for ordinary work.

The default branch is `main`; open PRs against it.

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/), enforced by `commitlint.config.cjs` (extends `@commitlint/config-conventional`):

- Allowed types: `feat`, `fix`, `docs`, `chore`, `style`, `refactor`, `ci`, `test`, `revert`, `perf`, `vercel`.
- No scope list is enforced; optional scopes such as `fix(callback):` or `fix(security):` are used in history.
- Husky runs commitlint in the `commit-msg` hook (`.husky/commit-msg`); CI re-checks every commit on the PR.
- Header, body and footer follow the `config-conventional` limits. Don't bypass hooks with `--no-verify`.

## Pull requests

- There is no local `.github/PULL_REQUEST_TEMPLATE.md` and no `CONTRIBUTING.md` in this repo, so the Auth0 org-level [PR template](https://github.com/auth0/.github/blob/master/.github/PULL_REQUEST_TEMPLATE.md) applies: Description, References, Testing, and a checklist covering test coverage, docs for new or changed functionality, and the correct base branch.
- CI (`.github/workflows/ci.yml`) runs commitlint, lint, build and test on PRs to `main`. All must pass.
- Don't edit `.version` or `package.json` `version` in a feature PR; release PRs do that.
