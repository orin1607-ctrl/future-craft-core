# Ownership & Independence

This document records the ownership of every component built during the
Dalia Development Environment project, and confirms that no part of the
system depends on any private developer's personal setup.

## Fully owned by the client (Yoni Atias)

Every item below is owned, controlled, and accessible only through
accounts and services that belong to the client. No external person
holds private or exclusive control over any of them.

| Component | Owner / Location |
|---|---|
| GitHub repository | `orin1607-ctrl/future-craft-core` — Yoni's GitHub account |
| All branches (`production`, `main`, `dev`, future) | Inside Yoni's repository |
| All workflows (`.github/workflows/*.yml`) | Inside Yoni's repository |
| Production Supabase project (`qasomfndnjuixgjmjwcm` — dalia-new) | Yoni's Supabase organisation |
| Staging Supabase project (`usfeoerkpcafxxlyuldl` — dalia-staging) | Yoni's Supabase organisation |
| Production VPS (Hostinger, IP 72.60.36.182) | Yoni's Hostinger account |
| Live domain `dalia-car.online` | Yoni |
| Anthropic Claude API account + `CLAUDE_API_KEY` | Yoni's Anthropic account |
| Every configuration file in this project | Inside Yoni's repository |
| Every documentation file (this file, `DEV_ENVIRONMENT.md`, etc.) | Inside Yoni's repository |
| Every script under `scripts/` | Inside Yoni's repository |
| Every Supabase Edge Function and secret | Inside Yoni's Supabase projects |

## What this means in practice

1. **No private developer setup is required.** Any developer can be
   added as a collaborator on the repository, given access to the
   staging Supabase project, and start working through this
   environment immediately. Nothing on a private machine is needed.

2. **No keys or credentials belong to any developer.** All API keys,
   tokens, and secrets are stored either in Supabase Edge Function
   Secrets or in `.env.local` files that exist only on each developer's
   machine — never in the repository, never in a private cloud account.

3. **No outside service holds critical configuration.** Every workflow,
   every script, every documentation file lives inside the repository
   that Yoni owns.

4. **Replacing or adding a developer requires zero technical work
   beyond access invitations.** A new developer:
   - Is added as a collaborator on the GitHub repository
   - Is added as a member to the staging Supabase project
   - Clones the repository, runs `bun install`, copies `.env.local.example`
     to `.env.local`, fills in the keys (provided by Yoni), and is
     productive within minutes

5. **No part of the system is locked to Naeem Dosh's account.** The
   Anthropic key, Supabase access, GitHub access, and VPS access are
   all owned by Yoni. Naeem holds collaborator-level access for as
   long as Yoni chooses to grant it; removing that access does not
   break any environment.

## Permanent independence from Miki's repository

As a deliberate architectural decision, no automatic flow exists
between Yoni's environments and Miki's repository. Any update from
Miki's side is brought into Yoni's repository only by explicit,
manual action.

## Confirmation

By accepting this delivery, both parties confirm that the items listed
above are fully owned and controlled by Yoni, and that the development
environment described in this project is independent of any specific
developer's personal setup.
