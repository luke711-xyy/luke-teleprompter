# Browser-first cloud transcription Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the public teleprompter work without Luke's Mac by preferring browser recognition and automatically falling back to a Cloudflare-hosted transcription endpoint.

**Architecture:** Keep transcript matching and scrolling in the React client. Add a `CloudTranscriptionSession` that shares the existing session callback contract. A separate Worker validates bounded PCM audio and calls a Workers AI binding; it is a deployment-time fallback only and never routes to a Mac tunnel.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Cloudflare Workers, Workers AI, Wrangler 4.

## Global Constraints

- Browser recognition remains the default and does not require a backend.
- Cloud fallback sends only bounded 16 kHz mono PCM windows and never stores audio.
- Cloud endpoint deployment requires a Turnstile secret/site key before public production traffic.
- Local Whisper remains a manual same-device option; no public request may target Luke's Mac.
- Cloudflare Worker code must use a generated binding type, bounded request validation, explicit CORS, and no request payload logs.

---

### Task 1: Add engine state and cloud session

**Files:**
- Modify: `src/lib/types.ts`, `src/lib/storage.ts`, `src/App.tsx`
- Create: `src/lib/cloudTranscription.ts`, `src/lib/cloudTranscription.test.ts`

**Interfaces:**
- Produces `RecognitionEngine = "auto" | "browser" | "cloud" | "whisper"`.
- Produces `CloudTranscriptionSession` with `start(prompt, options)` and `stop()` callbacks matching the browser/local sessions.
- Produces `isCloudTranscriptionConfigured(): boolean` and `isRecoverableBrowserSpeechError(error): boolean`.

- [ ] Write tests for PCM window upload, final-result de-duplication, and recoverable error detection.
- [ ] Run `npm test -- --run src/lib/cloudTranscription.test.ts`; expect failure because the module does not exist.
- [ ] Implement the cloud session with `AudioContext`, local speech gating, 5-second bounded windows, and an abortable single in-flight request.
- [ ] Extend persisted settings with engine selection and use one active session ref in `App`.
- [ ] Run `npm test -- --run`; expect all tests to pass.
- [ ] Commit with `git commit -m "Add cloud transcription session"`.

### Task 2: Wire automatic fallback and settings UI

**Files:**
- Modify: `src/App.tsx`, `src/App.test.tsx`, `src/components/SettingsDrawer.tsx`, `src/components/MicrophoneTestModal.tsx`, `src/styles.css`

**Interfaces:**
- Consumes `CloudTranscriptionSession` from Task 1.
- Produces a persisted `auto` engine that attempts browser speech then switches once to cloud after an unsupported/network error.
- Produces manual Browser, Cloudflare, and Local Whisper settings options.

- [ ] Write App tests asserting auto browser startup, fallback to cloud only after a recoverable error, manual choice persistence, and microphone-test engine labels.
- [ ] Run those App tests; expect failure before UI wiring.
- [ ] Implement the coordinator so it stops tracks/timers from the old session before starting the next and never falls back from local Whisper to a Mac service.
- [ ] Render cloud availability/disabled copy and a concise privacy note in settings and in microphone testing.
- [ ] Run `npm test -- --run` and `npm run build`; expect all tests and TypeScript build to pass.
- [ ] Commit with `git commit -m "Add automatic cloud speech fallback"`.

### Task 3: Add an independently deployable Cloudflare Worker

**Files:**
- Create: `workers/transcription/src/index.ts`, `workers/transcription/wrangler.jsonc`, `workers/transcription/tsconfig.json`, `workers/transcription/package.json`, `workers/transcription/test/index.test.ts`
- Modify: `README.md`, `package.json`

**Interfaces:**
- `POST /v1/transcribe?language=chinese|english&prompt=...` accepts `application/octet-stream` float PCM, maximum 384 KB.
- `GET /health` returns JSON status without revealing account data.
- The generated `Env` type contains `AI` and `TURNSTILE_SECRET`; production Worker returns 503 until the Turnstile secret is configured.

- [ ] Write pure request-validation tests for method, origin, content type, size, disabled cloud state, and a successful AI response.
- [ ] Run Worker tests; expect failure before implementation.
- [ ] Implement an explicit `fetch(request, env)` handler with a bounded body reader, CORS response helper, and `env.AI.run("@cf/openai/whisper-large-v3-turbo", ...)` call.
- [ ] Run `npx wrangler types`, `npx wrangler check`, and Worker tests; expect success.
- [ ] Document branch deployment and required secrets without storing keys in Git.
- [ ] Commit with `git commit -m "Add Cloudflare transcription worker"`.

### Task 4: Validate and publish the independent preview

**Files:**
- Modify only if validation exposes a defect.

- [ ] Start the Vite app and exercise Auto → Cloud fallback, manual Cloud selection, microphone-test labels, and Local Whisper selection with browser automation.
- [ ] Run `npm test -- --run`, `npm run build`, and `git diff --check`; expect clean results.
- [ ] Deploy the Worker as a branch/test service after verifying Workers AI binding and Turnstile configuration; if those account prerequisites are unavailable, deploy the Pages preview with cloud fallback clearly disabled.
- [ ] Deploy Pages using `wrangler pages deploy dist --project-name luke-teleprompter --branch remote-whisper-tunnel` and record the unique preview URL.
- [ ] Commit any validation fixes and push `codex/remote-whisper-tunnel`.
