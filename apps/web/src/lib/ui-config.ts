import type { Role, State } from '@app/shared'

export const ROLE_COLORS: Record<Role, 'gray' | 'green' | 'gold' | 'purple'> = {
  employee: 'gray',
  manager: 'green',
  finance: 'gold',
  admin: 'purple',
}

export type StateColor = 'gray' | 'blue' | 'violet' | 'amber' | 'green' | 'red'

export const STATE_BADGES: Record<State, { label: string; color: StateColor }> = {
  draft: { label: 'Draft', color: 'gray' },
  submitted: { label: 'Submitted', color: 'blue' },
  manager_approved: { label: 'Manager approved', color: 'violet' },
  finance_approved: { label: 'Finance approved', color: 'amber' },
  paid: { label: 'Paid', color: 'green' },
  rejected: { label: 'Rejected', color: 'red' },
}

export const ROLE_BUTTONS: Record<Role, { label: string; to: State }[]> = {
  employee: [
    { label: 'Submit', to: 'submitted' },
    { label: 'Withdraw', to: 'draft' },
  ],
  manager: [
    { label: 'Approve', to: 'manager_approved' },
    { label: 'Reject', to: 'rejected' },
  ],
  finance: [
    { label: 'Approve', to: 'finance_approved' },
    { label: 'Reject', to: 'rejected' },
    { label: 'Mark paid', to: 'paid' },
  ],
  admin: [
    { label: 'Submit', to: 'submitted' },
    { label: 'Withdraw', to: 'draft' },
    { label: 'Manager approve', to: 'manager_approved' },
    { label: 'Finance approve', to: 'finance_approved' },
    { label: 'Reject', to: 'rejected' },
    { label: 'Mark paid', to: 'paid' },
  ],
}

/** ui.md §9: admin's buttons are shown in labelled groups by process stage (targets refer to ROLE_BUTTONS). */
export const ROLE_BUTTON_GROUPS: Partial<Record<Role, { label: string; targets: State[] }[]>> = {
  admin: [
    { label: 'Employee', targets: ['submitted', 'draft'] },
    { label: 'Approval', targets: ['manager_approved', 'finance_approved', 'rejected'] },
    { label: 'Payment', targets: ['paid'] },
  ],
}
