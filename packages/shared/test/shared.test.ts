import { describe, expect, it } from 'vitest';
import { CURRENCIES, DEFAULT_CURRENCY, DEMO_USERS, ROLES, STATES } from '../src/index';

describe('shared definitions', () => {
  it('exposes states, roles and currencies in order', () => {
    expect(STATES).toEqual(['draft', 'submitted', 'manager_approved', 'finance_approved', 'paid', 'rejected']);
    expect(ROLES).toEqual(['employee', 'manager', 'finance', 'admin']);
    expect(CURRENCIES).toEqual(['USD', 'EUR', 'UAH']);
    expect(DEFAULT_CURRENCY).toBe('USD');
  });

  it('exposes the demo users in order with unique UUIDs', () => {
    expect(DEMO_USERS.map((u) => [u.name, u.role])).toEqual([
      ['Harry Potter', 'employee'],
      ['Hermione Granger', 'employee'],
      ['Minerva McGonagall', 'manager'],
      ['Griphook', 'finance'],
      ['Albus Dumbledore', 'admin'],
    ]);
    expect(new Set(DEMO_USERS.map((u) => u.id)).size).toBe(5);
    DEMO_USERS.forEach((u) =>
      expect(u.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/),
    );
  });
});
