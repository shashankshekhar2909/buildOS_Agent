# BuildAgent Desktop

Tauri 2.x · native shell around the dashboard.

The desktop app is a thin native window pointing at the dashboard frontend.
Same UI as the browser, but ships as a Mac `.app` / Windows `.msi` / Linux
`.deb`/`.AppImage`.

## Prereqs

- Rust toolchain (`rustup default stable`)
- Platform deps:
  - macOS: Xcode CLI tools
  - Linux: `libwebkit2gtk-4.1-dev libsoup-3.0-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev` (Debian / Ubuntu)
  - Windows: WebView2 (preinstalled on Win11)
- pnpm

## Dev

```bash
# Terminal 1: run the dashboard
pnpm --filter buildagent-dashboard-web dev

# Terminal 2: launch desktop shell pointing at the dashboard
cd apps/desktop
pnpm install
pnpm tauri icon ../../apps/dashboard-web/src/app/icon.svg   # one-time, generates all platform icons
pnpm dev                                                    # opens native window @ http://localhost:3300
```

## Build a production binary

```bash
# Static export of the dashboard (not yet wired — see notes below)
cd apps/desktop
pnpm build
# -> src-tauri/target/release/bundle/{macos|deb|msi|...}
```

## Notes / TODO

- `tauri.conf.json` currently points `frontendDist` at the Next standalone
  build output. Cleaner path is `output: "export"` on the dashboard so
  Tauri bundles the static HTML/JS directly into the binary. That switch
  conflicts with the docker `standalone` output — needs a build-mode env
  flag in `next.config.mjs`.
- No custom Rust commands yet — pure web shell. Adding native menus, file
  picker, system tray, deep links etc. lives in `src-tauri/src/lib.rs`.
- Icons must be generated via `pnpm tauri icon` before first `pnpm build`.
