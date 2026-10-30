# SilkOS engineering guide

## Mission and invariants
- Preserve the existing desktop's appearance, behavior, persistence, and platform integration.
- Improve maintainability and startup/lifecycle reliability without redesigning the desktop.
- Keep changes focused; do not introduce frameworks, bundlers, dependencies, or broad formatting churn without explicit scope.
- Preserve DOM IDs/classes, storage keys and data formats, IPC contracts, shortcuts, and app behavior.
- Do not change permissions, local assistant/app settings, or security boundaries to make a task pass.
- Never treat a passing Node suite as proof of visual, animation, or Linux hardware equivalence.

## Actual stack
- SilkOS package version: 1.0.0; entry point: `main.js`.
- JavaScript, HTML, and CSS; no renderer framework, TypeScript, or bundler configured.
- Main/preload and tests use CommonJS; renderer files are classic scripts.
- `package.json` requests Electron ^33.0.0 and electron-builder ^25.0.0.
- `package-lock.json` resolves Electron 33.4.11 and electron-builder 25.1.8.
- ISO CI uses Node 20 on Ubuntu 24.04; local Node is not pinned by package.json.
- Tests use Node's built-in `node:test` runner.
- Linux live image: Debian trixie, Openbox, Picom, and libinput touchpad gestures.

## Repository map and ownership
- `main.js`: Electron lifecycle, BrowserWindow, IPC handlers, OS services, native app launch, Store backend, and gesture monitoring (libinput).
- `preload.js`: contextBridge API exposed as `window.silk`; renderer-to-main boundary.
- `touchpad-gestures.js`: libinput `debug-events` parsing into shell gesture events; independently exercised by Node tests.
- `app/index.html`: minimal desktop DOM, startup overlay and scoped inline startup CSS, ordered script loading.
- `app/desktop.css`: extracted desktop styles, motion tokens, layout, and app styling.
- `app/startup.js`: temporary startup controller; not an app manager or network readiness tracker.
- `app/shell.js`: app registry, shared state/helpers, windows, dock, menus, settings application, gestures, startup scheduling.
- `app/apps/notes.js`: Notes editor, folders, search, local persistence, and save scheduling.
- `app/apps/finder.js`: Finder UI using the files bridge.
- `app/apps/store.js`: catalog/install UI and progress subscription ownership.
- `app/apps/utilities.js`: calculator, resource monitor, and About initializers.
- `app/apps/browser.js`: webview tabs, suggestions, bookmarks/history, find, and tab overview.
- `app/apps/settings.js`: Settings UI; coordinates with shell configuration and bridge services.
- `test/*.test.js`: files, lock, Store, workspaces, network controls, gesture parser and pipeline checks.
- `test/startup.test.js`, `test/renderer-contract.test.js`: mocked startup controller and renderer source/bridge contract checks; not real-browser visual tests.
- `linux/run.sh`, `run.bat`: source launchers with cached Electron runtimes.
- `distro/`: live-build configuration, hooks, session scripts, persistence and desktop integration.
- `.github/workflows/build-iso.yml`: .deb/ISO build workflow, not a renderer regression suite.
- `dist/`: packaging output; avoid unrelated generated artifacts in changes.
- `README.txt`, `README-LINUX.md`: user launch, ISO build, VM, and hardware guidance.

## Classic-script constraints
- Load `startup.js` before desktop/app scripts; keep desktop DOM available before app scripts.
- App order is notes, finder, store, utilities, browser, settings; `shell.js` is last.
- Do not add `type="module"`, `async`, or reordered/deferred loading as a mechanical refactor.
- Initializers are declared before shell bootstrap and invoked later by the shell.
- They resolve shared shell bindings such as `cfg`, `wins`, `store`, and `openTab` at invocation time.
- Top-level `let`/`const` bindings share the global lexical environment, not necessarily `window` properties.
- Avoid duplicate top-level names and early reads of shell bindings in app file initialization.
- Keep OS access behind the preload bridge; the BrowserWindow explicitly uses context isolation and enables webviews.
- Do not widen renderer Node access or bridge capabilities to bypass platform limitations.

## Motion and visual preservation
- Keep desktop CSS and existing animation logic stable during structural/startup work.
- Current stylesheet matches the committed extracted file; comparison with 501624c's inline CSS differs only in one comment character (replacement character versus em dash).
- CSS durations: tap .11s, UI .16s, popover .2s, spatial .28s, window .34s.
- Easing: `--ease` cubic-bezier(.32,.72,0,1), `--out` cubic-bezier(.45,0,.75,.25), `--spring` cubic-bezier(.22,1.2,.36,1).
- Preserve startup-app staggering at index * 100ms and each new window's show/focus timer at 180ms.
- Browser startup maximize remains 700ms plus its startup-list index * 100ms.
- These scheduled animations are not prerequisites for dismissing the startup overlay.
- Preserve Lite Mode, reduced-motion handling, gesture tracking/settling, dock magnification, and existing close/minimize/maximize transitions.
- Byte/source checks establish structure, not fully verified animation equivalence or a speed improvement.

