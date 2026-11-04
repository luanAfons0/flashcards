/**
 * Questions this Plugin Server puts to the Host, such as a Notice
 * (FirstMate ADR-0014), and the Host's answers to them.
 *
 * A question is one JSON-RPC request on stdout; the Host answers it on stdin
 * by the id it was sent with. The ids are `flashcards-<n>`, so they never
 * clash with the Host's own. When flashcards stops waiting, a late answer is
 * dropped on arrival, without a word.
 */
import { reply } from './mcp.ts';

/** What came back from the Host, as one of three things and never two. */
export type HostAnswer =
  | { readonly kind: 'answered'; readonly result: unknown }
  | { readonly kind: 'refused'; readonly said: string }
  | { readonly kind: 'timed-out' };

type Answered = {
  readonly result?: unknown;
  readonly error?: { readonly code: number; readonly message: string };
};

/** Whoever here is waiting for the Host, by the id it asked with. */
const owed = new Map<string, (answer: Answered) => void>();
let counter = 0;

/**
 * Hand the Host's answer to whoever asked for it. An answer nobody is owed is
 * the late answer to a question this end gave up on, and is dropped.
 */
export function receive(message: Readonly<Record<string, unknown>>): void {
  const id = String(message['id']);
  const answered = owed.get(id);
  if (answered === undefined) return;
  owed.delete(id);
  answered(message as Answered);
}

/** Put one question to the Host, and wait at most `waitMs` for its answer. */
export function askHost(
  method: string,
  params: Readonly<Record<string, unknown>>,
  waitMs: number,
): Promise<HostAnswer> {
  const id = `flashcards-${(counter += 1)}`;
  return new Promise<HostAnswer>((done) => {
    const timer = setTimeout(() => {
      owed.delete(id);
      done({ kind: 'timed-out' });
    }, waitMs);

    owed.set(id, (answer) => {
      clearTimeout(timer);
      if (answer.error !== undefined) done({ kind: 'refused', said: answer.error.message });
      else done({ kind: 'answered', result: answer.result });
    });

    reply({ jsonrpc: '2.0', id, method, params });
  });
}
