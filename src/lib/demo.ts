import type { Contact } from '@huishouden/pwa-kit/contacts';
import type { HouseholdHome } from '@huishouden/pwa-kit/home';
import { prepTickId, type Category, type HomeEvent, type HomeTask, type PrepTick, type ServiceEntry, type Warranty } from './model';
import { firstDue, type Schedule } from '@huishouden/pwa-kit/schedule';
import { addDays, addMonths, toYmd, type Ymd } from '@huishouden/pwa-kit/time';

// Invented sample data for the signed-out app: README screenshots and first impressions. Everything
// sits around one fixed day in 2031; providers are "Example …" businesses on example.com with
// 555-01xx numbers, which are reserved for fiction. Amounts are made up.

/** Thursday 16 October 2031, 10:30 local time. The demo's clock starts here. */
export const DEMO_NOW = new Date(2031, 9, 16, 10, 30).getTime();
export const DEMO_TODAY: Ymd = toYmd(DEMO_NOW);

export const DEMO_MEMBERS = ['sam@example.com', 'alex@example.com'];
const [SAM, ALEX] = DEMO_MEMBERS;

export interface HomeData {
  tasks: HomeTask[];
  log: ServiceEntry[];
  warranties: Warranty[];
  /** The household's contacts shown in Home. */
  contacts: Contact[];
  /** Regular events: garbage pickup, a lawn service. */
  events: HomeEvent[];
  /** Things to do before an occurrence, ticked off. */
  prep: PrepTick[];
}

const day = (offset: number) => addDays(DEMO_TODAY, offset);
const created = new Date(2031, 0, 5, 12).getTime();

const HVAC = 'demo-contact-hvac';
const PEST = 'demo-contact-pest';
const LAWN = 'demo-contact-lawn';
const PLUMBING = 'demo-contact-plumbing';
const ROOFING = 'demo-contact-roofing';
const INSURANCE = 'demo-contact-insurance';
const HOA = 'demo-contact-hoa';

/** The sample house's address: invented, in Springfield, Illinois. */
export const DEMO_HOME: HouseholdHome = {
  address: '12 Example Lane, Springfield, Illinois 62701',
  lat: 39.7817,
  lng: -89.6501,
  timeZone: 'America/Chicago',
  setBy: SAM,
  updatedAt: created,
};

function contacts(): Contact[] {
  const base = { apps: ['home'], createdAt: created, by: SAM };
  return [
    { id: HVAC, name: 'Example Heating & Air', role: 'HVAC', phone: '(555) 010-0110', website: 'https://hvac.example.com', address: '8 Example Avenue, Springfield', lat: 39.7954, lng: -89.6623, ...base },
    {
      id: PEST,
      name: 'Example Pest Control',
      role: 'Pest control',
      phone: '(555) 010-0120',
      email: 'service@pest.example.com',
      website: 'https://pest.example.com',
      address: '31 Sample Road, Springfield',
      lat: 39.7702,
      lng: -89.6105,
      notes: 'Quarterly plan. They call the day before a visit.',
      ...base,
    },
    { id: LAWN, name: 'Example Lawn Care', role: 'Lawn service', phone: '(555) 010-0130', notes: 'Mows every other Friday. Gate code is on the fridge.', ...base },
    { id: PLUMBING, name: 'Example Plumbing', role: 'Plumber', phone: '(555) 010-0140', website: 'https://plumbing.example.com', address: '2 Demo Street, Springfield', lat: 39.8011, lng: -89.6437, ...base },
    { id: ROOFING, name: 'Example Roofing', role: 'Roofer', phone: '(555) 010-0150', website: 'https://roofing.example.com', ...base },
    { id: INSURANCE, name: 'Example Insurance', role: 'Insurance', phone: '(555) 010-0160', website: 'https://insurance.example.com', ...base },
    { id: HOA, name: 'Example HOA Management', role: 'HOA', phone: '(555) 010-0170', email: 'board@hoa.example.com', ...base },
  ];
}

type TaskSpec = [id: string, title: string, category: Category, schedule: Schedule, due: Ymd, lastDone: Ymd | undefined, contactId?: string, notes?: string];

