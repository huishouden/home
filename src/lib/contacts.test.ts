import { expect, test } from 'bun:test';
import { contactInput, groupContacts, type Contact } from '@huishouden/pwa-kit/contacts';
import { APP, ROLES } from './contacts';

const c = (name: string, role?: string): Contact => ({ id: name, name, ...(role ? { role } : {}), apps: ['home'], createdAt: 1, by: 'sam@example.com' });

test("Home's roles in order, then typed roles, then Other", () => {
  const groups = groupContacts([c('Zed', 'Pest control'), c('Amy'), c('Bo', 'Window washer'), c('Cy', 'hvac'), c('Al', 'Pest control')], ROLES);
  expect(groups.map((g) => [g.role, g.contacts.map((x) => x.name)])).toEqual([
    ['HVAC', ['Cy']],
    ['Pest control', ['Al', 'Zed']],
    ['Window washer', ['Bo']],
    ['Other', ['Amy']],
  ]);
});

test('saved contacts show in Home and keep the other apps', () => {
  expect(contactInput({ name: ' Example Lawn Care ', website: 'lawn.example.com' }, ['baby'], APP).apps).toEqual(['baby', 'home']);
});
