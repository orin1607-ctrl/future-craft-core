# Git Workflow

The repository has three long-lived branches, each with a clear role.
Nothing reaches the live system without manual approval.

## Branches

| Branch | Role | Who pushes here |
|---|---|---|
| `main` | Default branch; mirrors the latest deployed code | Naeem (or future devs) via PR or sync |
| `production` | What the live VPS deploys from | Naeem (or future devs) via PR — never directly |
| `dev` | Day-to-day work in Cursor | Anyone working in Cursor |

## The flow

```
 +--------+     1. work +--------+   2. PR review   +-------------+
 | Cursor | ----------> | dev    | ---------------> | production  |
 |  (you) |    & push   | branch |  (Naeem / Yoni)  | branch      |
 +--------+             +--------+                  +------+------+
                                                           |
                                                           | 3. Yoni clicks
                                                           |   "Update Code"
                                                           v
                                                  +-----------------+
                                                  | dalia-car.online|
                                                  |   (live system) |
                                                  +-----------------+
```

## Day-to-day steps

1. **Pull `dev` and branch off it** for any non-trivial work:
   ```bash
   git checkout dev
   git pull
   git checkout -b feature/<short-name>      # optional but recommended
   ```

2. **Before a big change**, take a backup:
   ```bash
   ./scripts/dev-backup.sh "what you're about to do"
   ```

3. **Work in Cursor** — make changes, run `bun run dev`, test in the
   browser. Mobile preview: see `docs/MOBILE_PREVIEW.md`.

4. **Commit small, meaningful units**:
   ```bash
   git add <files>
   git commit -m "feat(vehicles): add owner filter to list"
   ```

5. **Push to `dev`**:
   ```bash
   git push origin <your-branch>
   # or, if you worked directly on dev:
   git push origin dev
   ```

6. **Open a Pull Request** on GitHub: from your feature branch (or
   `dev`) into `production`. Add a short description: what changed,
   why, how to test.

7. **Review + merge** — Naeem reviews; once approved, merge to
   `production`.

8. **Yoni clicks "Update Code"** in the live Super Admin panel to
   deploy. If the change includes a migration, Yoni also clicks
   "Update Database".

## What never happens

- Direct push to `production` from Cursor.
- Direct push to `main` from Cursor.
- Force-push to any shared branch.
- Pushing `.env*` files, large binaries, or anything in
  `.dev-backups/`.

## What if you make a mistake

- Made a wrong change but haven't committed? `git restore .`
- Committed but haven't pushed? `git reset --soft HEAD~1` (keeps changes
  staged) or `git reset --hard HEAD~1` (discards them).
- Pushed something wrong to `dev`? Make a follow-up commit that
  reverts it. Don't force-push.
- Wiped work you needed? Look in `.dev-backups/log.txt` for backup
  branches.

## When you need to bring something from Miki's side

Miki's environment is permanently disconnected from this workflow.
There is no automatic sync. If Yoni asks for a specific feature/fix
from Miki:

1. The integrating developer (Naeem today) reviews Miki's repo
2. Manually copies the wanted changes into a feature branch on this
   repository
3. Opens a PR into `dev` or `production` as appropriate
4. Yoni reviews, then approves the merge and clicks "Update Code"

Nothing flows automatically from Miki. Ever.
