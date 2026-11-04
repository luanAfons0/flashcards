/**
 * The Note Types: which Fields each one has, and which Cards a Note of it
 * makes.
 *
 * A Note Type is data, not code paths: its Fields and a rule from Fields to
 * Card ordinals. Everything that adds or edits a Note reads this table.
 *
 * Basic makes one Card. Basic and reversed makes two: ordinal 1 asks Front,
 * ordinal 2 asks Back. Cloze makes one Card per gap number in its Text, and
 * the ordinal is that number; its rule is the one the Plugin Page uses.
 */
import { answerOf, gapsOf, NO_GAP, questionOf } from './cloze.ts';

/** The Fields of one Note: each Field's name, and its Markdown. */
export type Fields = Readonly<Record<string, string>>;

/** One Note Type: its name as the operator reads it, its Fields, and the Cards a Note of it makes. */
export type NoteType = {
  readonly name: string;
  readonly fields: readonly string[];
  /** The Fields that may be left out or empty; every other Field must hold something. */
  readonly optional: readonly string[];
  /** Why a Note of it that would make no Card is refused, and what to change. */
  readonly noCard: string;
  /** The ordinal of each Card a Note with these Fields makes, in order. */
  ordinals(fields: Fields): readonly number[];
  /** What the Card with this ordinal asks and answers. */
  card(fields: Fields, ordinal: number): CardFace;
};

/**
 * What one Card shows in a Review: which side or gap it asks, as its head
 * names it, its question and answer in Markdown, and, for a Cloze with
 * Extra, the Extra shown under the answer.
 */
export type CardFace = {
  readonly side: string;
  readonly question: string;
  readonly answer: string;
  readonly extra?: string;
};

/** What a Note Type that always makes a Card would say if one made none. */
const ALWAYS_A_CARD = 'This Note would make no Card.';

/** Every Note Type, by the key a caller names it with. */
export const NOTE_TYPES: Readonly<Record<string, NoteType>> = {
  basic: {
    name: 'Basic',
    fields: ['Front', 'Back'],
    optional: [],
    noCard: ALWAYS_A_CARD,
    ordinals: () => [1],
    card: (fields) => ({ side: 'Basic', question: fields['Front'] ?? '', answer: fields['Back'] ?? '' }),
  },
  reversed: {
    name: 'Basic and reversed',
    fields: ['Front', 'Back'],
    optional: [],
    noCard: ALWAYS_A_CARD,
    ordinals: () => [1, 2],
    card: (fields, ordinal) => {
      const front = fields['Front'] ?? '';
      const back = fields['Back'] ?? '';
      return ordinal === 1
        ? { side: 'Front to Back', question: front, answer: back }
        : { side: 'Back to Front', question: back, answer: front };
    },
  },
  cloze: {
    name: 'Cloze',
    fields: ['Text', 'Extra'],
    optional: ['Extra'],
    noCard: NO_GAP,
    ordinals: (fields) => gapsOf(fields['Text'] ?? ''),
    card: (fields, gap) => {
      const text = fields['Text'] ?? '';
      const extra = fields['Extra'] ?? '';
      const face = { side: `Cloze ${gap}`, question: questionOf(text, gap), answer: answerOf(text, gap) };
      return extra.trim() === '' ? face : { ...face, extra };
    },
  },
};

/** The Note Type a caller named, or undefined for one there is not. */
export function noteTypeOf(key: string): NoteType | undefined {
  return Object.hasOwn(NOTE_TYPES, key) ? NOTE_TYPES[key] : undefined;
}

/** Names in plain English: "a", "a and b", "a, b and c". */
export function listed(names: readonly string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
