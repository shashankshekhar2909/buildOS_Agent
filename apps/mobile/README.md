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
- WebSocket bridge (`src/ws.ts`) — invalidates React Query caches on
  `agent_run.*` / `approval.*` / `task.*` events. Auto-reconnect.
- React Query polling 30s as safety net (WS is primary refresh signal)
- Route guard auto-redirects unauth -> `/login`, auth -> `/runs`
- Run detail screen `/run/[id]` — step trace + inline approve/deny when
  the run is paused on an approval

## Push notifications

- On first sign-in the app requests Notifications permission, fetches an
  Expo push token, and POSTs it to `/v1/devices` (token persists per-user).
- Backend `app/push.py` sends to all of a user's device tokens via
  `https://exp.host/--/api/v2/push/send` whenever an agent run pauses
  on an approval.
- Tapping the push opens the corresponding `/run/{id}` detail screen.
- Simulator/emulator can't receive push — must run on a real device.

## What's not (yet)

- Connector setup (Telegram/Slack token entry)
- Memory tab
