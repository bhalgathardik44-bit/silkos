---
trigger: always_on
---

# SilkOS preservation guardrails

- Follow root AGENTS.md; preserve desktop visuals, behavior, persistence, shortcuts, IPC, and Linux integration.
- Keep edits focused. No unsolicited redesign, framework/bundler/dependency migration, or broad formatting changes.
- Preserve classic-script loading: startup controller first; notes, finder, store, utilities, browser, settings; shell last.
- App initializers use shell global lexical bindings at invocation time. Do not add early reads, duplicate top-level names, or convert bindings to assumed window properties.
- Preserve desktop CSS/easing and existing timing: 100ms startup stagger, 180ms window show, browser maximize at 700ms plus its startup index * 100ms.
- Startup completion requires the final shell ready signal, DOM readiness, and the local desktop stylesheet sheet; optional IPC/network and app animations must not gate it.
- Preserve retry/error handling, scoped startup styling, immediate reduced-motion/Lite removal, .16s fade, 200ms removal fallback, and controller/listener cleanup.
- Keep cleanup owned: shell disposal on close/unload, Store progress unsubscribe, Browser suggestions/openTab ownership, and Notes pending-save flush.
- Keep OS access behind the context-isolated preload bridge; never bypass permissions or alter local assistant/app settings.
- Use only supported package scripts; no configured lint/type-check command exists.
- Unset inherited ELECTRON_RUN_AS_NODE for app launches; do not modify settings to work around it.
- Inspect existing work before editing; do not overwrite unrelated changes, commit, or push without authorization.
- Report actual tests/manual checks and gaps separately. Node tests do not prove visual equivalence or Linux hardware behavior.
- Do not claim speed improvements or fully verified animation equivalence without measurements and appropriate runtime checks.
