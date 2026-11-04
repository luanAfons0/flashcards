/**
 * The Note Types: which Fields each one has, and which Cards a Note of it
 * makes.
 *
 * A Note Type is data, not code paths: its Fields and a rule from Fields to
 * Card ordinals. Adding one (Basic and reversed, Cloze) is one more entry
 * here, and everything that adds or edits a Note reads this table.
 */

/** The Fields of one Note: each Field's name, and its Markdown. */
export type Fields = Readonly<Record<string, string>>;

/** One Note Type: its name as the operator reads it, its Fields, and the Cards a Note of it makes. */
export type NoteType = {
  readonly name: string;
  readonly fields: readonly string[];
  /** The ordinal of each Card a Note with these Fields makes, in order. */
  ordinals(fields: Fields): readonly number[];
  /** What the Card with this ordinal asks and answers. */
  card(fields: Fields, ordinal: number): CardFace;
};

/**
 * What one Card shows in a Review: which side or gap it asks, as its head
 * names it, and its question and answer in Markdown.
 */
export type CardFace = { readonly side: string; readonly question: string; readonly answer: string };

/** Every Note Type, by the key a caller names it with. */
export const NOTE_TYPES: Readonly<Record<string, NoteType>> = {
  basic: {
    name: 'Basic',
    fields: ['Front', 'Back'],
    ordinals: () => [1],
    card: (fields) => ({ side: 'Basic', question: fields['Front'] ?? '', answer: fields['Back'] ?? '' }),
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
