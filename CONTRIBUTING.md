# Contributing

Start with an issue. Maintainers review the proposal and apply `status:approved` before implementation begins.

## Quick path

1. Open a bug or feature issue and wait for approval.
2. Create a branch named `type/description`, for example `fix/handle-empty-history`.
3. Make focused changes, verify them locally, and open a PR that closes the approved issue.

## Conventions

Branches must match:

```text
^(feat|fix|chore|docs|style|refactor|perf|test|build|ci|revert)/[a-z0-9._-]+$
```

Use Conventional Commits:

```text
type(scope): short description
```

Valid types are `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`, `revert`, `style`, and `test`. Do not add AI attribution or `Co-Authored-By` trailers.

## Local verification

```bash
npm ci
npm run check
npm run pack:dry-run
```

`npm run check` runs TypeScript checking, tests, and package-file validation.

## Releases

Releases are maintainer-managed and currently unavailable pending package identity and trusted-publishing configuration.

## Pull requests

Every PR must:

- Include `Closes #<issue-number>`, `Fixes #<issue-number>`, or `Resolves #<issue-number>` in its body.
- Link an issue labeled `status:approved`.
- Have exactly one `type:*` label.
- Include a summary, change list, and test plan using the PR template.
- Keep the change focused and update tests or documentation when needed.
