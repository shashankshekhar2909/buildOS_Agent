# BuildAgent Mobile

Expo Router · React Native · TanStack Query

Three-tab control surface for BuildAgent on iOS / Android / Web:

- **Runs** — live agent run history with state pills
- **Approvals** — pending approvals with one-tap approve/deny
- **Agents** — pick an agent + model, run from your phone

## Setup

```bash
cd apps/mobile
pnpm install                       # or npm/yarn/bun
```

## Configure API endpoint

Edit `app.json` -> `expo.extra.apiUrl` to point at your BuildAgent API.

Default is the tailnet IP `http://100.64.108.107:8800` — change it.

Tokens persist in `expo-secure-store` (Keychain on iOS, EncryptedSharedPreferences on Android).

## Run

```bash
pnpm start                         # interactive picker
pnpm ios                           # iOS simulator
pnpm android                       # Android emulator
pnpm web                           # browser
```

Or scan the QR code with Expo Go.

## What's wired

- JWT login + automatic refresh-on-401 retry (`src/api.ts`)
- React Query polling every 8s
- Route guard auto-redirects unauth -> `/login`, auth -> `/runs`

## What's not (yet)

- WebSocket live updates (mobile bridge TBD)
- Agent-run detail screen with step inspector
- Push notifications on approval-needed
- Connector setup (Telegram/Slack token entry)
