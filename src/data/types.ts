import type { Contact, ContactInput } from '@huishouden/pwa-kit/contacts';
import type { EventInput, HomeEvent, HomeTask, ServiceEntry, ServiceInput, TaskInput, Warranty, WarrantyInput } from '../lib/model';
import type { OccurrenceChange } from '@huishouden/pwa-kit/schedule';
import type { HomeData } from '../lib/demo';
import type { Ymd } from '@huishouden/pwa-kit/time';

export type { HomeData };

/** Writes return immediately (Firestore queues them offline); failures arrive through `onError`. */
export interface HomeActions {
  saveTask(id: string | null, input: TaskInput): void;
  deleteTask(id: string): void;
  restoreTask(task: HomeTask): void;
  /** Rolls the schedule forward and records a history entry; returns what Undo needs. */
  markDone(task: HomeTask, doneOn: Ymd): { entryId: string; next: Ymd };
  /** Undo of markDone: the job as it was, and its history entry removed. */
  undoDone(task: HomeTask, entryId: string): void;
  /** A new entry for a job that is now its latest done date also moves the job on. */
  saveEntry(id: string | null, input: ServiceInput): void;
  deleteEntry(id: string): void;
  restoreEntry(entry: ServiceEntry): void;
  saveWarranty(id: string | null, input: WarrantyInput): void;
  deleteWarranty(id: string): void;
  restoreWarranty(w: Warranty): void;
  saveEvent(id: string | null, input: EventInput): void;
  deleteEvent(id: string): void;
  restoreEvent(event: HomeEvent): void;
  /** Moves or skips one occurrence, by the day the schedule put it on; `null` puts it back. The schedule stays as it is. */
  changeOccurrence(event: HomeEvent, original: Ymd, change: OccurrenceChange | null): void;
  /** Ticks off the thing to do before one occurrence (by its original day), in the member's name. */
  tickPrep(event: HomeEvent, original: Ymd): void;
  untickPrep(event: HomeEvent, original: Ymd): void;
  saveContact(id: string | null, input: ContactInput): void;
  deleteContact(id: string): void;
  /** Puts a deleted contact back under its old id, so jobs and entries that point at it still do. */
  restoreContact(c: Contact): void;
}

export interface HomeStore {
  data: HomeData;
  /** False until the upkeep list has answered once (from cache or server). */
  ready: boolean;
  actions: HomeActions;
  /** The signed-in member's email (or the demo's). */
  me: string;
  /**
   * The signed-in person is a helper or kid (pwa-kit STANDARD.md "Roles"): they add and tick off,
   * and change or delete only what they added. Unset for admins, members and the demo.
   */
  helping?: boolean;
}

/** Whether the person may change or delete a record: anyone but a helper or kid, or its author. */
export const mayChange = (store: Pick<HomeStore, 'helping' | 'me'>, record: { by?: string }) => !store.helping || record.by === store.me;
