import { describe, expect, it } from 'vitest';
import { STATES, type Actor, type State } from '@app/shared';
import { canSee, decideCreate, decideEdit, decideTransition, TRANSITIONS } from '../src/domain/rules.js';

const H: Actor = { id: 'h', role: 'employee' };
const G: Actor = { id: 'g', role: 'employee' };
const M: Actor = { id: 'm', role: 'manager' };
const F: Actor = { id: 'f', role: 'finance' };
const A: Actor = { id: 'a', role: 'admin' };
const HasM: Actor = { id: 'h', role: 'manager' };
const r = (state: State) => ({ ownerId: 'h', state });

describe('create', () => {
  it.each([
    [H, 'OK'],
    [M, 'FORBIDDEN'],
    [A, 'FORBIDDEN'],
  ] as const)('create %#', (a, out) => expect(decideCreate(a)).toBe(out));
});

describe('reference scenarios', () => {
  const rows: [number | string, State, Actor, string, string][] = [
    [4, 'draft', H, 'submitted', 'OK'], [5, 'draft', G, 'submitted', 'NOT_VISIBLE'], [6, 'draft', M, 'read', 'NOT_VISIBLE'],
    ['6a', 'draft', M, 'submitted', 'NOT_VISIBLE'], ['6b', 'draft', G, 'edit', 'NOT_VISIBLE'], ['6c', 'draft', HasM, 'submitted', 'ILLEGAL_TRANSITION'],
    [7, 'draft', A, 'read', 'OK'], [8, 'draft', A, 'submitted', 'OK'], [9, 'draft', H, 'paid', 'ILLEGAL_TRANSITION'],
    [10, 'draft', H, 'edit', 'OK'], [11, 'draft', A, 'edit', 'FORBIDDEN'], [12, 'submitted', H, 'edit', 'NOT_EDITABLE'],
    [13, 'submitted', M, 'edit', 'FORBIDDEN'], [14, 'submitted', H, 'draft', 'OK'], [15, 'submitted', H, 'manager_approved', 'ILLEGAL_TRANSITION'],
    [16, 'submitted', M, 'manager_approved', 'OK'], [17, 'submitted', F, 'manager_approved', 'ILLEGAL_TRANSITION'], [18, 'submitted', M, 'rejected', 'OK'],
    [19, 'manager_approved', F, 'finance_approved', 'OK'], [20, 'manager_approved', M, 'finance_approved', 'ILLEGAL_TRANSITION'],
    [21, 'manager_approved', F, 'rejected', 'OK'], [22, 'finance_approved', F, 'paid', 'OK'], [23, 'finance_approved', M, 'paid', 'ILLEGAL_TRANSITION'],
    [24, 'paid', F, 'finance_approved', 'ILLEGAL_TRANSITION'], [25, 'paid', A, 'draft', 'ILLEGAL_TRANSITION'], [26, 'rejected', A, 'submitted', 'ILLEGAL_TRANSITION'],
    [27, 'submitted', M, 'submitted', 'ILLEGAL_TRANSITION'], [28, 'submitted', G, 'read', 'NOT_VISIBLE'], ['28a', 'submitted', G, 'draft', 'NOT_VISIBLE'],
    [29, 'submitted', HasM, 'manager_approved', 'OK'],
  ];
  it.each(rows)('scenario %s', (_n, state, actor, op, out) => {
    const rep = r(state);
    const got =
      op === 'read' ? (canSee(actor, rep) ? 'OK' : 'NOT_VISIBLE')
      : op === 'edit' ? decideEdit(actor, rep)
      : decideTransition(actor, rep, op as State);
    expect(got).toBe(out);
  });
});

describe('admin', () => {
  it.each(TRANSITIONS.map((t) => [t.from, t.to] as const))('admin may perform %s -> %s on another owner\'s report', (from, to) => {
    expect(decideTransition(A, r(from), to)).toBe('OK');
  });

  it('gets ILLEGAL_TRANSITION for every pair not in the table', () => {
    for (const from of STATES) {
      for (const to of STATES) {
        if (TRANSITIONS.some((t) => t.from === from && t.to === to)) continue;
        expect(decideTransition(A, r(from), to), `${from} -> ${to}`).toBe('ILLEGAL_TRANSITION');
      }
    }
  });
});

describe('table', () => {
  it('has exactly 7 rows', () => expect(TRANSITIONS).toHaveLength(7));
});
