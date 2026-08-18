"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AccountGuest } from "@/components/AccountGuest";
import { AccountProfile } from "@/components/AccountProfile";
import { PersonalSettings } from "@/components/PersonalSettings";
import { useAuth } from "@/lib/auth-context";

type SettingsTab = "profile" | "password" | "preferences";

function AccountPageContent() {
  const { user, isLoading, logout, refreshUser } = useAuth();
  const searchParams = useSearchParams();
  const [view, setView] = useState<"main" | "settings">("main");
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("profile");

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  useEffect(() => {
    if (searchParams.get("open") === "profile") {
      setSettingsTab("profile");
      setView("settings");
    }
  }, [searchParams]);

  if (isLoading) {
    return (
      <div className="py-16 text-center text-sm text-muted">Loading account...</div>
    );
  }

  if (!user) {
    return <AccountGuest />;
  }

  if (view === "settings") {
    return (
      <PersonalSettings
        initialTab={settingsTab}
        onBack={() => setView("main")}
      />
    );
  }

  return (
    <AccountProfile
      user={user}
      onOpenSettings={(tab = "profile") => {
        setSettingsTab(tab);
        setView("settings");
      }}
      onLogout={logout}
    />
  );
}

export default function AccountPage() {
  return (
    <Suspense
      fallback={
        <div className="py-16 text-center text-sm text-muted">Loading account...</div>
      }
    >
      <AccountPageContent />
    </Suspense>
  );
}
