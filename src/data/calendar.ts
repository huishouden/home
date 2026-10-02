import { useCallback, useRef, useState } from 'react';
import { findCalendarEvents, type CalendarMatch, type FindEventsOptions } from '@huishouden/pwa-kit/calendar';
import type { User } from 'firebase/auth';
import { calendarError } from '../lib/calendarImport';
import { auth } from './firebase';

const ASKED_KEY = 'home-calendar-allowed';

/**
 * Signed-out sample mode has no Google account to read. Browser tests that set
 * `window.__mockCalendarEvents` stand in for one, the same hook the kit's search answers from.
 */
export function calendarAvailable(user: User | null): boolean {
  return !!user || (typeof window !== 'undefined' && '__mockCalendarEvents' in window);
}

/** Google has already asked this browser for calendar access once. */
export const calendarAsked = () => localStorage.getItem(ASKED_KEY) === '1';

export type CalendarSearch =
  | { status: 'idle' }
  | { status: 'searching' }
  | { status: 'done'; matches: CalendarMatch[] }
  | { status: 'error'; message: string };

/**
 * One calendar search at a time. Call `run` straight from a click: the first search opens Google's
 * permission window, which browsers only allow in answer to a tap.
 */
export function useCalendarSearch() {
  const [state, setState] = useState<CalendarSearch>({ status: 'idle' });
  const seq = useRef(0);
  const run = useCallback(async (queries: string | string[], options?: FindEventsOptions) => {
    const mine = ++seq.current;
    setState({ status: 'searching' });
    try {
      const matches = await findCalendarEvents(auth, queries, options);
      localStorage.setItem(ASKED_KEY, '1');
      if (mine === seq.current) setState({ status: 'done', matches });
    } catch (e) {
      if (mine === seq.current) setState({ status: 'error', message: calendarError(e) });
    }
  }, []);
  const reset = useCallback(() => {
    seq.current++;
    setState({ status: 'idle' });
  }, []);
  return { state, run, reset };
}
