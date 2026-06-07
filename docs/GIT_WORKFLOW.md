# Git Workflow

The repository has **two long-lived branches**, each with a clear role.
Nothing reaches the live system without Yoni's two manual approvals.

## Branches

| Branch | Role | Who pushes here |
|---|---|---|
| `production` | **Default branch**. What the live VPS deploys from. | Updated via Pull Request from `dev`, merged by Yoni. |
| `dev` | Day-to-day work in Cursor by you, Naeem, or any future developer | Anyone working in Cursor |

There is no `main` branch (removed during the cleanup — `production` is the
default). There is no `miki-mirror` branch (removed; no automatic flow from
Miki's repository).

## The two approval gates

```
 +--------+     1. work  +--------+   GATE 1: PR merge   +-------------+
 | Cursor | -----------> | dev    | -------------------> | production  |
 |  (you) |    & push    | branch | (Yoni reviews diff,  | branch      |
 +--------+              +--------+   clicks Merge)      +------+------+
                                                                |
                                                                | GATE 2: Yoni
                                                                | clicks "Update
                                                                | Code" / "Update
                                                                | Database" in
                                                                | Super Admin
                                                                v
                                                       +-----------------+
                                                       | dalia-car.online|
                                                       |   (live system) |
                                                       +-----------------+
```

Both gates are required. The live system has no other path in.

## Day-to-day steps

1. **Pull `dev`** and branch off for any non-trivial work:
   ```bash
   git checkout dev
   git pull
   git checkout -b feature/<short-name>      # optional but recommended
   ```

2. **Before a big change**, take a safety backup:
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

6. **Update staging** so Yoni can review your changes live:
   - Open the repo's **Actions** tab on GitHub
   - Run the **"Deploy Staging to GitHub Pages"** workflow
   - This builds the `dev` branch and publishes it to the staging URL
   - The workflow is **manual-only** (no automatic deploys)

7. **Test on staging** at:
   `https://orin1607-ctrl.github.io/future-craft-core/`

   Log in with the same credentials you use on the live system. Staging
   uses a separate Supabase project (`dalia-staging`); changes here
   never reach the live database.

8. **Open a Pull Request from `dev` into `production`** on GitHub.
   This is **Gate 1**. Yoni reviews the exact code diff and merges when
   satisfied.

9. **Yoni clicks "Update Code"** (and "Update Database" if migrations
   are included) in the live Super Admin panel at `dalia-car.online`.
   This is **Gate 2**. Only this click puts the change in front of
   customers.

## What never happens

- Direct push to `production` from Cursor or from a developer machine.
- Automatic deploys to live customers.
- Any sync from Miki's repository into this one.
- Any third deployment URL or alternative path.

The architecture is intentionally simple: two branches, two gates, one
live system.
