import { expect, test } from 'bun:test';
import type { Contact } from '@huishouden/pwa-kit/contacts';
import { contactInput, displayWebsite, groupContacts } from './contacts';

const c = (name: string, role?: string): Contact => ({ id: name, name, ...(role ? { role } : {}), apps: ['home'], createdAt: 1, by: 'sam@example.com' });

test('known roles in order, then typed roles, then Other', () => {
  const groups = groupContacts([c('Zed', 'Pest control'), c('Amy'), c('Bo', 'Window washer'), c('Cy', 'hvac'), c('Al', 'Pest control')]);
  expect(groups.map((g) => [g.role, g.contacts.map((x) => x.name)])).toEqual([
    ['HVAC', ['Cy']],
    ['Pest control', ['Al', 'Zed']],
    ['Window washer', ['Bo']],
    ['Other', ['Amy']],
  ]);
});

test('saved contacts show in Home and keep the other apps', () => {
  expect(contactInput({ name: ' Example Lawn Care ', website: 'lawn.example.com', phone: '' }, ['baby'])).toEqual({
    name: 'Example Lawn Care',
    role: undefined,
    phone: undefined,
    email: undefined,
    website: 'https://lawn.example.com',
    address: undefined,
    mapsUrl: undefined,
    notes: undefined,
    apps: ['baby', 'home'],
  });
  expect(displayWebsite('https://www.lawn.example.com/')).toBe('lawn.example.com');
});
