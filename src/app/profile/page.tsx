"use client";

import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useState } from "react";

import {
  IconBell,
  IconCheck,
  IconClock,
  IconDownload,
  IconEdit,
  IconFileText,
  IconGlobe,
  IconLock,
  IconMail,
  IconMailCheck,
  IconMoon,
  IconSettings,
  IconShieldCheck,
  IconShieldCheckFilled,
  IconSun,
  IconTrash,
  IconUser,
  IconUserCheck,
  IconUsers,
  IconX,
} from "@tabler/icons-react";

import { DashboardShell } from "@/components/dashboard/dashboard-layout";
import { useSafeSpeakProfile } from "@/hooks/use-safespeak-profile";
import useSystemTheme from "@/hooks/use-system-theme";
import {
  type AuthSession,
  clearAuthSession,
  ensureValidAuthSession,
  getAuthSession,
  getCurrentUser,
  logoutUser,
} from "@/lib/auth";
import {
  deactivateAccount,
  downloadPrivacyExport,
  savePrivacyExportFile,
} from "@/lib/privacy-client";
import { listReports } from "@/lib/reports-client";
import {
  communityOptions,
  interpreterLanguageOptions,
  type SafeSpeakProfile,
} from "@/lib/safespeak-profile";
import { listSupportServices } from "@/lib/support-client";
import { getPersonInitials } from "@/lib/user-identity";
import { cn } from "@/lib/utils";

/**
 * Phase 8.4 — the canonical SafeSpeak User Self-Profile route. Wrapped in
 * the same `DashboardShell` every other dashboard page uses (previously
 * this page rendered its own bare `<main>`, so Quick Exit / Emergency call
 * / the sidebar were entirely absent here) — `activeTab="settings"` keeps
 * the sidebar's "My SafeSpeak" entry highlighted while Profile is open,
 * since that's the entry point that now leads here.
 *
 * Identity fields (name/email/role/status/avatar) come from the existing
 * `SafeSpeakUser` auth session — read-only here, since no update endpoint
 * for them exists. Editable preferences (language/community/sharing) reuse
 * the existing `useSafeSpeakProfile()` hook verbatim (localStorage-cached,
 * backend-PATCH-attempted, offline-tolerant) — no second preference store.
 * This page never renders report content, conversation text, evidence, or
 * consent detail — only counts already safe to show elsewhere (Reports
 * history) or plain shortcut links.
 */

type ActivitySummary = {
  reports: number;
  support: number;
};

const defaultActivity: ActivitySummary = { reports: 0, support: 0 };

function formatDate(value?: string): string {
  if (!value) {
    return "Not set";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not set";
  }

  return date.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatRole(role: string): string {
  return role
    .split("_")
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function CardShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-[16px] border border-[#dbe5f0] bg-white shadow-[0_14px_36px_rgba(15,23,42,0.06)]",
        className
      )}
    >
      {children}
    </section>
  );
}

