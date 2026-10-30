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
- Linux live image: Debian trixie, Openbox, Picom, libinput touchpad gestures, WhiteSur theming for native windows, and canonical dbusmenu global menus for native GTK apps.

## Repository map and ownership
- `main.js`: Electron lifecycle, BrowserWindow, IPC handlers, OS services, native app launch, Store backend, gesture monitoring (libinput), and the native menu helper subprocess. Store search goes straight to Flathub's HTTPS API and only falls back to `flatpak search`, so nothing waits on the multi-megabyte appstream download except the installed-versus-latest comparison.
- `preload.js`: contextBridge API exposed as `window.silk`; renderer-to-main boundary.
- `touchpad-gestures.js`: libinput `debug-events` parsing into shell gesture events; independently exercised by Node tests. Gesture lines are read from their timestamp, not a fixed field position, because `debug-events` prefixes a right-aligned batch count to every event after the first in a dispatch.
- `native-menu.js`: com.canonical.dbusmenu property and JSON-frame conversion for native app menus; independently exercised by Node tests. The helper that owns the D-Bus conversation is `distro/config/includes.chroot/usr/local/bin/silkos-appmenu`.
- `app/index.html`: minimal desktop DOM, startup overlay and scoped inline startup CSS, ordered script loading.
- `app/desktop.css`: extracted desktop styles, motion tokens, layout, and app styling.
- `app/startup.js`: temporary startup controller; not an app manager or network readiness tracker.
- `app/shell.js`: app registry, shared state/helpers, windows, dock, menus, settings application, gestures, startup scheduling.
- `app/apps/notes.js`: Notes editor, folders, search, local persistence, and save scheduling.
- `app/apps/finder.js`: Finder file manager: sidebar places, list toolbar, inline rename and folder creation, move by drop, Trash, search, sortable columns, hidden files, and lazy stat hydration; all writes go through the files bridge.
- `app/apps/store.js`: catalog/install UI and progress subscription ownership; finished actions also post through `window.silkNotify`.
- `app/apps/utilities.js`: calculator, resource monitor, and About initializers.
- `app/apps/browser.js`: webview tabs, suggestions, bookmarks/history, find, and tab overview.
- `app/apps/settings.js`: Settings UI; coordinates with shell configuration and bridge services.
- `test/*.test.js`: files, lock, Store, workspaces, network controls, audio/captive-portal/Finder operations, gesture and native-menu parsers and pipelines, and native theming/animation source guards.
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
- The Control Center is one box with two layers: `.cc-main` (tiles) and `.cc-detail` (radio panes) that swap with a slide. While a pane is open the popover animates its height to that pane (measured in a `.measuring` state with the tiles out of flow), so a two-network list does not leave a tall empty sheet; closing animates back to the tile grid.
- `.measuring` turns transitions off, so it must not change the property being animated: the probe keeps `translateX(100%)` on `.cc-detail` while the pane is closed (`.cc.measuring:not(.detail-open)`), otherwise the flattened transform becomes the start value and only the way back slides. `paneHeight` therefore runs before `detail-open` is added, and anything that refits the pane during the slide is deferred by `paneSettled`/`settlePane`.
- `body.desk-expose` is what actually moves the windows; `--desk-opacity/-scale/-y` only say how far. The swipe adds the class when the gesture begins, so `settleDesktopExpose` adds it too — the Super+D shortcut settles straight to one end and never passes through `beginDesktopExpose`.
- `.lpg` is both the Launchpad grid and its frosted card: it hugs its rows (`width:fit-content`, three-column floor), centres itself with `margin:auto 0` so filtering grows it around its middle, and fades with `--lp-progress` a little ahead of the tiles, so the card and the icons paint the same filtered gesture value.
- Gesture travel is filtered by `smoothGesture`: a 60ms exponential rAF filter over the painted progress. `state.progress`, speed and the commit decision keep the raw libinput travel, settle transitions start from the last painted frame via `cancelGestureSmoothing`, and reduce motion paints unfiltered.
- During a desktop swipe every window paints its glass as a scroll-attached wallpaper copy (`prepareSwipeVibrancy`, `--vibe-w/h/x/y`), because `background-attachment:fixed` repaints once per window per frame and phases against the moving window. The variables are removed when the swipe clears.
- The menu bar sits at z-index 9600, above the Launchpad layer (9400), so it stays crisp and clickable while Launchpad is open; dropdowns and the switcher (9800) and the lock screen (11000) still paint over it. Launchpad hides the Dock (`body.launchpad-open #dockwrap`) rather than leaving it floating on the frosted desk.
- Any element whose class rule sets `display` needs an explicit `[hidden]{display:none}` partner, or the author rule outvotes the browser default and a "hidden" pane or form keeps painting.
- Scrollbars are themed once, globally, with `::-webkit-scrollbar`: a 12px rail, an 8px thumb tinted from `--text` (so light on dark panels, dark on light), a transparent track, no buttons. Give the thumb side borders only — a top border erases horizontal bars, and `.setting-nav` keeps its own 4px strip. The Launchpad card opts out (`#lp .lpg{scrollbar-width:none}`) because a rail there reads as a seam down the frosted panel.
- Byte/source checks establish structure, not fully verified animation equivalence or a speed improvement.

