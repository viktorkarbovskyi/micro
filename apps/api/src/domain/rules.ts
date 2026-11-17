import type { Actor, Role, State } from '@app/shared';

export type Outcome = 'OK' | 'NOT_VISIBLE' | 'FORBIDDEN' | 'NOT_EDITABLE' | 'ILLEGAL_TRANSITION';

export interface ReportRef {
  ownerId: string;
  state: State;
}

export interface TransitionRow {
  from: State;
  to: State;
  role: Role;
  ownerOnly: boolean;
}

// Transition table T1-T7 (specs/state-machine.md §4.1). The only place it is encoded.
export const TRANSITIONS: readonly TransitionRow[] = [
  { from: 'draft', to: 'submitted', role: 'employee', ownerOnly: true },
  { from: 'submitted', to: 'draft', role: 'employee', ownerOnly: true },
  { from: 'submitted', to: 'manager_approved', role: 'manager', ownerOnly: false },
  { from: 'submitted', to: 'rejected', role: 'manager', ownerOnly: false },
  { from: 'manager_approved', to: 'finance_approved', role: 'finance', ownerOnly: false },
  { from: 'manager_approved', to: 'rejected', role: 'finance', ownerOnly: false },
  { from: 'finance_approved', to: 'paid', role: 'finance', ownerOnly: false },
];

const isOwner = (actor: Actor, report: ReportRef): boolean => actor.id === report.ownerId;

export function canSee(actor: Actor, report: ReportRef): boolean {
  if (actor.role === 'admin') return true;
  if (isOwner(actor, report)) return true;
  return (actor.role === 'manager' || actor.role === 'finance') && report.state !== 'draft';
}

export function decideCreate(actor: Actor): 'OK' | 'FORBIDDEN' {
  return actor.role === 'employee' ? 'OK' : 'FORBIDDEN';
}

export function decideTransition(actor: Actor, report: ReportRef, to: State): Outcome {
  if (!canSee(actor, report)) return 'NOT_VISIBLE';
  const row = TRANSITIONS.find((t) => t.from === report.state && t.to === to);
  if (!row) return 'ILLEGAL_TRANSITION';
  if (actor.role === 'admin') return 'OK';
  if (actor.role === row.role && (!row.ownerOnly || isOwner(actor, report))) return 'OK';
  return 'ILLEGAL_TRANSITION';
}

export function decideEdit(actor: Actor, report: ReportRef): Outcome {
  if (!canSee(actor, report)) return 'NOT_VISIBLE';
  if (!isOwner(actor, report) || actor.role !== 'employee') return 'FORBIDDEN';
  if (report.state !== 'draft') return 'NOT_EDITABLE';
  return 'OK';
}
