export type ScrollMode = "follow" | "steady";

export type TokenKind = "latin" | "cjk" | "space" | "linebreak" | "punctuation" | "cue";

export interface ScriptToken {
  id: number;
  text: string;
  normalized: string;
  kind: TokenKind;
  sentenceIndex: number;
  searchableIndex: number | null;
  emphasized: boolean;
}

export interface ScriptDocument {
  tokens: ScriptToken[];
  sentenceStarts: number[];
  searchableTokens: Array<{ normalized: string; displayIndex: number; sentenceIndex: number }>;
}

export interface FollowMatch {
  displayTokenIndex: number;
  startSearchableIndex: number;
  searchableIndex: number;
  score: number;
  matchedText: string;
}

export type ModelState = "missing" | "downloading" | "ready" | "error";

export interface ModelStatus {
  state: ModelState;
  path?: string;
  size: number;
  expectedSize: number;
  message?: string;
}

export interface ModelProgress {
  downloaded: number;
  total: number;
  state: ModelState | "verifying" | "cancelled";
  message?: string;
}

export interface RecognitionResult {
  text: string;
  detectedLanguage: string;
  confidence: number;
  isFinal: boolean;
}

export interface RecognitionLevel {
  level: number;
  isSpeech: boolean;
}

export interface RecognitionState {
  state: "idle" | "loading" | "listening" | "paused" | "error";
  message?: string;
}

export interface PersistedSettings {
  script: string;
  mode: ScrollMode;
  speed: number;
  fontSize: number;
  lineHeight: number;
  sidePadding: number;
  focusPosition: number;
  focusBandHeight: number;
  dimStrength: number;
  skipAheadEnabled: boolean;
  mirrored: boolean;
  activeTokenIndex: number;
}
