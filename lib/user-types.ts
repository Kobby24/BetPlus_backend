export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  balance: number;
  createdAt: string;
  /** Granted by admin — shows Manager tab and match control tools */
  isManager?: boolean;
  /** Unique invite code for managers — used in ?ref= links */
  referralCode?: string;
  /** Set at signup when user registers with a manager's referral code */
  referredByManagerId?: string;
}

export interface UserSettings {
  notifications: boolean;
  oddsFormat: "decimal" | "fractional";
  language: string;
  /** When true, manager tools and ticket editing are available (managers only). */
  managerMode?: boolean;
}

export interface StoredUser extends User {
  password: string;
  settings: UserSettings;
}

export const DEFAULT_SETTINGS: UserSettings = {
  notifications: true,
  oddsFormat: "decimal",
  language: "en",
  managerMode: false,
};

export function normalizeUserSettings(
  settings: Partial<UserSettings> | null | undefined,
): UserSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    managerMode: settings?.managerMode ?? false,
  };
}

export function canUseManagerTools(
  user: User | null | undefined,
  settings: UserSettings,
): boolean {
  return user?.isManager === true && settings.managerMode === true;
}
