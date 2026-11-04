/**
 * The key a Deck name is compared by: one key for every way of writing the
 * same name, whatever its letter case and Unicode form.
 *
 * SQLite's NOCASE folds ASCII letters only, so "Verbos AÇÃO" and "verbos ação"
 * were two Decks. The key is the name in NFC, case-folded by going to upper
 * case and back, so "Straße" and "STRASSE" are one name too. It does not
 * depend on the locale of the machine, so every machine finds the same Deck.
 */

/** The key this Deck name is unique by and found by. */
export function deckKey(name: string): string {
  return name.normalize('NFC').toUpperCase().toLowerCase().normalize('NFC');
}
