import { describe, expect, test } from 'bun:test';
import { allDayStart } from '@huishouden/pwa-kit/agenda';
import type { Contact } from '@huishouden/pwa-kit/contacts';
import { addDays } from '@huishouden/pwa-kit/time';
import { AGENDA_APP, APP_URL, agendaItems, isBookedVisit, jobAgenda, visitAgenda, warrantyAgenda } from './agenda';
import { DEMO_NOW, demoData } from './demo';
import type { HomeTask, ServiceEntry, Warranty } from './model';
import { tabFromHash } from './tabs';

const now = new Date(2031, 9, 16, 10, 30).getTime();
const today = '2031-10-16';
const at = (d: number) => addDays(today, d);
const createdOn = (d: number) => new Date(2031, 9, 16 + d, 9).getTime();

const contacts: Contact[] = [{ id: 'c1', name: 'Example Heating & Air', apps: ['home'], createdAt: 1, by: 'sam@example.com' }];

const filter: HomeTask = {
  id: 't1',
  title: 'Change HVAC filter',
  category: 'hvac',
  schedule: { kind: 'after-done', every: 3, unit: 'month' },
  due: at(4),
  contactId: 'c1',
  createdAt: 1,
  by: 'sam@example.com',
};

const visit: ServiceEntry = { id: 'e1', date: at(9), title: 'Furnace tune-up', contactId: 'c1', createdAt: createdOn(-2), by: 'alex@example.com' };

const dishwasher: Warranty = { id: 'w1', item: 'Dishwasher', details: 'Example Appliances DW-100', warrantyEnd: at(46), createdAt: 1, by: 'sam@example.com' };

describe('jobs', () => {
  test('a job publishes its next due day, all day, upcoming, with the schedule and who does it', () => {
    expect(jobAgenda(filter, contacts, now)).toEqual([
      {
        kind: 'due',
        title: 'Change HVAC filter',
        start: allDayStart(at(4)),
        allDay: true,
        detail: 'Every 3 months · Example Heating & Air',
        url: 'https://huishouden-home.web.app/#upkeep',
        status: 'upcoming',
      },
    ]);
  });

  test('due today is upcoming; a day past is overdue, however long ago', () => {
    expect(jobAgenda({ ...filter, due: today }, contacts, now)[0].status).toBe('upcoming');
    expect(jobAgenda({ ...filter, due: at(-1) }, contacts, now)[0].status).toBe('overdue');
    expect(jobAgenda({ ...filter, due: at(-400) }, contacts, now)).toHaveLength(1);
  });

  test('a fixed schedule describes its day; no contact leaves only the schedule', () => {
    const fixed: HomeTask = { ...filter, contactId: undefined, schedule: { kind: 'fixed', every: 1, unit: 'year', anchor: '2031-11-02' } };
    expect(jobAgenda(fixed, contacts, now)[0].detail).toBe('Every year on November 2');
  });

  test('a job due beyond 180 days is not published yet', () => {
    expect(jobAgenda({ ...filter, due: at(180) }, contacts, now)).toHaveLength(1);
    expect(jobAgenda({ ...filter, due: at(181) }, contacts, now)).toEqual([]);
  });
});

