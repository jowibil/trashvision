export const ROLES = {
  GUEST: "guest",
  COMMUNITY: "community",
  ADMIN: "admin",
} as const;

export type Role = typeof ROLES[keyof typeof ROLES];

export const roleHierarchy: Record<Role, number> = {
  guest: 0,
  community: 1,
  admin: 2,
};

