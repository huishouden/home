import { useMemo } from 'react';
import { sampleContacts } from '@huishouden/pwa-kit/contacts';
import { localIds } from '@huishouden/pwa-kit/store';
import { useSampleStore } from '@huishouden/pwa-kit/react/store';
import { DEMO_MEMBERS, demoData, type HomeData } from '../lib/demo';
import { createActions, type Backend, type DataKey } from './actions';
import type { HomeStore } from './types';

/**
 * Sample data kept in memory: the signed-out app is fully clickable, nothing is saved, and a reload
 * starts over. `clock` is the demo's moving "now" (fixed 2031 start plus time since load).
 */
export function useDemoStore(clock: () => number): HomeStore {
  const { data, read, patch, backend: memory } = useSampleStore<HomeData, DataKey>(demoData);
  const me = DEMO_MEMBERS[0];

  const actions = useMemo(() => {
    const backend: Backend = {
      ...memory,
      contacts: sampleContacts(() => read().contacts, (contacts) => patch((d) => ({ ...d, contacts })), { by: me, now: clock, newId: localIds() }),
    };
    return createActions(backend, read, me, clock);
  }, [clock, me, memory, patch, read]);

  return { data, ready: true, actions, me };
}
