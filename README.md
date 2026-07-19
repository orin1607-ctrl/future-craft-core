# Fleet Management System

## Project info

A comprehensive fleet and vehicle management platform built with modern web technologies.

## Tech Stack

- **Frontend:** React, TypeScript, Vite, Tailwind CSS, shadcn-ui
- **Backend:** Supabase (Database, Auth, Edge Functions, Storage)
- **Charts:** Recharts

## Environments & deploy

| Env | Frontend | Supabase |
|-----|----------|----------|
| Staging | https://orin1607-ctrl.github.io/future-craft-core/ | `usfeoerkpcafxxlyuldl` |
| Preview | http://preview.dalia-car.online | Production project |
| Production | https://dalia-car.online | `qasomfndnjuixgjmjwcm` |

- Canonical secrets map (names only): [`docs/ENVIRONMENT-AND-SECRETS-HE.md`](docs/ENVIRONMENT-AND-SECRETS-HE.md)
- Owner-only actions: [`docs/OWNER-ACTIONS-FINAL-HE.md`](docs/OWNER-ACTIONS-FINAL-HE.md)
- Deploy automation: [`docs/deploy-automation-setup.md`](docs/deploy-automation-setup.md)
- Health check: `npm run env:health` (never prints secret values)
- Local env templates: `.env.staging.example` / `.env.production.example`

Work branch for CI: **`main`**.

## Getting Started

```sh
# Clone the repository
git clone <YOUR_GIT_URL>

# Navigate to the project directory
cd <YOUR_PROJECT_NAME>

# Install dependencies
npm i

# Copy Staging template (do not use legacy project refs)
cp .env.staging.example .env.local
# fill anon/publishable keys from Supabase Dashboard

# Start the development server
npm run dev

# Optional: verify env hygiene + remote health (needs token in env)
npm run env:health
```

## Features

- Vehicle management and tracking
- Driver management with health declarations
- Vehicle exchange forms between drivers
- Fault reporting and tracking
- Service orders management
- Expense tracking
- Route planning
- Vehicle inspections
- Real-time notifications
- Role-based access control
- Multi-company support