describe('visits', () => {
  test('booked ahead means dated after the day it was added', () => {
    expect(isBookedVisit({ date: at(1), createdAt: createdOn(0) })).toBe(true);
    expect(isBookedVisit({ date: today, createdAt: createdOn(0) })).toBe(false);
    expect(isBookedVisit({ date: at(-3), createdAt: createdOn(0) })).toBe(false);
  });

  test('a booked visit is an all-day appointment with no status, naming the contact', () => {
    expect(visitAgenda(visit, contacts, now)).toEqual([
      { kind: 'appointment', title: 'Furnace tune-up', start: allDayStart(at(9)), allDay: true, detail: 'Example Heating & Air', url: `${APP_URL}/#history` },
    ]);
  });

  test('without a saved contact the detail is who was named', () => {
    expect(visitAgenda({ ...visit, contactId: undefined, who: 'Example Handyman' }, contacts, now)[0].detail).toBe('Example Handyman');
    expect(visitAgenda({ ...visit, contactId: undefined }, contacts, now)[0].detail).toBeUndefined();
  });

  test('a booked visit stays for 30 days after it happens; history never appears', () => {
    expect(visitAgenda({ ...visit, date: at(-30), createdAt: createdOn(-40) }, contacts, now)).toHaveLength(1);
    expect(visitAgenda({ ...visit, date: at(-31), createdAt: createdOn(-40) }, contacts, now)).toEqual([]);
    expect(visitAgenda({ ...visit, date: at(-2), createdAt: createdOn(-1) }, contacts, now)).toEqual([]);
  });
});

describe('warranties', () => {
  test('a warranty ending within 180 days is a renewal on its end day', () => {
    expect(warrantyAgenda(dishwasher, now)).toEqual([
      { kind: 'renewal', title: 'Dishwasher warranty ends', start: allDayStart(at(46)), allDay: true, detail: 'Example Appliances DW-100', url: `${APP_URL}/#warranties` },
    ]);
  });

  test('no end date, or one beyond 180 days or over 30 days past, publishes nothing', () => {
    expect(warrantyAgenda({ ...dishwasher, warrantyEnd: undefined }, now)).toEqual([]);
    expect(warrantyAgenda({ ...dishwasher, warrantyEnd: at(181) }, now)).toEqual([]);
    expect(warrantyAgenda({ ...dishwasher, warrantyEnd: at(-31) }, now)).toEqual([]);
    expect(warrantyAgenda({ ...dishwasher, warrantyEnd: at(-5) }, now)).toHaveLength(1);
  });
});

describe('everything', () => {
  test('one item per record, each with its ref', () => {
    const items = agendaItems({ tasks: [filter], log: [visit, { ...visit, id: 'e2', date: at(-1), createdAt: createdOn(-1) }], warranties: [dishwasher], contacts, events: [], prep: [] }, now);
    expect(items.map((i) => [i.ref, i.kind])).toEqual([
      ['job:t1', 'due'],
      ['visit:e1', 'appointment'],
      ['warranty:w1', 'renewal'],
    ]);
  });

  test('the sample house gives valid items: https links, short titles, status only on jobs and things to do before', () => {
    const items = agendaItems(demoData(), DEMO_NOW);
    expect(AGENDA_APP).toBe('home');
    expect(items.some((i) => i.kind === 'due' && i.status === 'overdue')).toBe(true);
    for (const i of items) {
      expect(i.url.startsWith(`${APP_URL}/#`)).toBe(true);
      expect(i.title.length).toBeLessThanOrEqual(120);
      const regular = i.ref.startsWith('event:') || i.ref.startsWith('prep:');
      if (!regular) expect(i.allDay).toBe(true);
      expect(i.status !== undefined).toBe(i.kind === 'due' || i.ref.startsWith('prep:'));
    }
    expect(new Set(items.map((i) => `${i.ref}|${i.start}`)).size).toBe(items.length);
    // Regular events: every occurrence of the next 60 days, and the things to do before them.
    expect(items.filter((i) => i.ref === 'event:demo-event-trash')).toHaveLength(9);
    expect(items.filter((i) => i.ref === 'prep:demo-event-lawn').map((i) => i.title)).toContain('Unlock the side gate');
  });

  test('a deep link opens its screen; anything else opens the overview', () => {
    expect(tabFromHash('#upkeep')).toBe('upkeep');
    expect(tabFromHash('#warranties')).toBe('warranties');
    expect(tabFromHash('#regular')).toBe('regular');
    expect(tabFromHash('')).toBe('overview');
    expect(tabFromHash('#nope')).toBe('overview');
  });
});
