/**
 * Cloze, for the Plugin Server: the gaps a Text holds, and what the Card of
 * each gap number asks and answers.
 *
 * The rule itself lives once, in `web/cloze.js`, the script the Plugin Page
 * loads for the Note editor's preview. This module imports those same bytes,
 * so the Review and the preview can never ask a Cloze two ways; it only
 * gives them types.
 */
import '../web/cloze.js';

declare global {
  var clozeGaps: (text: string) => number[];
  var clozeQuestion: (text: string, gap: number) => string;
  var clozeAnswer: (text: string, gap: number) => string;
  var CLOZE_NO_GAP: string;
}

/** The distinct gap numbers of this Text, smallest first: one Card each. */
export function gapsOf(text: string): readonly number[] {
  return globalThis.clozeGaps(text);
}

/** What the Card of this gap number asks, in Markdown: gap N as [hint] or [...]. */
export function questionOf(text: string, gap: number): string {
  return globalThis.clozeQuestion(text, gap);
}

/** What the Card of this gap number answers, in Markdown: the whole Text, gap N in bold. */
export function answerOf(text: string, gap: number): string {
  return globalThis.clozeAnswer(text, gap);
}

/** Why a Cloze Note with no gap is refused, and how to add one. */
export const NO_GAP: string = globalThis.CLOZE_NO_GAP;
