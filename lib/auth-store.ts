import type { StoredUser, User, UserSettings } from "./user-types";
import { DEFAULT_SETTINGS, normalizeUserSettings } from "./user-types";

const USERS_KEY = "betplus_users";
const SESSION_KEY = "betplus_session";

function readUsers(): StoredUser[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(USERS_KEY);
    return raw ? (JSON.parse(raw) as StoredUser[]) : [];
  } catch {
    return [];
  }
}

function writeUsers(users: StoredUser[]) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function emitBalanceUpdated(userId: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("betplus:balance-updated", { detail: { userId } }),
  );
}

function emitUserUpdated(userId: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("betplus:user-updated", { detail: { userId } }),
  );
}

function generateReferralCode(name: string, userId: string): string {
  const prefix =
    name
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(0, 4)
      .toUpperCase() || "MGR";
  const suffix = userId.replace(/-/g, "").slice(0, 4).toUpperCase();
  return `${prefix}${suffix}`;
}

function isReferralCodeTaken(code: string, exceptUserId?: string): boolean {
  return readUsers().some(
    (user) =>
      user.referralCode?.toUpperCase() === code.toUpperCase() &&
      user.id !== exceptUserId,
  );
}

export function ensureManagerReferralCode(userId: string): string | null {
  const users = readUsers();
  const index = users.findIndex((u) => u.id === userId);
  if (index === -1) return null;
  if (!users[index].isManager) return null;
  if (users[index].referralCode) return users[index].referralCode!;

  let code = generateReferralCode(users[index].name, users[index].id);
  let attempt = 0;
  while (isReferralCodeTaken(code, userId) && attempt < 20) {
    code = `${generateReferralCode(users[index].name, users[index].id)}${attempt + 1}`;
    attempt += 1;
  }

  users[index].referralCode = code;
  writeUsers(users);
  emitUserUpdated(userId);

  return code;
}

export function findManagerByReferralCode(code: string): User | null {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return null;

  const manager = readUsers().find(
    (user) =>
      user.isManager === true &&
      user.referralCode?.toUpperCase() === normalized,
  );
  return manager ? toPublicUser(manager) : null;
}

function toPublicUser(stored: StoredUser): User {
  const { password: _, settings: __, ...user } = stored;
  return { ...user, isManager: user.isManager ?? false };
}

export function getSessionUserId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(SESSION_KEY);
}

export function setSessionUserId(id: string | null) {
  if (id) {
    localStorage.setItem(SESSION_KEY, id);
  } else {
    localStorage.removeItem(SESSION_KEY);
  }
}

export function getCurrentUser(): User | null {
  const id = getSessionUserId();
  if (!id) return null;
  const user = readUsers().find((u) => u.id === id);
  if (!user) return null;
  return toPublicUser(user);
}

export function getAllUsers(): User[] {
  return readUsers().map(toPublicUser);
}

export function getUserById(userId: string): User | null {
  const user = readUsers().find((u) => u.id === userId);
  if (!user) return null;
  return toPublicUser(user);
}

export function setUserBalance(
  userId: string,
  balance: number,
): { user: User } | { error: string } {
  const users = readUsers();
  const index = users.findIndex((u) => u.id === userId);
  if (index === -1) return { error: "User not found." };
  if (balance < 0) return { error: "Balance cannot be negative." };

  users[index].balance = Math.round(balance * 100) / 100;
  writeUsers(users);
  emitBalanceUpdated(userId);

  return { user: toPublicUser(users[index]) };
}

/** Admin grants or revokes manager tools on a user account. */
export function setUserManagerRole(
  userId: string,
  isManager: boolean,
): { user: User } | { error: string } {
  const users = readUsers();
  const index = users.findIndex((u) => u.id === userId);
  if (index === -1) return { error: "User not found." };

  users[index].isManager = isManager;
  writeUsers(users);
  if (isManager) {
    ensureManagerReferralCode(userId);
  }
  emitUserUpdated(userId);

  const updated = readUsers().find((u) => u.id === userId);
  if (!updated) return { error: "User not found." };

  return { user: toPublicUser(updated) };
}

/** Create a user if the email is not registered yet (demo / admin seed). */
export function ensureUser(input: {
  name: string;
  email: string;
  phone: string;
  password: string;
  balance?: number;
}): User {
  const users = readUsers();
  const email = input.email.trim().toLowerCase();
  const existing = users.find((u) => u.email === email);
  if (existing) {
    return toPublicUser(existing);
  }

  const stored: StoredUser = {
    id: crypto.randomUUID(),
    name: input.name.trim(),
    email,
    phone: input.phone.trim(),
    password: input.password,
    balance: input.balance ?? 50,
    createdAt: new Date().toISOString(),
    settings: DEFAULT_SETTINGS,
    isManager: false,
  };

  users.push(stored);
  writeUsers(users);

  return toPublicUser(stored);
}

