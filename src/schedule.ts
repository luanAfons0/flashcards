/**
 * FSRS: when a Card is Due next, for each Grade it could be given.
 *
 * Scheduling is ts-fsrs with its default parameters and no optimizer. ts-fsrs
 * 6 schedules with FSRS-7 unless told otherwise; this asks for FSRS-6, the
 * model Anki uses today, with its 21 default weights, whole-day intervals,
 * learning steps of 1 and 10 minutes, and no fuzz.
 *
 * ts-fsrs gives a Card scheduled N days ahead the same clock time N days
 * later. flashcards moves it to 4:00 of that day instead, so it is Due from
 * the start of its due day. FSRS reads the time of the last Review, never the
 * due time, so this changes nothing in its model.
 */
import { DefaultScheduler, type Grade } from 'ts-fsrs';
import { dayStart } from './day.ts';

const scheduler = await DefaultScheduler({ version: 'FSRS-6' });

/** The Grades, by the number a caller gives: 1 Again, 2 Hard, 3 Good, 4 Easy. */
export const GRADES: readonly string[] = ['Again', 'Hard', 'Good', 'Easy'];

/**
 * The FSRS state of one Card, as `cards` keeps it and as `reviews` keeps it
 * from before each Grade. Times are ISO 8601 in UTC.
 */
export type CardState = {
  readonly due: string;
  readonly stability: number;
  readonly difficulty: number;
  /** 0 New, 1 Learning, 2 Review, 3 Relearning. */
  readonly state: number;
  readonly reps: number;
  readonly lapses: number;
  readonly scheduled_days: number;
  readonly learning_step: number;
  readonly last_review: string | null;
};

/** The columns of a CardState, in one order, for SQL that copies them. */
export const STATE_COLUMNS: readonly (keyof CardState)[] = [
  'due', 'stability', 'difficulty', 'state', 'reps', 'lapses', 'scheduled_days', 'learning_step', 'last_review',
];

/** The state this Card would have after each Grade at this time, Again first. */
export function previewed(id: number, card: CardState, now: Date): readonly CardState[] {
  const options = [...scheduler.preview({ card: toFsrs(id, card), now })];
  return options.sort((a, b) => a.grade - b.grade).map((option) => fromFsrs(option.card, now));
}

/** The state this Card has after this Grade at this time. */
export function graded(id: number, card: CardState, grade: number, now: Date): CardState {
  return fromFsrs(scheduler.review({ card: toFsrs(id, card), grade: grade as Grade, now }).card, now);
}

/**
 * How long until a Card in this state is Due, as a Grade button says it:
 * "<1m", "6m", "2h", "8d", "3.5mo", "1.2y". Days are counted as FSRS
 * scheduled them, not from now to 4:00 of the due day.
 */
export function intervalText(card: CardState, now: Date): string {
  const days = card.scheduled_days;
  if (days >= 365) return `${round1(days / 365)}y`;
  if (days >= 31) return `${round1(days / 30)}mo`;
  if (days >= 1) return `${days}d`;
  // A Card in a learning step can come back before its time once nothing
  // else is left, so the first step of one minute reads "<1m", as in Anki.
  const minutes = (Date.parse(card.due) - now.getTime()) / 60_000;
  if (minutes <= 1) return '<1m';
  if (minutes < 60) return `${Math.round(minutes)}m`;
  return `${Math.round(minutes / 60)}h`;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

type FsrsCard = Parameters<typeof scheduler.review>[0]['card'];

function toFsrs(id: number, card: CardState): FsrsCard {
  return {
    cardId: String(id),
    stability: card.stability,
    difficulty: card.difficulty,
    state: card.state,
    scheduleStatus: card.state === 0 ? 'new' : card.state === 2 ? 'review' : 'learning',
    dueAt: new Date(card.due),
    lastReviewAt: card.last_review === null ? null : new Date(card.last_review),
    reps: card.reps,
    lapses: card.lapses,
    scheduledDays: card.scheduled_days,
    learningStep: card.learning_step,
  } as FsrsCard;
}

function fromFsrs(card: FsrsCard, now: Date): CardState {
  // A day or more ahead is Due from 4:00 of the due day, counted from the day
  // this Grade was given in.
  const due = card.scheduledDays >= 1 ? dayStart(now, card.scheduledDays) : card.dueAt;
  return {
    due: due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    state: card.state,
    reps: card.reps,
    lapses: card.lapses,
    scheduled_days: card.scheduledDays,
    learning_step: card.learningStep ?? 0,
    last_review: card.lastReviewAt === null ? null : card.lastReviewAt.toISOString(),
  };
}
