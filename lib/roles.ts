export const ROLES = ['line_crew', 'cashier', 'prep', 'kitchen'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  line_crew: 'Line Crew',
  cashier:   'Cashier',
  prep:      'Prep',
  kitchen:   'Kitchen',
};
