/**
 * The Cloze cases, worked by hand from Anki's syntax and the spec: each Text,
 * the gap numbers it holds, and what each Card asks and answers.
 *
 * Both seams read this one table: the Plugin Server's Cards (through
 * `add_note` and `next_card`) and the Plugin Page's Cloze parser (in node:vm
 * from the served bytes). So the Review and the Note editor's preview can
 * never disagree on a Cloze without a test saying so.
 */

/** What the Card of one gap number asks and answers, in Markdown. */
export type ClozeFace = { readonly gap: number; readonly question: string; readonly answer: string };

/** One Cloze Text, and the Cards it makes in gap number order. */
export type ClozeCase = { readonly about: string; readonly text: string; readonly faces: readonly ClozeFace[] };

export const CLOZE_CASES: readonly ClozeCase[] = [
  {
    about: 'a gap with a hint asks the hint, and the other gap shows its answer',
    text: 'Ontem eu {{c1::fiz::fazer}} o jantar e {{c2::pus::pôr}} a mesa.',
    faces: [
      { gap: 1, question: 'Ontem eu [fazer] o jantar e pus a mesa.', answer: 'Ontem eu **fiz** o jantar e pus a mesa.' },
      { gap: 2, question: 'Ontem eu fiz o jantar e [pôr] a mesa.', answer: 'Ontem eu fiz o jantar e **pus** a mesa.' },
    ],
  },
  {
    about: 'gaps with the same number hide together on one Card',
    text: '{{c1::Tokyo}} is the capital of {{c1::Japan}}, and {{c2::Paris}} of France.',
    faces: [
      { gap: 1, question: '[...] is the capital of [...], and Paris of France.', answer: '**Tokyo** is the capital of **Japan**, and Paris of France.' },
      { gap: 2, question: 'Tokyo is the capital of Japan, and [...] of France.', answer: 'Tokyo is the capital of Japan, and **Paris** of France.' },
    ],
  },
  {
    about: 'gap numbers are counted as numbers, not as text, and need not start at 1',
    text: '{{c10::駅}} is a station; {{c2::会社}} is a company.',
    faces: [
      { gap: 2, question: '駅 is a station; [...] is a company.', answer: '駅 is a station; **会社** is a company.' },
      { gap: 10, question: '[...] is a station; 会社 is a company.', answer: '**駅** is a station; 会社 is a company.' },
    ],
  },
  {
    about: 'a gap may hold Markdown, and run over lines',
    text: 'A `Box<T>` is freed by {{c1::its *owner*\nwhen it goes out of scope}}.',
    faces: [
      { gap: 1, question: 'A `Box<T>` is freed by [...].', answer: 'A `Box<T>` is freed by **its *owner*\nwhen it goes out of scope**.' },
    ],
  },
  {
    about: 'a Text with no gap makes no Card',
    text: 'Ontem eu fiz o jantar.',
    faces: [],
  },
  {
    about: 'what only looks like a gap is plain text',
    text: '{{c0::zero}} {c1::single} {{c1:colon}} {{cx::letter}} {{c1::open',
    faces: [],
  },
];