## Context menus
- Every right-click goes through `showContextMenu`, which reuses `listEl`, `fitPopup` and the dropdown's outside-click close, so context menus fit the screen and look like the menu bar. The document handler covers the desktop, menu bar, Dock, Launchpad and window title bars; Browser and Finder install their own handlers for the surfaces they own.
- A right-click must not start a window drag or resize; `dragify` and `resizify` ignore non-primary buttons and interactive elements.

## Notifications, screenshots, audio and network extras
- Every in-shell alert goes through `notify({app, title, body, icon, image, actions})` in `shell.js`, exposed as `window.silkNotify` so the Store can post after its window closes. One `notices` list (cap 60) feeds both banners and the clock's notification centre; dismissing a banner never removes the notice.
- Do Not Disturb is `cfg.quietMode`: while on, notices are recorded without banners, the clock badge shows a moon, and the centre offers Turn Off. `updateQuietControls` keeps the tile and the centre in sync, and `setQuietMode` saves the setting.
- The clock badge is a dot for unread notices (cleared when the centre opens) and a moon for DND; `syncNoticeBadge` paints both states.
- Battery and Wi-Fi polls call `noticeBattery`/`noticeWifi`; a 60s poll calls `checkPortal`. Low-battery alerts fire once per threshold (10%, 20%) and re-arm when charging or above 25%. Wi-Fi notices fire only on an actual change, not the first reading.
- Screenshots are `Super+Shift+3` (full screen) and `Super+Shift+4` (region), plus Apple-menu entries. `main.js` freezes the capture before raising the shell, writes a PNG to `~/Pictures/Screenshots`, copies it to the clipboard and emits `screenshot:saved`; the region overlay (`#shot`) lives inside the shell, sends fractions of the frozen image to `screenshot:complete`, and handles Escape/Enter in capture phase. `screenLocked` suppresses both shortcuts.
- Audio routing lists `pactl -f json list sinks|sources` and reads defaults from `pactl info`; `.monitor` sources are hidden. Switching a default also moves the streams that were on the old default (`move-sink-input`/`move-source-output`) and leaves streams pinned elsewhere alone. Device names are validated against the fresh list before any command runs.
- Captive portals use NetworkManager's own probe (`nmcli -t -f CONNECTIVITY general`, then `nmcli networking connectivity check` when a state is not yet a verdict); the gateway from `ip -4 route` becomes the sign-in URL. The shell only displays the verdict and offers the sign-in action.
- Hidden Wi-Fi joins keep SSID and password as separate `nmcli` arguments and append `hidden yes` only when the hidden box was checked.
- Finder keeps every write inside the home folder (`fs:mkdir`, `fs:rename`, `fs:trash`, `fs:move` enforce `inHome`); reads such as Computer remain open. Trash follows the freedesktop layout under `~/.local/share/Trash`. `fs:stat` hydrates sizes and dates after first paint in 80-item batches (500 cap), and date/size sorts re-paint once the batch arrives.
- A hidden `<webview>` stops painting, so `capturePage()` on it returns an empty image. Every tab therefore caches the last frame taken while it was on screen (`cacheThumb` on navigate, tab switch and load finish), and the All Tabs grid paints from that cache; a guest with no cache at all is made briefly visible at `opacity:0` (`captureBehind`) so it can be photographed once.
- `playerctl` only sees native MPRIS players, so a playing browser guest publishes itself to `window.silkNowPlaying` (`publish`/`forget`/`best`) instead of widening the preload bridge. Chromium fires `media-started-playing` for muted autoplay previews too, so the guest is asked what it actually holds via `executeJavaScript` rather than trusting the event. The Control Center tile prefers the native player and falls back to the browser item, enabling only play/pause for it.
- Notes is the macOS three-column layout: a full-width chrome strip over folder sidebar, list and editor. The selected row reverses onto the solid accent, the editor shows a large left-aligned title over a centred `October 30, 2026 at 1:06 PM` caption, folder names appear in that caption only when the note is not in the default folder, and dates use time → Yesterday → weekday → date the way the app does. `plainText` inserts its own block breaks because `innerText` has no layout on a detached node, which is what lets the list split a note into title and snippet.

