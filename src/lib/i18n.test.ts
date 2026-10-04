import { afterEach, describe, expect, test } from 'bun:test';
import { setLangForTests } from '@huishouden/pwa-kit/i18n';
import { localizeReminders } from '@huishouden/pwa-kit/reminders';
import { atTime } from '@huishouden/pwa-kit/time';
import { calendarWords, guessCategory } from './calendarImport';
import { eventPresets, eventWhen, guessEventKind, occurrenceWords, prepReminders, REGULAR_WORDS } from './events';
import { lastDoneText } from './upkeep';
import { categoryLabel, type HomeEvent } from './model';
import { roleLabel } from './contacts';
import { warrantyText } from './warranty';

// Spanish and Dutch: what Home writes in each, and the household's own words it understands in any language.
// Back to English after each (resetI18nForTests would also forget the app's catalogue, registered once at import).
afterEach(() => setLangForTests('en'));

const trash: HomeEvent = {
  id: 'e1',
  title: 'Recolección de basura',
  kind: 'trash',
  rule: { freq: 'week', every: 1, start: '2031-01-02' },
  time: '07:00',
  prep: { title: 'Sacar la basura', offset: { daysBefore: 1, time: '19:00' }, remind: true },
  createdAt: 1,
  by: 'sam@example.com',
};

describe('in Spanish and Dutch', () => {
  test('occurrences, event times and job words', async () => {
    await setLangForTests('es', ['es-MX']);
    expect(occurrenceWords({ date: '2031-10-16', time: '07:00' }, '2031-10-16')).toBe('Hoy 7 a.m.');
    expect(occurrenceWords({ date: '2031-10-30' }, '2031-10-16')).toBe('Jue 30 de oct');
    expect(eventWhen(trash, { date: '2031-10-23', time: '13:00' }, '2031-10-22')).toBe('Recolección de basura mañana a la 1 p.m.');
    expect(eventWhen(trash, { date: '2031-10-25' }, '2031-10-22')).toBe('Recolección de basura el sábado');
    expect(lastDoneText('2031-07-16', '2031-10-16')).toBe('Hecho hace 3 meses');
    expect(warrantyText('2031-12-01', '2031-10-16')).toBe('Vence en 46 días');
    expect(categoryLabel('pest')).toBe('Control de plagas');
    expect(roleLabel('plumber')).toBe('Plomero');
    expect(roleLabel('Window washer')).toBe('Window washer');

    await setLangForTests('nl', ['nl-NL']);
    expect(occurrenceWords({ date: '2031-10-17', time: '07:00' }, '2031-10-16')).toBe('Morgen 7:00');
    expect(eventWhen(trash, { date: '2031-10-23', time: '07:00' }, '2031-10-22')).toBe('Recolección de basura morgen om 7:00');
    expect(eventPresets().find((p) => p.id === 'trash')).toMatchObject({ title: 'Afval ophalen', prep: { title: 'Container aan de straat zetten' } });
  });

  test('reminders carry every language; the household’s titles stay as entered', async () => {
    await setLangForTests('en');
    const now = atTime('2031-10-22', '12:00');
    const [r] = await localizeReminders(() => prepReminders([trash], [], now, 'https://example.com/home/'));
    expect(r.texts.en).toEqual({ title: 'Sacar la basura', body: 'Recolección de basura tomorrow at 7 AM' });
    expect(r.texts.es?.body).toBe('Recolección de basura mañana a las 7 a.m.');
    expect(r.texts.nl?.body).toBe('Recolección de basura morgen om 7:00');
  });
});

describe('the household’s own words, in any app language', () => {
  test('pickups and lawn services in Spanish and Dutch are recognised', () => {
    expect(guessEventKind('Recolección de basura')).toBe('trash');
    expect(guessEventKind('Reciclaje martes')).toBe('recycling');
    expect(guessEventKind('Corte de césped')).toBe('lawn');
    expect(guessEventKind('Jardín de niños')).toBeNull();
    expect(guessEventKind('Afval ophalen')).toBe('trash');
    expect(guessEventKind('Oud papier')).toBe('recycling');
    expect(guessEventKind('GFT-container')).toBe('yard waste');
    expect(guessEventKind('Plastic afval')).toBe('recycling');
    expect(guessEventKind('Grasmaaien')).toBe('lawn');
    expect(guessEventKind('Vuilnis buiten zetten')).toBe('trash');
    for (const title of ['Basura', 'Reciclaje', 'Corte de césped', 'Jardín', 'Afval', 'Vuilniswagen', 'Oud papier', 'Gft', 'Plastic', 'Grasmaaien', 'Tuin'])
      expect(REGULAR_WORDS.test(title)).toBe(true);
    expect(guessCategory('Fumigación trimestral')).toBe('pest');
    expect(guessCategory('Onderhoud cv-ketel')).toBe('hvac');
    expect(guessCategory('Loodgieter komt')).toBe('plumbing');
  });

  test('calendar scans look for English and the app language’s words', () => {
    expect(calendarWords('en')).toContain('garbage');
    expect(calendarWords('en')).not.toContain('basura');
    expect(calendarWords('es')).toEqual(expect.arrayContaining(['garbage', 'basura', 'reciclaje', 'césped', 'jardín']));
    expect(calendarWords('nl')).toEqual(expect.arrayContaining(['trash', 'afval', 'vuilnis', 'oud papier', 'gft', 'plastic', 'grasmaaien', 'tuin']));
  });
});