export function registerUser(input: {
  name: string;
  email: string;
  phone: string;
  password: string;
  referralCode?: string;
}): { user: User } | { error: string } {
  const users = readUsers();
  const email = input.email.trim().toLowerCase();
  const phone = input.phone.trim();

  if (users.some((u) => u.email === email)) {
    return { error: "An account with this email already exists." };
  }
  if (users.some((u) => u.phone === phone)) {
    return { error: "An account with this phone number already exists." };
  }
  if (input.password.length < 6) {
    return { error: "Password must be at least 6 characters." };
  }

  let referredByManagerId: string | undefined;
  if (input.referralCode) {
    const manager = findManagerByReferralCode(input.referralCode);
    if (manager) {
      referredByManagerId = manager.id;
    }
  }

  const stored: StoredUser = {
    id: crypto.randomUUID(),
    name: input.name.trim(),
    email,
    phone,
    password: input.password,
    balance: 50,
    createdAt: new Date().toISOString(),
    settings: DEFAULT_SETTINGS,
    isManager: false,
    referredByManagerId,
  };

  users.push(stored);
  writeUsers(users);
  setSessionUserId(stored.id);

  return { user: toPublicUser(stored) };
}

export function loginUser(input: {
  identifier: string;
  password: string;
}): { user: User } | { error: string } {
  const users = readUsers();

  const identifier = input.identifier.trim();
  const found = users.find(
    (u) =>
      u.email === identifier.toLowerCase() || u.phone === identifier,
  );

  if (!found || found.password !== input.password) {
    return { error: "Invalid email/phone or password." };
  }

  setSessionUserId(found.id);
  return { user: toPublicUser(found) };
}

export function logoutUser() {
  setSessionUserId(null);
}

export function updateUserProfile(
  userId: string,
  updates: Partial<Pick<User, "name" | "email" | "phone">>,
): { user: User } | { error: string } {
  const users = readUsers();
  const index = users.findIndex((u) => u.id === userId);
  if (index === -1) return { error: "User not found." };

  const current = users[index];
  if (updates.email && updates.email !== current.email) {
    if (users.some((u) => u.email === updates.email && u.id !== userId)) {
      return { error: "Email is already in use." };
    }
  }
  if (updates.phone && updates.phone !== current.phone) {
    if (users.some((u) => u.phone === updates.phone && u.id !== userId)) {
      return { error: "Phone number is already in use." };
    }
  }

  users[index] = { ...current, ...updates };
  writeUsers(users);
  emitUserUpdated(userId);

  return { user: toPublicUser(users[index]) };
}

export function updateUserPassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): { ok: true } | { error: string } {
  const users = readUsers();
  const index = users.findIndex((u) => u.id === userId);
  if (index === -1) return { error: "User not found." };
  if (users[index].password !== currentPassword) {
    return { error: "Current password is incorrect." };
  }
  if (newPassword.length < 6) {
    return { error: "New password must be at least 6 characters." };
  }

  users[index].password = newPassword;
  writeUsers(users);
  return { ok: true };
}

export function updateUserSettings(
  userId: string,
  settings: Partial<UserSettings>,
): UserSettings | null {
  const users = readUsers();
  const index = users.findIndex((u) => u.id === userId);
  if (index === -1) return null;

  users[index].settings = normalizeUserSettings({
    ...users[index].settings,
    ...settings,
  });
  writeUsers(users);
  return users[index].settings;
}

export function getUserSettings(userId: string): UserSettings | null {
  const user = readUsers().find((u) => u.id === userId);
  return user ? normalizeUserSettings(user.settings) : null;
}

export function updateUserBalance(
  userId: string,
  delta: number,
): { user: User } | { error: string } {
  const users = readUsers();
  const index = users.findIndex((u) => u.id === userId);
  if (index === -1) return { error: "User not found." };

  const newBalance = users[index].balance + delta;
  if (newBalance < 0) return { error: "Insufficient balance." };

  users[index].balance = Math.round(newBalance * 100) / 100;
  writeUsers(users);
  emitBalanceUpdated(userId);

  return { user: toPublicUser(users[index]) };
}
