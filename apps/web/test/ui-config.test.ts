import { describe, expect, it } from 'vitest'
import { ROLE_BUTTON_GROUPS, ROLE_BUTTONS, ROLE_COLORS, STATE_BADGES } from '../src/lib/ui-config'

describe('ui-config', () => {
  it('role colors (ui.md §4)', () => {
    expect(ROLE_COLORS).toEqual({ employee: 'gray', manager: 'green', finance: 'gold', admin: 'purple' })
  })

  it('state badges (ui.md §5)', () => {
    expect(STATE_BADGES).toEqual({
      draft: { label: 'Draft', color: 'gray' },
      submitted: { label: 'Submitted', color: 'blue' },
      manager_approved: { label: 'Manager approved', color: 'violet' },
      finance_approved: { label: 'Finance approved', color: 'amber' },
      paid: { label: 'Paid', color: 'green' },
      rejected: { label: 'Rejected', color: 'red' },
    })
  })

  it('role buttons (ui.md §9)', () => {
    expect(ROLE_BUTTONS).toEqual({
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
    })
  })

  it('admin button groups (ui.md §9)', () => {
    expect(ROLE_BUTTON_GROUPS).toEqual({
      admin: [
        { label: 'Employee', targets: ['submitted', 'draft'] },
        { label: 'Approval', targets: ['manager_approved', 'finance_approved', 'rejected'] },
        { label: 'Payment', targets: ['paid'] },
      ],
    })
    const grouped = ROLE_BUTTON_GROUPS.admin!.flatMap((g) => g.targets)
    expect(grouped).toEqual(ROLE_BUTTONS.admin.map((b) => b.to))
  })
})