function tasks(): HomeTask[] {
  const fixed = (every: number, unit: Schedule['unit'], anchor: Ymd): Schedule => ({ kind: 'fixed', every, unit, anchor });
  const after = (every: number, unit: Schedule['unit']): Schedule => ({ kind: 'after-done', every, unit });
  const pest = fixed(3, 'month', '2031-01-28');
  const smoke = fixed(1, 'year', '2030-11-02');
  const hoa = fixed(1, 'month', '2031-01-01');
  const insurance = fixed(1, 'year', '2029-02-01');
  const specs: TaskSpec[] = [
    ['demo-task-filter', 'Change HVAC filter', 'hvac', after(3, 'month'), day(4), addMonths(day(4), -3), undefined, '16x25x1 filters, two in the hall closet.'],
    ['demo-task-gutters', 'Gutter cleaning', 'gutters', after(6, 'month'), day(-5), addMonths(day(-5), -6), ROOFING],
    ['demo-task-pest', 'Pest control visit', 'pest', pest, firstDue(pest, DEMO_TODAY), '2031-07-28', PEST],
    ['demo-task-hoa', 'HOA dues', 'paperwork', hoa, firstDue(hoa, DEMO_TODAY), '2031-10-01', HOA, 'Pay on the HOA portal. Late after the 15th.'],
    ['demo-task-smoke', 'Smoke detector batteries', 'safety', smoke, firstDue(smoke, DEMO_TODAY), '2030-11-02', undefined, 'Nine detectors, 9V batteries.'],
    ['demo-task-dryer', 'Dryer vent cleaning', 'appliances', after(1, 'year'), '2031-12-02', '2030-12-02'],
    ['demo-task-heater', 'Water heater flush', 'plumbing', after(1, 'year'), '2032-03-15', '2031-03-15', PLUMBING],
    ['demo-task-insurance', 'Home insurance renewal', 'paperwork', insurance, firstDue(insurance, DEMO_TODAY), '2031-02-01', INSURANCE, 'Compare quotes a month before.'],
    ['demo-task-pool', 'Pool filter clean', 'pool', after(1, 'month'), day(-2), addMonths(day(-2), -1), undefined, 'Closed for the winter.'],
  ];
  // The pool is closed for the winter: its job is paused, not due anywhere until resumed.
  const paused: Record<string, number> = { 'demo-task-pool': new Date(2031, 9, 1, 18).getTime() };
  return specs.map(([id, title, category, schedule, due, lastDone, contactId, notes], i) => ({
    id,
    title,
    category,
    schedule,
    due,
    ...(lastDone ? { lastDone } : {}),
    ...(contactId ? { contactId } : {}),
    ...(notes ? { notes } : {}),
    ...(paused[id] ? { pausedAt: paused[id] } : {}),
    createdAt: created,
    by: i % 2 ? ALEX : SAM,
  }));
}

type EntrySpec = [date: Ymd, title: string, taskId: string | undefined, who: string, costCents?: number, notes?: string, calendarLink?: string];

function log(t: HomeTask[]): ServiceEntry[] {
  const task = (id: string) => t.find((x) => x.id === id)!;
  // The lawn service comes every other Friday (a regular event, below); the last two visits.
  const lawnDone = '2031-10-03';
  const specs: EntrySpec[] = [
    // Booked visits (after the demo day).
    [day(12), 'Quarterly pest control', 'demo-task-pest', PEST, undefined, 'Inside and outside. Someone needs to be home.', 'https://calendar.example.com/event?eid=demo-pest'],
    [day(20), 'HVAC tune-up', undefined, HVAC, undefined, 'Before winter. Ask about the humidifier pad.', 'https://calendar.example.com/event?eid=demo-hvac'],
    // History.
    [lawnDone, 'Lawn service', undefined, LAWN, 6500],
    [addDays(lawnDone, -14), 'Lawn service', undefined, LAWN, 6500],
    ['2031-10-01', 'HOA dues', 'demo-task-hoa', HOA, 8500],
    ['2031-09-01', 'HOA dues', 'demo-task-hoa', HOA, 8500],
    [task('demo-task-filter').lastDone!, 'Change HVAC filter', 'demo-task-filter', 'We did it', 3200, 'Two filters from the hardware store.'],
    ['2031-07-28', 'Pest control visit', 'demo-task-pest', PEST, 9500, 'Treated the garage and the outside perimeter.'],
    ['2031-06-03', 'Replaced the garbage disposal', undefined, PLUMBING, 24000, 'Old one was leaking at the base.'],
    [task('demo-task-gutters').lastDone!, 'Gutter cleaning', 'demo-task-gutters', ROOFING, 15000],
    ['2031-03-15', 'Water heater flush', 'demo-task-heater', PLUMBING, 12000],
    ['2031-02-01', 'Home insurance renewal', 'demo-task-insurance', INSURANCE, 120000, 'Same cover as last year.'],
    ['2030-12-02', 'Dryer vent cleaning', 'demo-task-dryer', 'Example Chimney & Vent', 11000],
  ];
  return specs.map(([date, title, taskId, who, costCents, notes, calendarLink], i) => ({
    id: `demo-entry-${i + 1}`,
    date,
    title,
    ...(taskId ? { taskId } : {}),
    ...(who.startsWith('demo-contact-') ? { contactId: who } : { who }),
    ...(costCents !== undefined ? { costCents } : {}),
    ...(notes ? { notes } : {}),
    ...(calendarLink ? { calendarEventId: calendarLink.split('eid=')[1], calendarLink } : {}),
    createdAt: created,
    by: i % 3 ? SAM : ALEX,
  }));
}