## Startup contract and errors
- `index.html` presents a local overlay with a live status, busy state, and hidden reload/retry button.
- Its inline styles are scoped to startup elements/keyframes so first paint does not depend on desktop CSS.
- `startup.js` exposes temporary `window.silkStartup.ready()`; the final shell statement calls it.
- Ready means synchronous shell bootstrap reached its end, not that every app or service finished loading.
- Completion requires that signal, DOMContentLoaded/non-loading document state, and `link[href="desktop.css"].sheet`.
- Do not wait for optional IPC, network requests, webview navigation, or startup-app animation timers.
- While pending, capture-phase key handling prevents shell shortcuts and preserves retry-button interaction.
- Script/stylesheet resource errors and window errors before the core-ready signal retain an error screen with Try Again.
- A missing stylesheet sheet also fails completion; a startup-script load error has an inline HTML fallback.
- Retry reloads the page; there is no generic timeout for a missing core-ready signal.
- Success deletes `window.silkStartup` and removes keyboard, error, and DOMContentLoaded listeners.
- It marks `silkos-desktop-ready`; this is a readiness marker, not an established performance benchmark.
- OS reduced motion or `body.lite` removes the overlay immediately.
- Otherwise opacity fades for .16s; transitionend removes it, with a 200ms fallback timer.
- The transition listener and fallback timer are cleared when the overlay is removed.

## Lifecycle ownership
- The shell calls optional `el._dispose()` on accepted window close and for open windows on beforeunload.
- Close cancels that window's pending 180ms show timer; unload also saves the app session.
- Store clears its search timer and invokes its owned progress unsubscribe.
- `silk.store.onProgress(cb)` returns a function removing that exact IPC listener; do not remove other consumers' listeners.
- Browser clears suggestion/cursor timers, invalidates pending suggestions, removes its `.sug` node, and clears `openTab` only when it still owns the binding.
- Notes flushes a pending 320ms save on disposal; preserve pending edits through close/reload.
- Prefer explicit ownership and safe repeated cleanup; do not claim every app resource is already disposed.

## Commands
- `npm ci`: reproducible dependency installation from the lockfile.
- `npm start`: run `electron .` from the repository root.
- `npm test`: run `node --test`.
- `npm run build`: Windows portable build via electron-builder; output in `dist/`.
- `npm run build:linux`: x64 Linux .deb build, with publishing disabled.
- No lint or type-check script is configured; do not invent `npm run lint` or `npm run typecheck`.
- Qoder can inherit `ELECTRON_RUN_AS_NODE=1` (observed here); unset it for the app launch, not through repository or assistant settings.
- Git Bash/POSIX launch: `env -u ELECTRON_RUN_AS_NODE npm start`.
- Linux source launch: `./linux/run.sh`; see README-LINUX.md for prerequisites and platform caveats.
- README local ISO sequence: `npm install && npm run build:linux && ./distro/build-local.sh` on Debian/Ubuntu with Docker and sudo.
- That script runs privileged `debian:trixie` Docker with the repo mounted at `/work`, then `lb config` and `lb build`; use only for intentional ISO builds.
- ISO CI also supports workflow_dispatch and main pushes; outputs `silkos-iso` and optional `build-log` artifacts.

## Workflow, validation, and PR expectations
- Inspect the existing diff first; preserve unrelated in-progress work and avoid committing unless requested.
- Read actual implementation and tests before changing contracts; avoid assumptions from older README feature descriptions.
- Run relevant Node tests for implementation changes; source checks/mocked IPC do not exercise a real desktop or hardware.
- For startup work, manually check cold launch/reload, offline or slow optional services, startup app disabled, and session restore.
- Exercise reduced motion/Lite Mode, normal fade, script/CSS failure and retry, and no lingering startup global/keyboard interception after success.
- Reopen Browser/Store repeatedly; check orphan suggestions, duplicate progress callbacks, and close-before-show behavior.
- Edit Notes and immediately close/reload; verify the final pending edit survives.
- Compare dock, menus, window transitions, Launchpad, gestures, themes, settings, and persistence against the baseline.
- Test Linux power, radios, audio/brightness, native apps, persistence, and multitouch on suitable Linux hardware/VMs separately.
- Linux hardware remains untested in this Windows documentation task; VMs may not pass through multitouch.
- PRs should state scope, preserved contracts, commands actually run, observed results, manual coverage, and untested platforms.
- Distinguish planned validation from completed validation; do not assert speed gains or full animation equivalence without evidence.
