# Streaming Script Follow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the main web application follow a spoken script from Chrome's streaming recognition results instead of repeatedly transcribing overlapping Whisper audio windows.

**Architecture:** The browser keeps one `SpeechRecognition` session open and receives interim and final hypotheses while the user is speaking. `App` continues to own the script-position state, but routes browser results through a small stability gate: exact/high-score interim matches can advance immediately, while weaker interim matches require a consecutive confirmation; final results remain immediate. The existing bounded forward/recovery matcher remains the only component allowed to select a script position.

**Tech Stack:** React 19, TypeScript, Chrome Web Speech API, Vitest, Testing Library, Tauri only for the existing desktop path.

## Global Constraints

- Base all changes on `origin/main`; do not import the local/remote Mac Whisper service selector.
- Web follow mode must not request microphone permission until the user activates the microphone control.
- Browser recognition must use one continuous session with interim results; it must not send microphone PCM to `127.0.0.1`.
- A browser interim result may only advance the script; it must never move it backwards.
- Keep the existing bounded sequential matching and confirmed skip-ahead recovery behavior.
- Keep Tauri's native recognition path unchanged.

---

### Task 1: Add a stability gate for streaming interim matches

**Files:**
- Modify: `src/lib/matcher.ts`
- Modify: `src/lib/matcher.test.ts`

**Interfaces:**
- Produces: `StreamingMatchGate.confirm(match: FollowMatch, isFinal: boolean): boolean`
- Produces: `StreamingMatchGate.reset(): void`
- Consumes: `FollowMatch` from `src/lib/types.ts`

- [x] **Step 1: Write the failing tests**

```ts
it("accepts a high-score interim result immediately", () => {
  const gate = new StreamingMatchGate();
  expect(gate.confirm(matchAt(12, 0.92), false)).toBe(true);
});

it("requires two nearby weak interim matches before advancing", () => {
  const gate = new StreamingMatchGate();
  expect(gate.confirm(matchAt(12, 0.8), false)).toBe(false);
  expect(gate.confirm(matchAt(13, 0.8), false)).toBe(true);
});

it("accepts a final result and resets its pending interim candidate", () => {
  const gate = new StreamingMatchGate();
  gate.confirm(matchAt(12, 0.8), false);
  expect(gate.confirm(matchAt(28, 0.72), true)).toBe(true);
  expect(gate.confirm(matchAt(32, 0.8), false)).toBe(false);
});
```

- [x] **Step 2: Verify the tests fail**

Run: `npm test -- src/lib/matcher.test.ts`

Expected: FAIL because `StreamingMatchGate` is not exported.

- [x] **Step 3: Implement the minimal gate**

```ts
export class StreamingMatchGate {
  private pendingIndex = -1;
  private repeats = 0;

  confirm(match: FollowMatch, isFinal: boolean): boolean {
    if (isFinal || match.score >= 0.9) {
      this.reset();
      return true;
    }
    const nearby = Math.abs(match.searchableIndex - this.pendingIndex) <= 2;
    this.repeats = nearby ? this.repeats + 1 : 1;
    this.pendingIndex = match.searchableIndex;
    return this.repeats >= 2;
  }

  reset(): void {
    this.pendingIndex = -1;
    this.repeats = 0;
  }
}
```

- [x] **Step 4: Verify the focused test passes**

Run: `npm test -- src/lib/matcher.test.ts`

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/lib/matcher.ts src/lib/matcher.test.ts
git commit -m "Add streaming follow stability gate"
```

### Task 2: Route main-web recognition through Chrome streaming results

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

**Interfaces:**
- Consumes: `BrowserSpeechSession` and `isBrowserSpeechSupported` from `src/lib/browserSpeech.ts`
- Consumes: `StreamingMatchGate` from `src/lib/matcher.ts`
- Produces: web microphone control that starts/stops the one browser session.

- [ ] **Step 1: Write failing UI behavior tests**

```ts
it("keeps the browser microphone disabled until the user activates it", () => {
  render(<App />);
  expect(screen.getByRole("button", { name: "开启麦克风" })).toBeInTheDocument();
  expect(speechStartMock).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "开启麦克风" }));
  expect(speechStartMock).toHaveBeenCalled();
});

it("advances from a strong Chrome interim result without waiting for final recognition", async () => {
  emitFinalRecognition = false;
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "开启麦克风" }));
  await waitFor(() => expect(activeToken()).toBe("workflow."));
});
```

- [ ] **Step 2: Verify the UI test fails**

Run: `npm test -- src/App.test.tsx`

Expected: FAIL because the main web build still constructs `LocalWhisperSession` and starts it automatically.

- [x] **Step 3: Implement browser-streaming integration**

```ts
import { BrowserSpeechSession, isBrowserSpeechSupported } from "./lib/browserSpeech";
import { StreamingMatchGate } from "./lib/matcher";

const [microphoneEnabled, setMicrophoneEnabled] = useState(false);
const browserSpeechRef = useRef<BrowserSpeechSession | null>(null);
const streamingMatchGateRef = useRef(new StreamingMatchGate());

// Browser branch of the recognition effect:
const session = new BrowserSpeechSession({ onState, onLevel: () => undefined, onResult });
browserSpeechRef.current = session;
void session.start(nearbyPrompt).catch(handleError);
```

Call `streamingMatchGateRef.current.confirm(match, result.isFinal)` before updating `activeTokenIndex`; reset it whenever the script, manual reading position, pause state, or skip-ahead state resets the other match gates. Use `BrowserSpeechSession` in the microphone test as well.

- [x] **Step 4: Verify UI tests pass**

Run: `npm test -- src/App.test.tsx src/lib/browserSpeech.test.ts src/lib/matcher.test.ts`

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "Use streaming browser recognition for web follow"
```

### Task 3: Document and verify the browser-streaming main path

**Files:**
- Modify: `README.md`
- Test: `src/App.test.tsx`

**Interfaces:**
- Documents: Chrome/Chromium native streaming recognition is the web follow path; Tauri is unchanged.

- [ ] **Step 1: Write the failing README assertion in the existing UI test**

```ts
it("does not construct a local Whisper web session in browser follow mode", () => {
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "开启麦克风" }));
  expect(speechStartMock).toHaveBeenCalledTimes(1);
});
```

- [x] **Step 2: Verify the test passes after Task 2 and update documentation**

Replace the local `npm run whisper:web` browser-start instructions with Chrome permission and streaming-recognition requirements. Preserve the separate Tauri build instructions.

- [x] **Step 3: Run complete verification**

Run:

```bash
npm test
npm run build
cd src-tauri && cargo test
```

Expected: all tests and builds pass.

- [x] **Step 4: Perform rendered browser verification**

Flow: main preview → initial microphone is off → click the microphone → Chrome permission prompt/session starts → status becomes listening; open microphone test and verify it uses the same browser session API.

- [x] **Step 5: Commit and push**

```bash
git add README.md docs/superpowers/plans/2026-07-17-streaming-script-follow.md
git commit -m "Document streaming browser follow mode"
git push -u origin codex/streaming-script-follow
```

## Self-Review

- Web follow no longer depends on the local/Mac Whisper selector or `LocalWhisperSession`.
- Interim updates are fast but gated; final results and recovery retain their existing role.
- Automatic microphone permission prompts are removed by the disabled default.
- Tests cover fast interim follow, weak-interim stability, final confirmation, and explicit microphone activation.