function warranties(): Warranty[] {
  const list: Omit<Warranty, 'id' | 'createdAt' | 'by'>[] = [
    {
      item: 'Refrigerator',
      details: 'Example Appliances EX-200, serial EX200-0001',
      purchaseDate: '2029-12-01',
      warrantyEnd: '2031-12-01',
      receiptUrl: 'https://receipts.example.com/refrigerator.pdf',
      manualUrl: 'https://manuals.example.com/ex-200',
    },
    { item: 'Dishwasher', details: 'Example Appliances DW-50', purchaseDate: '2030-08-20', warrantyEnd: '2032-08-20', manualUrl: 'https://manuals.example.com/dw-50' },
    { item: 'Water heater', details: '50 gallon, gas', purchaseDate: '2028-03-15', warrantyEnd: '2034-03-15', contactId: PLUMBING, notes: 'Flush once a year to keep the warranty.' },
    { item: 'Washing machine', details: 'Example Appliances WM-9', purchaseDate: '2029-04-02', warrantyEnd: '2031-04-02', receiptUrl: 'https://receipts.example.com/washer.pdf' },
    { item: 'Roof', details: 'Workmanship warranty', purchaseDate: '2028-06-10', warrantyEnd: '2038-06-10', contactId: ROOFING },
    { item: 'Heating and cooling system', details: 'Heat pump and air handler', purchaseDate: '2027-09-01', warrantyEnd: '2037-09-01', contactId: HVAC, notes: 'Parts warranty needs a yearly tune-up.' },
  ];
  return list.map((w, i) => ({ id: `demo-warranty-${i + 1}`, ...w, createdAt: created, by: SAM }));
}

/**
 * Garbage every Thursday (out the evening before; this week's went out), recycling every other
 * Thursday, the lawn service every other Friday (the side gate unlocked the evening before, so
 * tonight; Thanksgiving week's visit moved to the Saturday), and the HOA meeting on the second Tuesday.
 */
function events(): HomeEvent[] {
  const evening = { daysBefore: 1, time: '19:00' };
  return [
    {
      id: 'demo-event-trash',
      title: 'Garbage pickup',
      kind: 'trash',
      rule: { freq: 'week', every: 1, start: '2031-01-02' },
      time: '07:00',
      notes: 'Bins by the curb, lids closed.',
      prep: { title: 'Take the garbage out', offset: evening, remind: true },
      createdAt: created,
      by: SAM,
    },
    { id: 'demo-event-recycling', title: 'Recycling pickup', kind: 'recycling', rule: { freq: 'week', every: 2, start: '2031-01-09' }, time: '07:00', createdAt: created, by: SAM },
    {
      id: 'demo-event-lawn',
      title: 'Lawn service',
      kind: 'lawn',
      rule: { freq: 'week', every: 2, start: '2031-03-07' },
      time: '09:00',
      contactId: LAWN,
      prep: { title: 'Unlock the side gate', offset: evening, remind: true },
      exceptions: { '2031-11-28': { moved: { date: '2031-11-29', time: '10:00' }, note: 'Thanksgiving week' } },
      createdAt: created,
      by: ALEX,
    },
    { id: 'demo-event-hoa', title: 'HOA meeting', kind: 'hoa', rule: { freq: 'month', every: 1, start: '2031-01-14', nth: 2, weekday: 2 }, time: '19:00', contactId: HOA, createdAt: created, by: SAM },
  ];
}

/** This morning's garbage went out last night. */
function prep(): PrepTick[] {
  return [{ id: prepTickId('demo-event-trash', DEMO_TODAY), done: true, at: new Date(2031, 9, 15, 19, 40).getTime(), by: ALEX }];
}

export function demoData(): HomeData {
  const t = tasks();
  return { tasks: t, log: log(t), warranties: warranties(), contacts: contacts(), events: events(), prep: prep() };
}
