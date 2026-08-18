"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { formatMoney } from "@/lib/utils";

type SettingsTab = "profile" | "password" | "preferences";

export function PersonalSettings({
  onBack,
  initialTab = "profile",
}: {
  onBack: () => void;
  initialTab?: SettingsTab;
}) {
  const { user, settings, updateProfile, changePassword, saveSettings, setManagerMode, canManage } =
    useAuth();

  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    if (user) {
      setName(user.name);
      setEmail(user.email);
      setPhone(user.phone);
    }
  }, [user]);

  const [profileMsg, setProfileMsg] = useState("");
  const [profileError, setProfileError] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordMsg, setPasswordMsg] = useState("");
  const [passwordError, setPasswordError] = useState("");

  if (!user) return null;

  const username = user.email.split("@")[0];
  const memberSince = new Date(user.createdAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  async function handleProfileSave(e: React.FormEvent) {
    e.preventDefault();
    setProfileError("");
    setProfileMsg("");
    const err = await updateProfile({ name, email, phone });
    if (err) setProfileError(err);
    else setProfileMsg("Profile updated successfully.");
  }

  async function handlePasswordSave(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError("");
    setPasswordMsg("");
    const err = await changePassword(currentPassword, newPassword);
    if (err) setPasswordError(err);
    else {
      setPasswordMsg("Password changed successfully.");
      setCurrentPassword("");
      setNewPassword("");
    }
  }

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1 text-sm font-medium text-brand hover:underline"
      >
        ← Back to Account
      </button>

      <div>
        <h2 className="text-xl font-bold">Personal Settings</h2>
        <p className="mt-1 text-sm text-muted">Manage your profile and preferences</p>
      </div>

      <div className="flex gap-1 rounded-lg bg-surface-elevated p-1">
        {(
          [
            { id: "profile" as const, label: "Profile" },
            { id: "password" as const, label: "Password" },
            { id: "preferences" as const, label: "Preferences" },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`flex-1 rounded-md py-2 text-xs font-semibold transition-colors sm:text-sm ${
              tab === item.id
                ? "bg-brand text-white shadow-sm"
                : "text-muted hover:text-foreground"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "profile" && (
        <>
          <div className="overflow-hidden rounded-xl border border-border bg-surface">
            <div className="bg-brand-dark px-5 py-5 text-white">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand-accent text-2xl font-bold text-brand-dark">
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-lg font-bold">{user.name}</p>
                  <p className="truncate text-sm text-white/70">@{username}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] font-medium">
                      {user.isManager ? "Manager" : "Member"}
                    </span>
                    <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] font-medium">
                      Since {memberSince}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 divide-x divide-border border-t border-border">
              <div className="px-4 py-3">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted">
                  Balance
                </p>
                <p className="mt-0.5 text-sm font-bold tabular-nums">
                  {formatMoney(user.balance)}
                </p>
              </div>
              <div className="px-4 py-3">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted">
                  Phone
                </p>
                <p className="mt-0.5 truncate text-sm font-semibold">{user.phone}</p>
              </div>
            </div>
          </div>

          <form
            onSubmit={handleProfileSave}
            className="space-y-4 rounded-xl border border-border bg-surface p-5"
          >
            <h3 className="font-semibold">Edit profile</h3>
            <p className="text-xs text-muted">
              Update your name, email, and phone number.
            </p>

            <SettingsField label="Full name" value={name} onChange={setName} />
            <SettingsField label="Email" type="email" value={email} onChange={setEmail} />
            <SettingsField label="Phone" type="tel" value={phone} onChange={setPhone} />

            {profileError && <p className="text-sm text-live">{profileError}</p>}
            {profileMsg && <p className="text-sm text-brand">{profileMsg}</p>}

            <button
              type="submit"
              className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark"
            >
              Save Profile
            </button>
          </form>

          {user.isManager && (
            <div className="space-y-3 rounded-xl border border-border bg-surface p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-semibold">Manager Mode</h3>
                  <p className="mt-1 text-xs text-muted">
                    Switch on to access manager tools and edit tickets. Only
                    visible to registered managers.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.managerMode === true}
                  onClick={() => setManagerMode(!settings.managerMode)}
                  className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
                    settings.managerMode ? "bg-brand" : "bg-border"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                      settings.managerMode ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {canManage && (
                <Link
                  href="/manager"
                  className="flex items-center justify-between rounded-lg border border-brand/30 bg-brand-light px-4 py-3 transition-colors hover:bg-brand-light/80"
                >
                  <div>
                    <p className="text-sm font-semibold text-brand-dark">
                      Manager tools
                    </p>
                    <p className="text-[11px] text-muted">Update match results</p>
                  </div>
                  <span className="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white">
                    Open
                  </span>
                </Link>
              )}
            </div>
          )}
        </>
      )}

      {tab === "password" && (
        <form
          onSubmit={handlePasswordSave}
          className="space-y-4 rounded-xl border border-border bg-surface p-5"
        >
          <h3 className="font-semibold">Change Password</h3>
          <p className="text-xs text-muted">
            Use at least 6 characters for your new password.
          </p>

          <SettingsField
            label="Current password"
            type="password"
            value={currentPassword}
            onChange={setCurrentPassword}
          />
          <SettingsField
            label="New password"
            type="password"
            value={newPassword}
            onChange={setNewPassword}
          />

          {passwordError && <p className="text-sm text-live">{passwordError}</p>}
          {passwordMsg && <p className="text-sm text-brand">{passwordMsg}</p>}

          <button
            type="submit"
            className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold hover:border-brand/50"
          >
            Update Password
          </button>
        </form>
      )}

      {tab === "preferences" && (
        <div className="space-y-4 rounded-xl border border-border bg-surface p-5">
          <h3 className="font-semibold">Preferences</h3>

          <label className="flex items-center justify-between">
            <span className="text-sm">Push notifications</span>
            <input
              type="checkbox"
              checked={settings.notifications}
              onChange={(e) => saveSettings({ notifications: e.target.checked })}
              className="h-4 w-4 accent-brand"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">Odds format</span>
            <select
              value={settings.oddsFormat}
              onChange={(e) =>
                saveSettings({
                  oddsFormat: e.target.value as "decimal" | "fractional",
                })
              }
              className="w-full rounded-lg border border-border bg-surface-elevated px-3 py-2.5 text-sm outline-none focus:border-brand"
            >
              <option value="decimal">Decimal (2.50)</option>
              <option value="fractional">Fractional (3/2)</option>
            </select>
          </label>
        </div>
      )}
    </div>
  );
}

function SettingsField({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border bg-surface-elevated px-3 py-2.5 text-sm outline-none focus:border-brand"
      />
    </label>
  );
}
