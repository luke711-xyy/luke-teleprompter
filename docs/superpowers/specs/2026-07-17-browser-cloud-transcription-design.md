# Browser-first transcription design

## Goal

Allow the public teleprompter website to run on any user device without a connection to Luke's Mac. Keep reading, matching, scrolling, settings, and script storage in the browser. Choose the best available transcription transport automatically and show the active engine in the UI.

## Engine order

1. **Browser speech** is the default. It uses the browser's `SpeechRecognition` API when available and keeps the low-latency streaming match path.
2. **Cloudflare transcription** is the automatic fallback when browser speech is unavailable or reports an unsupported/network error. The client records short PCM windows and sends them to a Cloudflare Worker. The Worker forwards bounded audio to its Workers AI binding and returns normalized text.
3. **Local Whisper** remains an explicit, desktop-only privacy/offline option. It talks only to the local controller on the same computer and is never selected as a fallback for another user's device.

The current `codex/remote-whisper-tunnel` design, which forwarded public web audio to Luke's Mac, is intentionally removed.

## Components

### Client

`RecognitionEngine` gains `browser`, `cloud`, and `whisper` values. A small engine coordinator owns one active session at a time, tears down the previous microphone session before changing engines, and preserves the existing follow matcher.

`CloudTranscriptionSession` follows the same callback contract as the browser and local sessions. It captures one mono track, performs speech gating locally, uploads only a recent bounded audio window, and emits final results. It never stores audio or transcripts remotely.

When automatic mode is active, the coordinator starts with browser speech. On a capability error or a recoverable recognition error, it switches once to cloud transcription and tells the user why. The user can also choose an engine manually in settings; a manual choice is persisted and is not automatically overridden.

### Cloudflare Worker

The Worker exposes `POST /v1/transcribe` and `GET /health`. It accepts a bounded 16 kHz mono float PCM payload plus `language` and a short prompt. It validates origin, method, content type, and request length before calling the Workers AI binding. It returns only `{ text, language, confidence }` and sends no request data to logs.

The Worker does not proxy to Luke's Mac, has no tunnel token, and contains no private endpoint. It is designed for a public Pages deployment; deployment adds a Turnstile secret/site key before public traffic is enabled, so the endpoint cannot become an unauthenticated transcription relay.

## Error handling

- Browser unsupported or recoverable browser-recognition failure: show a short notice, then fall back to cloud if configured.
- Cloud service disabled, unavailable, overloaded, or unauthorised: stop recognition, retain the prompt position, and show an actionable error. Do not silently retry indefinitely.
- Local Whisper unavailable: do not fall back to Luke's Mac; offer browser or cloud instead.
- A switch always stops tracks and timers from the old session before starting the new one.

## Verification

- Unit tests cover engine selection persistence, browser-to-cloud fallback, local manual selection, session cleanup, and Worker request validation/CORS/error responses.
- Browser QA verifies settings labels, microphone test engine labels, browser selection, local selection, and a disabled cloud state.
- Deployment validation uses a branch Worker and Pages preview. Production deployment is a separate, explicit decision because Workers AI usage can incur cost.
