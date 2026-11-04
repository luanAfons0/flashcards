/* Cloze, in Anki's syntax: the gaps a Text holds, and what the Card of each
   gap number asks and answers.

   A gap is {{cN::answer}} or {{cN::answer::hint}}, N a whole number from 1.
   Gaps with the same number hide together, on one Card. The question of
   Card N shows each gap N as [hint], or [...] with no hint, and every other
   gap's answer as plain text; the answer shows the whole Text with each gap
   N in bold. Both are Markdown, rendered as any Field is.

   This one file is the Cloze rule for the whole Plugin. The Plugin Page
   loads it as a classic script, and the Plugin Server imports it as a module
   (src/cloze.ts), so the Note editor's preview and the Review can never ask
   a Cloze two ways.

   Pure: it defines four globals and reaches for nothing else, so a test runs
   these bytes in node:vm. */
'use strict';

(function () {
  // Anki's own pattern: the answer ends at the first :: or }}.
  const GAP = /\{\{c(\d+)::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g;

  /** This Text with each gap replaced by what `shown` makes of it; a gap numbered 0 stays as it is written. */
  function replaced(text, shown) {
    return String(text).replace(GAP, function (whole, number, answer, hint) {
      const gap = Number(number);
      return gap >= 1 ? shown(gap, answer, hint) : whole;
    });
  }

  /** The distinct gap numbers of this Text, smallest first: one Card each. */
  function clozeGaps(text) {
    const gaps = [];
    replaced(text, function (gap) {
      if (gaps.indexOf(gap) === -1) gaps.push(gap);
      return '';
    });
    return gaps.sort(function (a, b) { return a - b; });
  }

  /** What the Card of this gap number asks, in Markdown. */
  function clozeQuestion(text, gap) {
    return replaced(text, function (each, answer, hint) {
      if (each !== gap) return answer;
      return '[' + (hint === undefined || hint.trim() === '' ? '...' : hint) + ']';
    });
  }

  /** What the Card of this gap number answers, in Markdown: the whole Text, its gap in bold. */
  function clozeAnswer(text, gap) {
    return replaced(text, function (each, answer) {
      return each === gap ? '**' + answer + '**' : answer;
    });
  }

  globalThis.clozeGaps = clozeGaps;
  globalThis.clozeQuestion = clozeQuestion;
  globalThis.clozeAnswer = clozeAnswer;
  /** Why a Cloze Note with no gap is refused, and how to add one. */
  globalThis.CLOZE_NO_GAP = 'A Cloze Note needs at least one gap, like {{c1::answer}}. Add one, or pick Basic.';
})();
