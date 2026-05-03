---
name: commit-cycle
description: At every successful red→green and green→refactor, write a git commit with a structured message including tdd_session_id. Use to keep TDD cycles atomic in git history.
---

# Commit at every successful TDD cycle transition

Each accepted phase transition is a checkpoint. Commit at:

- **red→green**: the test now passes. Commit message:
  `feat(<scope>): <test name> [tdd:<tdd_session_id>:red→green]`
- **green→refactor**: refactoring is complete and all tests still pass. Commit message:
  `refactor(<scope>): <what changed> [tdd:<tdd_session_id>:green→refactor]`

## Rules

1. The commit hash is captured by the post-commit hook (which records `commits` and `run_changed_files` rows). The hook reads the bracketed `[tdd:<id>:<phase>→<phase>]` tag to associate the commit with the TDD session.
2. Never commit during `red` itself — by definition the suite is failing.
3. If you have to skip a refactor (because none was needed), commit the green state directly: `feat(<scope>): <test name> [tdd:<tdd_session_id>:green]`.

## Reusable outside TDD

Other workflows can adopt the bracketed-tag convention to make their git history machine-queryable.
