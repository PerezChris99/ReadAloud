# Git contribution and release workflow

This repository deliberately uses one integration branch and one production branch. GitHub Actions workflows are disabled by project policy while the account's workflow quota is exhausted.

## Required branch flow

```mermaid
flowchart LR
    A[main: reviewed baseline] --> B[perez: focused implementation]
    B --> C[Meaningful commit(s)]
    C --> D[Pull request: perez → main]
    D --> E[Review diff and run manual checks]
    E --> F{Checks and scope acceptable?}
    F -->|No| B
    F -->|Yes| G[Merge PR]
    G --> H[Verify main and PR merge SHA]
    H --> I[Fast-forward perez to main]
```

1. Start new work only after fetching the latest `main` and fast-forwarding `perez` to it.
2. Implement one coherent phase on `perez`. Use descriptive commits that explain the change and why it matters; do not create empty, cosmetic, or spam commits.
3. Open a PR from `perez` into `main`. Keep the PR body specific about scope, tests run, results, and any checks that remain unverified.
4. Review the complete diff and run available tests/builds manually. No green CI status may be implied while workflows are disabled.
5. Merge only after the diff and available evidence are acceptable. Confirm the PR's merged state and resulting `main` SHA.
6. Fast-forward `perez` to the merged `main` SHA before starting another phase. Never force-push over unreviewed work or rewrite shared history merely to make branch counts look clean.
7. Repeat the flow for each meaningful phase; do not push directly to `main`.

## Branch and commit hygiene

- Intended long-lived branches: `main` and `perez` only.
- A branch ahead of `main` is pending work, not automatically an orphan. Bring it through a PR or explicitly document why it is discarded.
- A branch behind `main` should be fast-forwarded after the previous PR merges.
- Before declaring the repository clean, inspect all branch refs and tags, compare each branch to `main`, inspect open/closed PRs, and—when a full Git clone is available—run `git fsck --full --no-reflogs --unreachable`. The GitHub API alone cannot prove that no unreachable local objects exist.
- Do not delete branches or tags without verifying that their commits are merged or intentionally retired.
- Attribute authored commits to **Perez Chris <kweeziperez712@gmail.com>**. GitHub may create a separate merge commit under its own automation identity; preserve the authored commits and their meaningful messages.

## Manual checks while CI is disabled

Run from a clean checkout with the committed lockfile and required runtimes available:

```sh
npm ci
npm run test:all
npm run typecheck
npm run build:desktop
npm run build:android
npm run build:ios
python -m pytest apps/api/test
```

Some commands require platform-specific prerequisites: Windows/Tauri tooling, Android SDK, macOS/Xcode and signing credentials, Python dependencies, Tesseract, and optional speech-provider configuration. Record the commands actually run and their exit codes. Do not report a command as passed if it was not run.

## Release policy

- Do not publish a release tag or GitHub release that implies signed, installable artifacts exist until those artifacts have actually been built and verified.
- Keep release notes versioned and factual. Include the source commit, test evidence, platform artifact names, SHA-256 hashes, signing identity, measured installed size, and known limitations.
- The 25 MB mobile installed-size target is a measured acceptance gate, not a source-code estimate.
- A release is blocked by missing reproducible dependency installation, failed tests/builds, missing signing, unverified device acceptance, unresolved high/critical dependency findings, incomplete privacy/store disclosures, or unresolved licensing requirements.
- GitHub Actions remain absent until the owner explicitly re-enables workflows after quota recovery.
