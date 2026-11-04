/**
 * The day flashcards counts in: from 4:00 local time to the next 4:00, in
 * the time zone of the machine the Plugin Server runs on, as Anki does.
 *
 * A Review at 1:30 still counts for the day before, and a Card scheduled a
 * day or more ahead is Due from 4:00 of its due day. Every day boundary is
 * worked out here, with the local-time Date constructor, so a day that
 * changes its clock still starts at 4:00.
 */

/** The hour, local time, at which a day starts. */
export const DAY_STARTS_AT = 4;

/** 4:00 local time on the day this many days after the day that holds this time. */
export function dayStart(time: Date, days = 0): Date {
  const shifted = new Date(time);
  shifted.setHours(shifted.getHours() - DAY_STARTS_AT);
  return new Date(shifted.getFullYear(), shifted.getMonth(), shifted.getDate() + days, DAY_STARTS_AT);
}
