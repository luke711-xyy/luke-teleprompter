import { searchableUnits } from "./script";
import type { FollowMatch, ScriptDocument } from "./types";

const SEQUENTIAL_MAX_LOOKAHEAD = 30;
const SEQUENTIAL_START_WINDOW = 10;
const RECOVERY_MIN_SCORE = 0.86;
const RECOVERY_MIN_UNITS = 5;

function editDistance(a: string[], b: string[]): number {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = new Array<number>(b.length + 1);

  for (let row = 1; row <= a.length; row += 1) {
    current[0] = row;
    for (let column = 1; column <= b.length; column += 1) {
      const substitution = previous[column - 1] + (a[row - 1] === b[column - 1] ? 0 : 1);
      current[column] = Math.min(previous[column] + 1, current[column - 1] + 1, substitution);
    }
    previous.splice(0, previous.length, ...current);
  }

  return previous[b.length];
}

function similarity(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  return 1 - editDistance(a, b) / Math.max(a.length, b.length);
}

export function findForwardMatch(
  recognizedText: string,
  document: ScriptDocument,
  currentSearchableIndex: number,
  maxLookahead = 180,
  allowSkipAhead = true,
): FollowMatch | null {
  const allRecognized = searchableUnits(recognizedText);
  if (allRecognized.length < 2 || document.searchableTokens.length === 0) return null;

  const recognized = allRecognized.slice(-18);
  const effectiveLookahead = allowSkipAhead ? maxLookahead : Math.min(maxLookahead, SEQUENTIAL_MAX_LOOKAHEAD);
  const searchEnd = Math.min(document.searchableTokens.length, currentSearchableIndex + effectiveLookahead);
  const startEnd = allowSkipAhead
    ? searchEnd
    : Math.min(searchEnd, currentSearchableIndex + SEQUENTIAL_START_WINDOW);
  let best: FollowMatch | null = null;

  for (let start = currentSearchableIndex; start < startEnd; start += 1) {
    for (let suffixStart = 0; suffixStart <= Math.max(0, recognized.length - 2); suffixStart += 1) {
      const heard = recognized.slice(suffixStart);
      const minLength = Math.max(2, heard.length - 2);
      const maxLength = Math.min(searchEnd - start, heard.length + 2);

      for (let length = minLength; length <= maxLength; length += 1) {
        const expected = document.searchableTokens
          .slice(start, start + length)
          .map((token) => token.normalized);
        const rawScore = similarity(heard, expected);
        const coverage = Math.min(1, heard.length / 5);
        const score = rawScore * (0.82 + coverage * 0.18);
        const targetSearchable = start + length - 1;
        const candidate: FollowMatch = {
          displayTokenIndex: document.searchableTokens[targetSearchable].displayIndex,
          startSearchableIndex: start,
          searchableIndex: targetSearchable,
          score,
          matchedText: heard.join(" "),
        };

        if (!best || candidate.score > best.score || (candidate.score === best.score && candidate.searchableIndex > best.searchableIndex)) {
          best = candidate;
        }
      }
    }
  }

  return best && best.score >= 0.62 ? best : null;
}

export class MatchHysteresis {
  private pendingSentence = -1;
  private repeats = 0;

  confirm(match: FollowMatch, document: ScriptDocument): boolean {
    const sentence = document.tokens[match.displayTokenIndex]?.sentenceIndex ?? -1;
    if (match.score >= 0.82) {
      this.pendingSentence = sentence;
      this.repeats = 0;
      return true;
    }

    if (sentence === this.pendingSentence) {
      this.repeats += 1;
    } else {
      this.pendingSentence = sentence;
      this.repeats = 1;
    }
    return this.repeats >= 2;
  }

  reset(): void {
    this.pendingSentence = -1;
    this.repeats = 0;
  }
}

export class RecoveryMatchGate {
  private pendingStart = -1;
  private pendingTarget = -1;
  private repeats = 0;

  confirm(match: FollowMatch): boolean {
    if (!this.isStrong(match)) {
      this.reset();
      return false;
    }

    const sameCandidate = Math.abs(match.startSearchableIndex - this.pendingStart) <= 3
      && Math.abs(match.searchableIndex - this.pendingTarget) <= 3;
    if (sameCandidate) {
      this.repeats += 1;
    } else {
      this.pendingStart = match.startSearchableIndex;
      this.pendingTarget = match.searchableIndex;
      this.repeats = 1;
    }
    return this.repeats >= 2;
  }

  confirmFinal(match: FollowMatch): boolean {
    const accepted = this.isStrong(match);
    this.reset();
    return accepted;
  }

  reset(): void {
    this.pendingStart = -1;
    this.pendingTarget = -1;
    this.repeats = 0;
  }

  private isStrong(match: FollowMatch): boolean {
    return match.score >= RECOVERY_MIN_SCORE
      && searchableUnits(match.matchedText).length >= RECOVERY_MIN_UNITS;
  }
}
