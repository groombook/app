# Contributing to GroomBook

## Branch Strategy

GroomBook uses a three-branch GitOps model:

| Branch | Environment | Purpose |
|--------|-------------|---------|
| `dev` | Development | Active development target — all feature/fix PRs target this branch |
| `uat` | UAT / Staging | Promoted from `dev` by the CTO for acceptance testing |
| `main` | Production | Promoted from `uat` by the CEO; triggers production deployment |

**Never open a PR directly to `uat` or `main`.** All work flows through `dev` first.

## Developer Workflow

1. **Branch from `dev`** — create a feature or fix branch:
   ```bash
   git checkout dev
   git pull origin dev
   git checkout -b feat/my-feature
   ```

2. **Open a PR targeting `dev`** — include the issue identifier in the title and cc @cpfarhood:
   ```bash
   gh pr create --base dev --title "feat: description (GRO-NNN)" \
     --body $'Closes GRO-NNN\n\ncc @cpfarhood'
   ```

3. **Pipeline gates before merge to `dev`:**
   - QA (Lint Roller) reviews first — code quality, test coverage, CI pass
   - CTO (The Dogfather) reviews second — architecture and final approval
   - Both must approve; 2 approving reviews required by branch protection

## Promotion Flow

### Dev → UAT

After merging to `dev`, the CTO opens a PR from `dev` → `uat`:

```bash
gh pr create --base uat --head dev \
  --title "chore: promote dev to uat (YYYY.MM.DD)" \
  --body $'Promoting dev to UAT for regression and security review.\n\ncc @cpfarhood'
```

Gates:
- Shedward Scissorhands runs regression/acceptance tests
- Barkley Trimsworth performs security review
- CTO approves and merges (1 approving review required)

### UAT → Main (Production)

After UAT passes, the CTO opens a PR from `uat` → `main` and assigns it to the CEO:

```bash
gh pr create --base main --head uat \
  --title "chore: promote uat to main (YYYY.MM.DD)" \
  --body $'Promoting UAT to production.\n\ncc @cpfarhood'
```

Gates:
- CEO (Scrubs McBarkley) reviews for business alignment and merges
- 1 approving review required; triggers auto-deploy to Production

## Branch Protection Summary

| Branch | Required Approvals | Who approves |
|--------|--------------------|-------------|
| `dev` | 2 | QA (Lint Roller) + CTO (The Dogfather) |
| `uat` | 1 | CTO (The Dogfather) |
| `main` | 1 | CEO (Scrubs McBarkley) |

Force-pushes and branch deletions are disabled on all three branches.

## Commit Style

Use [Conventional Commits](https://www.conventionalcommits.org/):
- `feat:` — new feature
- `fix:` — bug fix
- `chore:` — maintenance (dependency updates, build config, promotions)
- `docs:` — documentation only
- `ci:` — CI/CD changes
- `refactor:` — code restructure without behaviour change

Reference the Paperclip issue in the commit body: `Refs GRO-NNN`.

## Questions?

Open a Paperclip issue in the GRO project or ask in the team channel.
