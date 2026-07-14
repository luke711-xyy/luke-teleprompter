import type { ScriptDocument, ScriptToken, TokenKind } from "./types";

const TOKEN_PATTERN = /\r\n|\n|[\t ]+|[\p{Script=Han}]|[A-Za-z0-9]+(?:[’'-][A-Za-z0-9]+)*(?:[.,!?;:]*)|[^\s]/gu;
const INLINE_MARKUP_PATTERN = /\/\/([^\r\n]*?)\/\/|\*\*([^\r\n]*?)\*\*/gu;
const SENTENCE_END = /[。！？!?；;.]$|\n/u;

function tokenKind(value: string): TokenKind {
  if (value === "\n" || value === "\r\n") return "linebreak";
  if (/^[\t ]+$/u.test(value)) return "space";
  if (/^[\p{Script=Han}]$/u.test(value)) return "cjk";
  if (/^[A-Za-z0-9]/u.test(value)) return "latin";
  return "punctuation";
}

export function normalizeUnit(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\p{Script=Han}]+/gu, "")
    .trim();
}

export function searchableUnits(value: string): string[] {
  const matches = value.match(/[\p{Script=Han}]|[A-Za-z0-9]+(?:[’'-][A-Za-z0-9]+)*/gu) ?? [];
  return matches.map(normalizeUnit).filter(Boolean);
}

export function parseScript(script: string): ScriptDocument {
  const tokens: ScriptToken[] = [];
  const sentenceStarts: number[] = [0];
  const searchableTokens: ScriptDocument["searchableTokens"] = [];
  let sentenceIndex = 0;
  let tokenId = 0;

  const pushTextToken = (text: string, emphasized = false) => {
    const kind = tokenKind(text);
    const normalized = kind === "latin" || kind === "cjk" ? normalizeUnit(text) : "";
    const searchableIndex = normalized ? searchableTokens.length : null;
    const token: ScriptToken = {
      id: tokenId,
      text: text === "\r\n" ? "\n" : text,
      normalized,
      kind,
      sentenceIndex,
      searchableIndex,
      emphasized,
    };
    tokens.push(token);

    if (searchableIndex !== null) {
      searchableTokens.push({ normalized, displayIndex: tokenId, sentenceIndex });
    }

    tokenId += 1;

    if (SENTENCE_END.test(text)) {
      sentenceIndex += 1;
      sentenceStarts.push(tokenId);
    }
  };

  const pushTextSegment = (value: string, emphasized = false) => {
    const rawTokens = value.match(TOKEN_PATTERN) ?? [];
    rawTokens.forEach((token) => pushTextToken(token, emphasized));
  };

  const pushCueToken = (text: string) => {
    const cueText = text.trim();
    if (!cueText) {
      pushTextSegment(`//${text}//`);
      return;
    }
    const token: ScriptToken = {
      id: tokenId,
      text: cueText,
      normalized: "",
      kind: "cue",
      sentenceIndex,
      searchableIndex: null,
      emphasized: false,
    };
    tokens.push(token);
    tokenId += 1;
  };

  let cursor = 0;
  for (const match of script.matchAll(INLINE_MARKUP_PATTERN)) {
    const start = match.index ?? 0;
    pushTextSegment(script.slice(cursor, start));
    if (match[1] !== undefined) {
      pushCueToken(match[1]);
    } else if (match[2]?.trim()) {
      pushTextSegment(match[2], true);
    } else {
      pushTextSegment(match[0]);
    }
    cursor = start + match[0].length;
  }
  pushTextSegment(script.slice(cursor));

  const validSentenceStarts = sentenceStarts.filter((start, index) => index === 0 || start < tokens.length);
  return { tokens, sentenceStarts: validSentenceStarts, searchableTokens };
}

export function searchableIndexForDisplay(document: ScriptDocument, displayIndex: number): number {
  let closest = 0;
  for (let index = 0; index < document.searchableTokens.length; index += 1) {
    if (document.searchableTokens[index].displayIndex > displayIndex) break;
    closest = index;
  }
  return closest;
}

export function nextSentenceToken(document: ScriptDocument, activeIndex: number): number {
  const sentence = document.tokens[activeIndex]?.sentenceIndex ?? 0;
  const next = document.tokens.find((token) => token.sentenceIndex > sentence && token.normalized);
  return next?.id ?? Math.max(0, document.tokens.length - 1);
}

export function previousSentenceToken(document: ScriptDocument, activeIndex: number): number {
  const sentence = document.tokens[activeIndex]?.sentenceIndex ?? 0;
  const targetSentence = Math.max(0, sentence - 1);
  return document.tokens.find((token) => token.sentenceIndex === targetSentence && token.normalized)?.id ?? 0;
}

export function firstSentenceToken(document: ScriptDocument): number {
  return document.searchableTokens[0]?.displayIndex ?? 0;
}

export function lastSentenceToken(document: ScriptDocument): number {
  const lastSearchable = document.searchableTokens.at(-1);
  if (!lastSearchable) return 0;
  return document.searchableTokens.find((token) => token.sentenceIndex === lastSearchable.sentenceIndex)?.displayIndex
    ?? lastSearchable.displayIndex;
}