function ActionButton({
  icon,
  children,
  tone = "primary",
  href,
  onClick,
  disabled = false,
  type = "button",
}: {
  icon: ReactNode;
  children: ReactNode;
  tone?: "primary" | "danger" | "neutral";
  href?: Route;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  const className = cn(
    "inline-flex h-9 items-center justify-center gap-2 rounded-[8px] border px-3 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b65d8] focus-visible:ring-offset-1",
    disabled
      ? "cursor-not-allowed border-[#e2e8f0] bg-[#f8fafc] text-[#94a3b8]"
      : cn(
          "cursor-pointer",
          tone === "primary" &&
            "border-[#9ec5fe] bg-white text-[#0b65d8] hover:bg-[#eff6ff]",
          tone === "neutral" &&
            "border-[#dbe5f0] bg-white text-[#334155] hover:bg-[#f8fafc]",
          tone === "danger" &&
            "border-[#fecaca] bg-white text-[#dc2626] hover:bg-[#fff1f2]"
        )
  );

  if (href && !disabled) {
    return (
      <Link href={href} className={className}>
        {icon}
        {children}
      </Link>
    );
  }

  return (
    <button type={type} onClick={onClick} disabled={disabled} className={className}>
      {icon}
      {children}
    </button>
  );
}

function StatusCard({
  icon,
  title,
  value,
  valueTone = "green",
  description,
}: {
  icon: ReactNode;
  title: string;
  value: string;
  valueTone?: "green" | "blue" | "red";
  description: string;
}) {
  return (
    <CardShell className="p-5">
      <div className="flex items-start gap-4">
        <span
          className={cn(
            "inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full",
            valueTone === "green" && "bg-[#dcfce7] text-[#22c55e]",
            valueTone === "blue" && "bg-[#dbeafe] text-[#3b82f6]",
            valueTone === "red" && "bg-[#fee2e2] text-[#ef4444]"
          )}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[12px] font-extrabold text-[#0f172a]">{title}</p>
            <span
              className={cn(
                "rounded-full px-2.5 py-1 text-[10px] font-extrabold",
                valueTone === "green" && "bg-[#dcfce7] text-[#16a34a]",
                valueTone === "blue" && "bg-[#dbeafe] text-[#2563eb]",
                valueTone === "red" && "bg-[#fee2e2] text-[#dc2626]"
              )}
            >
              {value}
            </span>
          </div>
          <p className="mt-2 text-[11px] leading-5 text-[#64748b]">
            {description}
          </p>
        </div>
      </div>
    </CardShell>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="grid grid-cols-[28px,minmax(82px,0.8fr),minmax(0,1.5fr)] items-center gap-3 border-b border-[#e5edf6] py-4 last:border-b-0">
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#eef4fb] text-[#64748b]">
        {icon}
      </span>
      <span className="text-[11px] font-extrabold text-[#64748b]">{label}</span>
      <span className="min-w-0 break-words text-[12px] font-semibold text-[#0f172a]">
        {value || "Not set"}
      </span>
    </div>
  );
}

function PreferenceRow({
  icon,
  label,
  fieldId,
  isEditing,
  readOnlyValue,
  children,
}: {
  icon: ReactNode;
  label: string;
  fieldId: string;
  isEditing: boolean;
  readOnlyValue: string;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[28px,minmax(82px,0.8fr),minmax(0,1.5fr)] items-center gap-3 border-b border-[#e5edf6] py-4 last:border-b-0">
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#eef4fb] text-[#64748b]">
        {icon}
      </span>
      <label htmlFor={fieldId} className="text-[11px] font-extrabold text-[#64748b]">
        {label}
      </label>
      {isEditing ? (
        <div className="min-w-0">{children}</div>
      ) : (
        <span className="min-w-0 break-words text-[12px] font-semibold text-[#0f172a]">
          {readOnlyValue}
        </span>
      )}
    </div>
  );
}

function ActivityTile({
  icon,
  value,
  label,
  tone,
}: {
  icon: ReactNode;
  value: number;
  label: string;
  tone: "purple" | "orange";
}) {
  return (
    <div className="rounded-[10px] border border-[#dfe8f2] bg-white p-3 shadow-[0_8px_20px_rgba(15,23,42,0.04)]">
      <span
        className={cn(
          "inline-flex h-7 w-7 items-center justify-center rounded-[8px]",
          tone === "purple" && "bg-[#ede9fe] text-[#8b5cf6]",
          tone === "orange" && "bg-[#ffedd5] text-[#fb923c]"
        )}
      >
        {icon}
      </span>
      <p className="mt-3 text-2xl font-extrabold leading-none text-[#0f172a]">
        {value}
      </p>
      <p className="mt-1 text-[10px] font-semibold leading-tight text-[#64748b]">
        {label}
      </p>
    </div>
  );
}

function ShortcutTile({
  icon,
  label,
  href,
  tone,
}: {
  icon: ReactNode;
  label: string;
  href: Route;
  tone: "green" | "blue";
}) {
  return (
    <Link
      href={href}
      className="flex flex-col justify-between rounded-[10px] border border-[#dfe8f2] bg-white p-3 shadow-[0_8px_20px_rgba(15,23,42,0.04)] transition hover:border-[#9ec5fe] hover:bg-[#f8fbff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b65d8]"
    >
      <span
        className={cn(
          "inline-flex h-7 w-7 items-center justify-center rounded-[8px]",
          tone === "green" && "bg-[#dcfce7] text-[#22c55e]",
          tone === "blue" && "bg-[#dbeafe] text-[#3b82f6]"
        )}
      >
        {icon}
      </span>
      <p className="mt-3 text-[11px] font-extrabold leading-tight text-[#0b65d8]">
        {label}
      </p>
    </Link>
  );
}

function ProfileAvatar({
  name,
  email,
  avatarUrl,
}: {
  name: string;
  email: string;
  avatarUrl?: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <div className="relative h-[112px] w-[112px] shrink-0 rounded-full border-[5px] border-white bg-[#eaf2ff] shadow-[0_12px_26px_rgba(15,23,42,0.2)]">
      {avatarUrl && !imageFailed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt={`${name} profile photo`}
          className="h-full w-full rounded-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <div
          role="img"
          aria-label={`${name} profile photo`}
          className="grid h-full w-full place-items-center rounded-full bg-[#dbeafe] text-3xl font-extrabold text-[#0b65d8]"
        >
          {getPersonInitials(name, email)}
        </div>
      )}
    </div>
  );
}

export default function Profile() {
  const router = useRouter();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [activity, setActivity] = useState<ActivitySummary>(defaultActivity);
  const [loaded, setLoaded] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isDownloadingData, setIsDownloadingData] = useState(false);
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [accountActionMessage, setAccountActionMessage] = useState<string | null>(null);
  const [accountActionError, setAccountActionError] = useState<string | null>(null);

  const { profile: preferences, updateProfile: updatePreferences } =
    useSafeSpeakProfile();
  const { theme, setTheme } = useSystemTheme();

  const [isEditingPreferences, setIsEditingPreferences] = useState(false);
  const [draftPreferences, setDraftPreferences] =
    useState<SafeSpeakProfile>(preferences);
  const [preferencesSavedMessage, setPreferencesSavedMessage] = useState<
    string | null
  >(null);

  useEffect(() => {
    if (!isEditingPreferences) {
      setDraftPreferences(preferences);
    }
  }, [preferences, isEditingPreferences]);

  useEffect(() => {
    let isActive = true;

    void (async () => {
      try {
        const validSession = await ensureValidAuthSession();

        if (!isActive) {
          return;
        }

        if (!validSession) {
          setSession(null);
          return;
        }

        await getCurrentUser();

        if (isActive) {
          setSession(getAuthSession() ?? validSession);
        }

        const [reportsResult, supportResult] = await Promise.allSettled([
          listReports(),
          listSupportServices(),
        ]);

        if (!isActive) {
          return;
        }

        setActivity({
          reports:
            reportsResult.status === "fulfilled" ? reportsResult.value.length : 0,
          support:
            supportResult.status === "fulfilled" ? supportResult.value.length : 0,
        });
      } catch {
        if (isActive) {
          setSession(null);
        }
      } finally {
        if (isActive) {
          setLoaded(true);
        }
      }
    })();

    return () => {
      isActive = false;
    };
  }, []);

  const user = session?.user;
  const roleLabel = useMemo(
    () => (user ? formatRole(user.role) : "Public User"),
    [user]
  );

  function startEditingPreferences(): void {
    setDraftPreferences(preferences);
    setPreferencesSavedMessage(null);
    setIsEditingPreferences(true);
  }

  function cancelEditingPreferences(): void {
    setDraftPreferences(preferences);
    setIsEditingPreferences(false);
  }

  function savePreferences(): void {
    updatePreferences(draftPreferences);
    setIsEditingPreferences(false);
    setPreferencesSavedMessage("Profile preferences saved on this device.");
  }

  const downloadProfileData = async () => {
    if (!session) {
      return;
    }

    setIsDownloadingData(true);
    setAccountActionError(null);
    setAccountActionMessage(null);

    try {
      const exportPayload = await downloadPrivacyExport();

      savePrivacyExportFile(exportPayload);
      setAccountActionMessage("Backend data export generated.");
    } catch (error) {
      setAccountActionError(
        error instanceof Error
          ? error.message
          : "Backend data export could not be generated."
      );
    } finally {
      setIsDownloadingData(false);
    }
  };

  const deactivateProfileAccount = async () => {
    if (!session) {
      return;
    }

    const confirmed =
      typeof window !== "undefined" &&
      window.confirm(
        "Deactivate this account now? You will be logged out and need support to reactivate it."
      );

    if (!confirmed) {
      return;
    }

    setIsDeactivating(true);
    setAccountActionError(null);
    setAccountActionMessage(null);

    try {
      await deactivateAccount();
      clearAuthSession();
      setSession(null);
      router.replace("/login");
    } catch (error) {
      setAccountActionError(
        error instanceof Error ? error.message : "Account could not be deactivated."
      );
    } finally {
      setIsDeactivating(false);
    }
  };

  const handleLogout = () => {
    void (async () => {
      setIsLoggingOut(true);

      try {
        await logoutUser();
      } finally {
        setSession(null);
        setIsLoggingOut(false);
        router.replace("/login");
      }
    })();
  };

  if (!loaded) {
    return (
      <DashboardShell activeTab="settings">
        <div className="px-3 py-10 sm:px-4">
          <CardShell className="mx-auto max-w-5xl p-6">
            <div className="flex items-center gap-3 text-sm font-semibold text-[#64748b]">
              <IconClock size={18} className="motion-safe:animate-spin" />
              Loading profile...
            </div>
          </CardShell>
        </div>
      </DashboardShell>
    );
  }

  if (!session || !user) {
    return (
      <DashboardShell activeTab="settings">
        <div className="px-3 py-10 sm:px-4">
          <CardShell className="mx-auto max-w-2xl p-6">
            <p className="text-lg font-extrabold text-[#0f172a]">
              No active session found.
            </p>
            <p className="mt-2 text-sm text-[#64748b]">
              Login first to load your SafeSpeak account details.
            </p>
            <Link
              href="/login"
              className="mt-5 inline-flex h-10 items-center justify-center rounded-[8px] bg-[#0b65d8] px-4 text-sm font-bold text-white transition hover:bg-[#0757bb]"
            >
              Go to Login
            </Link>
          </CardShell>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell activeTab="settings">
      <div className="px-3 pb-10 pt-4 text-[#0f172a] sm:px-4 sm:pt-6 lg:px-6">
        <div className="mx-auto max-w-[1180px]">
          <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-[#0f172a] sm:text-3xl">
                My Profile
              </h1>
              <p className="mt-1 text-sm font-medium text-[#64748b]">
                Manage your account and preferences
              </p>
            </div>
            <div className="flex items-center gap-2">
              <ActionButton
                icon={<IconEdit size={14} />}
                onClick={startEditingPreferences}
                disabled={isEditingPreferences}
              >
                Edit Profile
              </ActionButton>
              <Link
                href="/dashboard/settings"
                aria-label="Open Settings"
                className="grid h-9 w-9 place-items-center rounded-[8px] border border-[#dbe5f0] bg-white text-[#64748b] transition hover:bg-[#f8fafc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b65d8]"
              >
                <IconSettings size={15} />
              </Link>
            </div>
          </header>

          <section className="relative mt-6 overflow-hidden rounded-[18px] bg-[#00579f] p-6 shadow-[0_20px_50px_rgba(0,87,159,0.22)] sm:p-8">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(59,130,246,0.38),transparent_36%),linear-gradient(120deg,#073b83_0%,#00579f_48%,#006ec8_100%)]" />
            <div className="absolute right-10 top-8 hidden h-40 w-72 rounded-full border border-white/10 lg:block" />

            <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
                <ProfileAvatar
                  name={user.fullName}
                  email={user.email}
                  avatarUrl={user.avatarUrl}
                />
                <div className="min-w-0 text-white">
                  <h2 className="max-w-[560px] break-words text-2xl font-extrabold leading-tight sm:text-3xl">
                    {user.fullName}
                  </h2>
                  <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#dcfce7] px-2.5 py-1 text-[11px] font-extrabold text-[#15803d]">
                    <IconCheck size={12} />
                    {user.isEmailVerified ? "Verified" : "Email pending"}
                  </span>
                  <div className="mt-4 space-y-2 text-[12px] font-semibold text-white/90">
                    <p className="flex items-center gap-2 break-all">
                      <IconMail size={14} />
                      {user.email}
                    </p>
                    <p className="flex items-center gap-2">
                      <IconClock size={14} />
                      Member since {formatDate(user.createdAt)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="hidden items-center justify-center lg:flex">
                <div className="relative grid h-36 w-36 place-items-center rounded-[32px] bg-[#1d6fe8] shadow-[0_20px_44px_rgba(0,0,0,0.18)]">
                  <IconShieldCheckFilled size={92} className="text-[#4d93ff]" />
                  <IconUser size={42} className="absolute text-white" />
                  <span className="absolute -bottom-2 -right-2 grid h-11 w-11 place-items-center rounded-full bg-[#22c55e] text-white shadow-lg">
                    <IconCheck size={22} stroke={3} />
                  </span>
                </div>
              </div>
            </div>
          </section>

          <section className="mt-6 grid gap-5 md:grid-cols-3">
            <StatusCard
              icon={<IconShieldCheck size={24} />}
              title="Account Status"
              value={user.status === "active" ? "Active" : formatRole(user.status)}
              valueTone={user.status === "active" ? "green" : "red"}
              description="Your account is active and in good standing."
            />
            <StatusCard
              icon={<IconUserCheck size={24} />}
              title="Role"
              value={roleLabel}
              valueTone="blue"
              description="You can report incidents, get support and access resources."
            />
            <StatusCard
              icon={<IconMailCheck size={24} />}
              title="Email Verified"
              value={user.isEmailVerified ? "Verified" : "Pending"}
              valueTone={user.isEmailVerified ? "green" : "red"}
              description={
                user.isEmailVerified
                  ? "Your email address has been successfully verified."
                  : "Verify your email to improve account recovery."
              }
            />
          </section>

          <section className="mt-6 grid gap-6 lg:grid-cols-[1.2fr,0.9fr]">
            <div className="space-y-5">
              <CardShell className="p-5 sm:p-6">
                <h2 className="text-lg font-extrabold text-[#0f172a]">
                  Profile Information
                </h2>
                <div className="mt-5">
                  <InfoRow
                    icon={<IconUser size={14} />}
                    label="Full Name"
                    value={user.fullName}
                  />
                  <InfoRow
                    icon={<IconMail size={14} />}
                    label="Email"
                    value={user.email}
                  />
                </div>
              </CardShell>

              <CardShell className="p-5 sm:p-6" aria-live="polite">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-extrabold text-[#0f172a]">
                    Personal Preferences
                  </h2>
                  {isEditingPreferences ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={cancelEditingPreferences}
                        className="inline-flex h-8 items-center gap-1 rounded-[8px] border border-[#dbe5f0] px-2.5 text-[11px] font-bold text-[#334155] transition hover:bg-[#f8fafc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b65d8]"
                      >
                        <IconX size={13} />
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={savePreferences}
                        className="inline-flex h-8 items-center gap-1 rounded-[8px] border border-[#9ec5fe] bg-[#0b65d8] px-2.5 text-[11px] font-bold text-white transition hover:bg-[#0757bb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b65d8] focus-visible:ring-offset-1"
                      >
                        <IconCheck size={13} />
                        Save
                      </button>
                    </div>
                  ) : null}
                </div>
                <p className="mt-1 text-[11px] leading-5 text-[#64748b]">
                  These preferences are used to tailor guidance and are saved on
                  this device for this prototype.
                </p>
                <div className="mt-4">
                  <PreferenceRow
                    icon={<IconGlobe size={14} />}
                    label="Language"
                    fieldId="profile-preferred-language"
                    isEditing={isEditingPreferences}
                    readOnlyValue={preferences.interpreterLanguage}
                  >
                    <select
                      id="profile-preferred-language"
                      value={draftPreferences.interpreterLanguage}
                      onChange={(event) =>
                        setDraftPreferences((current) => ({
                          ...current,
                          interpreterLanguage: event.target.value,
                        }))
                      }
                      className="h-9 w-full min-w-0 rounded-[8px] border border-[#dbe5f0] bg-white px-2 text-[12px] font-semibold text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#0b65d8]"
                    >
                      {interpreterLanguageOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </PreferenceRow>
                  <PreferenceRow
                    icon={<IconUsers size={14} />}
                    label="Community"
                    fieldId="profile-community-background"
                    isEditing={isEditingPreferences}
                    readOnlyValue={preferences.communityBackground}
                  >
                    <select
                      id="profile-community-background"
                      value={draftPreferences.communityBackground}
                      onChange={(event) =>
                        setDraftPreferences((current) => ({
                          ...current,
                          communityBackground: event.target.value,
                        }))
                      }
                      className="h-9 w-full min-w-0 rounded-[8px] border border-[#dbe5f0] bg-white px-2 text-[12px] font-semibold text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#0b65d8]"
                    >
                      {communityOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </PreferenceRow>
                  <div className="flex items-center justify-between gap-3 py-4">
                    <div className="min-w-0">
                      <p className="text-[11px] font-extrabold text-[#64748b]">
                        Share with warm referrals
                      </p>
                      <p className="mt-0.5 text-[11px] leading-5 text-[#94a3b8]">
                        Lets a referred support service see this cultural context.
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={
                        isEditingPreferences
                          ? draftPreferences.shareProfileInReferral
                          : preferences.shareProfileInReferral
                      }
                      aria-label="Share cultural context with warm referrals"
                      disabled={!isEditingPreferences}
                      onClick={() =>
                        setDraftPreferences((current) => ({
                          ...current,
                          shareProfileInReferral: !current.shareProfileInReferral,
                        }))
                      }
                      className={cn(
                        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:cursor-not-allowed",
                        (isEditingPreferences
                          ? draftPreferences.shareProfileInReferral
                          : preferences.shareProfileInReferral)
                          ? "bg-[#0b65d8]"
                          : "bg-[#cbd5e1]"
                      )}
                    >
                      <span
                        className={cn(
                          "inline-block h-4.5 w-4.5 h-[18px] w-[18px] transform rounded-full bg-white transition",
                          (isEditingPreferences
                            ? draftPreferences.shareProfileInReferral
                            : preferences.shareProfileInReferral)
                            ? "translate-x-[22px]"
                            : "translate-x-[3px]"
                        )}
                      />
                    </button>
                  </div>
                </div>
                {preferencesSavedMessage ? (
                  <p className="mt-3 text-[11px] font-bold text-[#0b65d8]">
                    {preferencesSavedMessage}
                  </p>
                ) : null}
              </CardShell>
            </div>

            <div className="space-y-5">
              <CardShell className="p-5 sm:p-6">
                <h2 className="text-lg font-extrabold text-[#0f172a]">
                  Display Preferences
                </h2>
                <div className="mt-4 flex items-center justify-between gap-3 border-b border-[#e5edf6] py-3 last:border-b-0">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#eef4fb] text-[#64748b]">
                      {theme === "dark" ? <IconMoon size={14} /> : <IconSun size={14} />}
                    </span>
                    <span className="text-[12px] font-semibold text-[#0f172a]">
                      {theme === "dark" ? "Dark theme" : "Light theme"}
                    </span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={theme === "dark"}
                    aria-label="Toggle dark theme"
                    onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                    className={cn(
                      "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition",
                      theme === "dark" ? "bg-[#0b65d8]" : "bg-[#cbd5e1]"
                    )}
                  >
                    <span
                      className={cn(
                        "inline-block h-[18px] w-[18px] transform rounded-full bg-white transition",
                        theme === "dark" ? "translate-x-[22px]" : "translate-x-[3px]"
                      )}
                    />
                  </button>
                </div>
                <p className="mt-3 text-[11px] leading-5 text-[#94a3b8]">
                  Password changes and two-factor authentication aren&apos;t
                  available in this prototype yet.
                </p>
              </CardShell>

              <CardShell className="p-5 sm:p-6">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-extrabold text-[#0f172a]">
                    Activity Summary
                  </h2>
                  <Link
                    href="/dashboard/reports"
                    className="text-[11px] font-extrabold text-[#0b65d8]"
                  >
                    View all
                  </Link>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <ActivityTile
                    icon={<IconFileText size={15} />}
                    value={activity.reports}
                    label="Reports Submitted"
                    tone="purple"
                  />
                  <ActivityTile
                    icon={<IconUsers size={15} />}
                    value={activity.support}
                    label="Support Requests"
                    tone="orange"
                  />
                  <ShortcutTile
                    icon={<IconGlobe size={15} />}
                    label="Learn & Resources"
                    href={"/dashboard?view=microcards" as Route}
                    tone="green"
                  />
                  <ShortcutTile
                    icon={<IconBell size={15} />}
                    label="Notifications"
                    href={"/dashboard/notifications" as Route}
                    tone="blue"
                  />
                </div>
              </CardShell>
            </div>
          </section>

          <CardShell className="mt-6 p-5 sm:p-6">
            <h2 className="text-[14px] font-extrabold text-[#0f172a]">
              Account and privacy
            </h2>
            <p className="mt-1 text-[12px] font-medium text-[#64748b]">
              Download a backend-generated export, review privacy settings, or
              sign out.
            </p>
            {accountActionMessage ? (
              <p className="mt-2 text-[11px] font-bold text-[#0b65d8]" aria-live="polite">
                {accountActionMessage}
              </p>
            ) : null}
            {accountActionError ? (
              <p className="mt-2 text-[11px] font-bold text-[#b91c1c]" aria-live="polite">
                {accountActionError}
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <ActionButton tone="neutral" href="/dashboard/settings" icon={<IconSettings size={14} />}>
                Settings
              </ActionButton>
              <ActionButton
                tone="neutral"
                href="/dashboard/settings/privacy-policy"
                icon={<IconShieldCheck size={14} />}
              >
                Privacy Policy
              </ActionButton>
              <ActionButton
                tone="neutral"
                href="/dashboard/settings/terms-conditions"
                icon={<IconFileText size={14} />}
              >
                Terms of Use
              </ActionButton>
              <ActionButton
                icon={<IconDownload size={14} />}
                onClick={() => void downloadProfileData()}
                disabled={isDownloadingData}
              >
                {isDownloadingData ? "Preparing Export..." : "Download Backend Export"}
              </ActionButton>
              <ActionButton
                tone="danger"
                icon={<IconTrash size={14} />}
                onClick={() => void deactivateProfileAccount()}
                disabled={isDeactivating}
              >
                {isDeactivating ? "Deactivating..." : "Deactivate Account"}
              </ActionButton>
              <ActionButton
                tone="neutral"
                icon={<IconLock size={14} />}
                onClick={handleLogout}
                disabled={isLoggingOut}
              >
                {isLoggingOut ? "Signing out..." : "Sign out"}
              </ActionButton>
            </div>
          </CardShell>

          <p className="mt-4 rounded-[12px] border border-[#dce5f1] bg-[#f8fbff] px-4 py-3 text-[11px] leading-5 text-[#64748b]">
            Preferences you edit here are saved on this device for this
            prototype and are not shown to anyone else. This page never shows
            your report content, conversation details, evidence, or consent
            records — review a report&apos;s own history in{" "}
            <Link href="/dashboard/reports" className="font-bold text-[#0b65d8]">
              Reports
            </Link>
            .
          </p>
        </div>
      </div>
    </DashboardShell>
  );
}
