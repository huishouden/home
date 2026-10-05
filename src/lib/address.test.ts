import { afterEach, describe, expect, test } from 'bun:test';
import { coordinates } from '@huishouden/pwa-kit/contact-core';
import { formatFromHome, setHome, toHome } from '@huishouden/pwa-kit/home';
import { can, type Role } from '@huishouden/pwa-kit/roles';
import { homeMapUrl, maySetHome } from './address';
import { DEMO_HOME, demoData } from './demo';

afterEach(() => setHome(undefined));

const roleState = (role: Role) => ({ can: (action: Parameters<typeof can>[1]) => can(role, action) });

describe('the home address on the overview', () => {
  test('the sample home is a usable, invented one', () => {
    expect(toHome(DEMO_HOME)).toEqual(DEMO_HOME);
    expect(DEMO_HOME.address).toContain('Example Lane');
  });

  test('links the house on the map, or the neighbourhood when approximate', () => {
    expect(homeMapUrl(DEMO_HOME)).toBe('https://www.openstreetmap.org/?mlat=39.78170&mlon=-89.65010#map=17/39.78170/-89.65010');
    expect(homeMapUrl({ ...DEMO_HOME, approximate: true })).toEndWith('#map=14/39.78170/-89.65010');
  });

  test('only admins and members are asked to set it', () => {
    expect(maySetHome(roleState('admin'))).toBe(true);
    expect(maySetHome(roleState('member'))).toBe(true);
    expect(maySetHome(roleState('helper'))).toBe(false);
    expect(maySetHome(roleState('kid'))).toBe(false);
    // The signed-out sample: as an admin, or as its helper view.
    expect(maySetHome(undefined)).toBe(true);
    expect(maySetHome(undefined, true)).toBe(false);
  });
});

describe('contacts from home', () => {
  test('sample providers with an address say how far they are from the sample home', () => {
    setHome(DEMO_HOME);
    const far = demoData()
      .contacts.filter((c) => c.address)
      .map((c) => [c.name, formatFromHome(coordinates(c), { locale: 'en-US' })]);
    expect(far).toEqual([
      ['Example Heating & Air', '1.1 mi from home'],
      ['Example Pest Control', '2.2 mi from home'],
      ['Example Plumbing', '1.4 mi from home'],
    ]);
  });

  test('nothing is said without a home or a position', () => {
    const [hvac] = demoData().contacts;
    expect(formatFromHome(coordinates(hvac), { locale: 'en-US' })).toBeUndefined();
    setHome(DEMO_HOME);
    expect(formatFromHome(coordinates({ lat: undefined, lng: undefined }), { locale: 'en-US' })).toBeUndefined();
  });
});
