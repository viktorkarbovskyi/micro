export const ROLES = ['employee', 'manager', 'finance', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export const STATES = ['draft', 'submitted', 'manager_approved', 'finance_approved', 'paid', 'rejected'] as const;
export type State = (typeof STATES)[number];

export const CURRENCIES = ['USD', 'EUR', 'UAH'] as const;
export type Currency = (typeof CURRENCIES)[number];
export const DEFAULT_CURRENCY: Currency = 'USD';

export interface DemoUser {
  id: string;
  name: string;
  role: Role;
}

export const DEMO_USERS: readonly DemoUser[] = [
  { id: '7b0e8f3a-2c1d-4e5f-9a6b-1c2d3e4f5a01', name: 'Harry Potter', role: 'employee' },
  { id: '7b0e8f3a-2c1d-4e5f-9a6b-1c2d3e4f5a02', name: 'Hermione Granger', role: 'employee' },
  { id: '7b0e8f3a-2c1d-4e5f-9a6b-1c2d3e4f5a03', name: 'Minerva McGonagall', role: 'manager' },
  { id: '7b0e8f3a-2c1d-4e5f-9a6b-1c2d3e4f5a04', name: 'Griphook', role: 'finance' },
  { id: '7b0e8f3a-2c1d-4e5f-9a6b-1c2d3e4f5a05', name: 'Albus Dumbledore', role: 'admin' },
];

export interface Actor {
  id: string;
  role: Role;
}

export interface Report {
  id: string;
  ownerId: string;
  title: string;
  amountCents: number;
  currency: Currency;
  state: State;
  createdAt: string;
  updatedAt: string;
}

export interface AuditEvent {
  id: string;
  reportId: string;
  from: State | null;
  to: State;
  actorId: string;
  role: Role;
  at: string;
  note?: string;
}

export interface Problem {
  type: string;
  title: string;
  status: number;
  detail: string;
  code: string;
  errors?: { field: string; message: string }[];
}
