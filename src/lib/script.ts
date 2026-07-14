import type { ScriptDocument, ScriptToken, TokenKind } from "./types";

const TOKEN_PATTERN = /\r\n|\n|[\t ]+|[\p{Script=Han}]|[A-Za-z0-9]+(?:[’'-][A-Za-z0-9]+)*(?:[.,!?;:]*)|[^\s]/gu;
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
  const rawTokens = script.match(TOKEN_PATTERN) ?? [];
  const tokens: ScriptToken[] = [];
  const sentenceStarts: number[] = [0];
  const searchableTokens: ScriptDocument["searchableTokens"] = [];
  let sentenceIndex = 0;

  rawTokens.forEach((text, id) => {
    const kind = tokenKind(text);
    const normalized = kind === "latin" || kind === "cjk" ? normalizeUnit(text) : "";
    const searchableIndex = normalized ? searchableTokens.length : null;
    const token: ScriptToken = {
      id,
      text: text === "\r\n" ? "\n" : text,
      normalized,
      kind,
      sentenceIndex,
      searchableIndex,
    };
    tokens.push(token);

    if (searchableIndex !== null) {
      searchableTokens.push({ normalized, displayIndex: id, sentenceIndex });
    }

    if (SENTENCE_END.test(text) && id < rawTokens.length - 1) {
      sentenceIndex += 1;
      sentenceStarts.push(id + 1);
    }
  });

  return { tokens, sentenceStarts, searchableTokens };
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