## Platform settings and hardware
- Display scale is one page zoom: `main.js` calls `setZoomFactor`, forces `force-device-scale-factor=1` so Xft.dpi cannot scale twice, writes `~/.config/silkos/display-scale(.mode)`, and runs `silkos-display-scale` to update Xft.dpi, the Openbox margin and picom's radius. `auto` derives the scale from panel PPI.
- Trackpad settings are libinput device properties written with `xinput set-prop` to every device that advertises them; natural scrolling defaults on. They stay behind the preload bridge.
- Firmware and microcode packages must be listed explicitly in `distro/config/package-lists/silkos.list.chroot` because `--apt-recommends` is off; `non-free-firmware` is already in `distro/auto/config`. `firmware-iwlwifi` also carries Intel Bluetooth firmware.

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
- Manual checks for the desktop extras: post a notice from the Store and from a Wi-Fi change, toggle DND, open the clock centre, take full and region screenshots (files, clipboard, Finder action), switch output/input in the Sound pane, join a hidden network, and run a hide/rename/move/Trash cycle in Finder. `desktopCapturer`, nmcli and pactl cannot be exercised from the Windows preview.
- Openbox matches WM_CLASS with GLib patterns that fold no case, and silently ignores `wmctrl -b add,sticky`; `<desktop>all</desktop>` inside an application rule is the only stickiness Openbox 3.6 honours, so the session passes Electron an explicit `--class` and the hook pins both spellings.
- Openbox ships `W-d` (and `C-A-d`) as iconify-all-windows, which hides the shell window that paints the wallpaper and leaves a black screen. `silkos-xsession` strips both keybinds from the generated rc.xml so the renderer's own Super+D handler can reveal the desktop instead; the shortcut is a shell behaviour now, not a window-manager one.
- `app/index.html` opens from a `file://` URL with a stubbed `window.silk`, which is the practical way to check Control Center geometry, grouping and overflow on Windows. It says nothing about nmcli, BlueZ or real radios.
- A hidden browser tab freezes the CSS transition clock: a computed transform can still read its start value seconds after the class changed. Re-measure after the page paints, or settle with `document.getAnimations().forEach(a => a.finish())` first, before concluding a slide rule is broken.
- `#lp` and `#dock .ic[data-id=launchpad]` can be driven the same way, and `beginLaunchpadGesture(false, p)` reads back one pinch frame without a touchpad.
- Linux hardware remains untested in this Windows documentation task; VMs may not pass through multitouch.
- PRs should state scope, preserved contracts, commands actually run, observed results, manual coverage, and untested platforms.
- Distinguish planned validation from completed validation; do not assert speed gains or full animation equivalence without evidence.
