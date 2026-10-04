import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { shareContactCard } from '@huishouden/pwa-kit/e2e';
import peopleSearch from './fixtures/contacts/people-search.json' with { type: 'json' };
import otherContacts from './fixtures/contacts/other-contacts.json' with { type: 'json' };

// Filling a provider from the person's own contacts, on the sample house (signed out, nothing saved):
// a contact card file, the phone's contact picker, Google Contacts (People API stubbed with invented
// people) and a card shared into the app.

const fixture = (name: string) => new URL(`./fixtures/contacts/${name}`, import.meta.url).pathname;

const newContact = async (page: Page) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Contacts', exact: true }).click();
  await page.getByRole('button', { name: 'Add contact' }).click();
  return page.getByRole('dialog', { name: 'New contact' });
};

test('a contact card fills the new contact', async ({ page }) => {
  const dialog = await newContact(page);
  const chooser = page.waitForEvent('filechooser');
  await dialog.getByRole('button', { name: 'Import a contact card' }).click();
  await (await chooser).setFiles(fixture('landlord.vcf'));

  await expect(dialog.getByText('Filled in the name, role, phone, email, address, and notes from the contact card. Check them before saving.')).toBeVisible();
  await expect(dialog.getByLabel('Name', { exact: true })).toHaveValue('Jordan Example');
  await expect(dialog.getByLabel('Phone', { exact: true })).toHaveValue('(555) 010-0142');
  await expect(dialog.getByLabel('Email', { exact: true })).toHaveValue('jordan@example.com');
  await expect(dialog.getByLabel('Address', { exact: true })).toHaveValue('12 Example Street, Suite 3, Springfield, IL 62704, United States');
  await expect(dialog.getByLabel('Notes')).toHaveValue('Other phones: (555) 010-0143 (work)\nRent due on the 1st.');
  await dialog.getByRole('button', { name: 'Landlord' }).click();
  await dialog.getByRole('button', { name: 'Save' }).click();

  const card = page.getByRole('region', { name: 'Jordan Example' });
  await expect(card).toContainText('Landlord');
  await expect(card.getByRole('link', { name: 'Call Jordan Example, (555) 010-0142' })).toHaveAttribute('href', 'tel:5550100142');
});

test('a file with two people asks which one', async ({ page }) => {
  const dialog = await newContact(page);
  const chooser = page.waitForEvent('filechooser');
  await dialog.getByRole('button', { name: 'Import a contact card' }).click();
  await (await chooser).setFiles(fixture('two.vcf'));
  const people = dialog.getByRole('list', { name: 'Contacts to choose from' }).getByRole('button');
  await expect(people).toHaveCount(2);
  await people.filter({ hasText: 'Example Lawn Co.' }).click();
  await expect(dialog.getByLabel('Name', { exact: true })).toHaveValue('Example Lawn Co.');
  await expect(dialog.getByLabel('Phone', { exact: true })).toHaveValue('555-010-0162');
});

test('"Pick from my contacts" only where the browser has a contact picker', async ({ page }) => {
  const dialog = await newContact(page);
  await expect(dialog.getByRole('button', { name: 'Import a contact card' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Pick from my contacts' })).toHaveCount(0);
});

test('the phone’s contact picker fills the new contact', async ({ page }) => {
  // Chrome on Android's Contact Picker, stood in for: one contact chosen.
  await page.addInitScript(() => {
    Object.assign(window, { ContactsManager: function ContactsManager() {} });
    Object.defineProperty(navigator, 'contacts', {
      value: {
        getProperties: async () => ['name', 'tel', 'email', 'address'],
        select: async () => [{ name: ['Riley Sample'], tel: ['555-010-0161'], email: ['riley@example.com'], address: [] }],
      },
    });
  });
  const dialog = await newContact(page);
  await dialog.getByRole('button', { name: 'Pick from my contacts' }).click();
  await expect(dialog.getByLabel('Name', { exact: true })).toHaveValue('Riley Sample');
  await expect(dialog.getByLabel('Phone', { exact: true })).toHaveValue('555-010-0161');
  await expect(dialog.getByText('from your contacts')).toBeVisible();
});

test('Find in my Google Contacts searches saved and other contacts', async ({ page }) => {
  await page.addInitScript(() => Object.assign(window, { __mockGoogleContactsToken: 'contacts-token' }));
  const asked: string[] = [];
  await page.route('https://people.googleapis.com/**', (route) => {
    const url = new URL(route.request().url());
    const q = url.searchParams.get('query') ?? '';
    asked.push(`${url.pathname} ${q}`);
    expect(route.request().headers().authorization).toBe('Bearer contacts-token');
    if (!q) return route.fulfill({ json: {} });
    return route.fulfill({ json: url.pathname.endsWith('people:searchContacts') ? peopleSearch : otherContacts });
  });
  const dialog = await newContact(page);
  await dialog.getByRole('button', { name: 'Find in my Google Contacts' }).click();
  await expect(dialog.getByText('If Google says it hasn’t verified this app')).toBeVisible();
  await dialog.getByLabel('Name, email or phone').fill('jordan');
  await dialog.getByRole('button', { name: 'Search', exact: true }).first().click();

  const people = dialog.getByRole('list', { name: 'Contacts to choose from' }).getByRole('button');
  await expect(people).toHaveCount(2);
  await people.filter({ hasText: 'Jordan Example' }).click();
  await expect(dialog.getByLabel('Name', { exact: true })).toHaveValue('Jordan Example');
  await expect(dialog.getByLabel('Address', { exact: true })).toHaveValue('12 Example Street, Springfield, IL 62704');
  // Google asks for an empty search first to warm its cache.
  expect(asked).toEqual(['/v1/people:searchContacts ', '/v1/otherContacts:search ', '/v1/people:searchContacts jordan', '/v1/otherContacts:search jordan']);
});

test('a contact card shared to the app opens a new contact, filled in', async ({ page }) => {
  await shareContactCard(page, readFileSync(fixture('landlord.vcf'), 'utf8'), { name: 'Jordan Example.vcf', path: './' });
  const dialog = page.getByRole('dialog', { name: 'New contact' });
  await expect(dialog.getByLabel('Name', { exact: true })).toHaveValue('Jordan Example');
  await expect(dialog.getByText('from the shared contact')).toBeVisible();
  await expect(page).not.toHaveURL(/share=contact/);
});
