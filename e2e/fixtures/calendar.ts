import type { CalendarMatch } from '@huishouden/pwa-kit/calendar';

// Invented events around the sample house's October 2031, standing in for Google Calendar.
const at = (month: number, day: number, h: number, m = 0) => new Date(2031, month - 1, day, h, m).getTime();

export const calendarEvents: CalendarMatch[] = [
  {
    id: 'evt-gutter',
    title: 'Gutter cleaning',
    start: at(10, 22, 8, 0),
    allDay: false,
    location: '',
    description: '<p>Front and back. They need the side gate open.</p>',
    link: 'https://calendar.example.com/event?eid=evt-gutter',
    calendarName: 'Family',
  },
  {
    id: 'evt-lawn',
    title: 'Lawn aeration',
    start: at(10, 24, 9, 0),
    allDay: false,
    location: '',
    description: '',
    link: 'https://calendar.example.com/event?eid=evt-lawn',
    calendarName: 'Sam',
  },
  {
    id: 'evt-roof',
    title: 'Roof inspection',
    start: at(11, 6, 13, 0),
    allDay: false,
    location: '',
    description: '',
    link: 'https://calendar.example.com/event?eid=evt-roof',
    calendarName: 'Family',
  },
  // Already in the sample history (same id), so the import leaves it out.
  {
    id: 'demo-pest',
    title: 'Quarterly pest control',
    start: at(10, 28, 10, 0),
    allDay: false,
    location: '',
    description: '',
    link: 'https://calendar.example.com/event?eid=demo-pest',
    calendarName: 'Family',
  },
];

/** Run before the page loads: the app then treats the browser as able to read a calendar. */
export function mockCalendar(events: CalendarMatch[]) {
  (window as unknown as { __mockCalendarEvents: CalendarMatch[] }).__mockCalendarEvents = events;
}
