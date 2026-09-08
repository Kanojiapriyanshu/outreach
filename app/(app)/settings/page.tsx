"use client";

import { useEffect, useState } from "react";
import Badge from "@/app/components/Badge";

interface EmailAccount {
  id: string;
  email: string;
  provider: string;
  accessStatus: string;
  dailySendLimit: number;
  sentToday: number;
}

interface Heartbeat {
  lastRunAt: string;
  lastRunOk: boolean;
  lastError: string | null;
  actionsChecked: number;
}

interface AutomationSettings {
  id: string;
  brandDelayDays1: number;
  brandDelayDays2: number;
  brandDelayDays3: number;
  creatorDelayDays1: number;
  creatorDelayDays2: number;
  creatorDelayDays3: number;
  sendWindowStartHour: number;
  sendWindowEndHour: number;
  sendWindowDays: string;
  sendSpacingSecondsMin: number;
  sendSpacingSecondsMax: number;
  nonCommittalDelayDays: number;
}

interface Suppressed {
  email: string;
  reason: string | null;
  createdAt: string;
}

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
}

export default function SettingsPage() {
  const [emailAccounts, setEmailAccounts] = useState<EmailAccount[]>([]);
  const [settings, setSettings] = useState<AutomationSettings | null>(null);
  const [suppressed, setSuppressed] = useState<Suppressed[]>([]);
  const [heartbeat, setHeartbeat] = useState<Heartbeat | null>(null);
  const [heartbeatCheckedAt, setHeartbeatCheckedAt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newSuppressEmail, setNewSuppressEmail] = useState("");
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [newMember, setNewMember] = useState({ name: "", email: "", password: "" });
  const [teamError, setTeamError] = useState<string | null>(null);
  const [addingMember, setAddingMember] = useState(false);

  async function load() {
    const res = await fetch("/api/settings");
    const data = await res.json();
    setEmailAccounts(data.emailAccounts);
    setSettings(data.settings);
    setSuppressed(data.suppressed);
    setHeartbeat(data.heartbeat);
    setHeartbeatCheckedAt(Date.now());
    const teamRes = await fetch("/api/team");
    const teamData = await teamRes.json();
    setTeam(teamData.users);
  }

  async function addTeamMember() {
    setTeamError(null);
    if (!newMember.name || !newMember.email || !newMember.password) return;
    setAddingMember(true);
    try {
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newMember),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add teammate");
      setNewMember({ name: "", email: "", password: "" });
      load();
    } catch (e) {
      setTeamError(e instanceof Error ? e.message : "Failed to add teammate");
    } finally {
      setAddingMember(false);
    }
  }

  async function updateDailyLimit(id: string, dailySendLimit: number) {
    await fetch(`/api/settings/email-accounts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dailySendLimit }),
    });
    load();
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    load();
  }, []);

  async function saveSettings() {
    if (!settings) return;
    setSaving(true);
    setSaved(false);
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    setSaving(false);
    setSaved(true);
  }

  async function addSuppression() {
    if (!newSuppressEmail) return;
    await fetch("/api/settings/suppress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: newSuppressEmail, reason: "Manually suppressed" }),
    });
    setNewSuppressEmail("");
    load();
  }

  async function removeSuppression(email: string) {
    await fetch("/api/settings/suppress", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    load();
  }

  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  async function disconnectAccount(id: string, email: string) {
    if (!confirm(`Disconnect ${email}? Any follow-ups sending from this inbox will pause until you reconnect it.`)) return;
    setDisconnecting(id);
    try {
      await fetch(`/api/settings/email-accounts/${id}`, { method: "DELETE" });
      load();
    } finally {
      setDisconnecting(null);
    }
  }

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-[var(--ink)]">Settings</h1>
        <p className="text-sm text-[var(--muted)] mt-0.5">Connect your inbox, set the timing, and manage who not to email.</p>
      </div>

      <section className="card p-5 space-y-3">
        <h2 className="font-semibold text-sm text-[var(--ink)]">Email Accounts</h2>
        <p className="text-xs text-[var(--muted)]">
          Connect as many Gmail accounts as your team sends outreach from. Each tracked sequence stays tied to the
          account it was sent from.
        </p>
        {emailAccounts.length === 0 && (
          <p className="text-sm text-[var(--muted)]">No Gmail account connected yet.</p>
        )}
        {emailAccounts.map((acc) => (
          <div key={acc.id} className="rounded-xl p-3.5 space-y-2.5" style={{ border: "1px solid var(--border)" }}>
            <div className="flex justify-between items-center text-sm">
              <div>
                <div className="font-medium text-[var(--ink)]">{acc.email}</div>
                <div className="text-[var(--muted-2)] text-xs mt-0.5">{acc.provider}</div>
              </div>
              <div className="flex items-center gap-2">
                <Badge status={acc.accessStatus} />
                {acc.accessStatus === "CONNECTED" && (
                  <button
                    onClick={() => disconnectAccount(acc.id, acc.email)}
                    disabled={disconnecting === acc.id}
                    className="btn-danger px-3 py-1.5 text-xs"
                  >
                    {disconnecting === acc.id ? "…" : "Disconnect"}
                  </button>
                )}
              </div>
            </div>
            {acc.accessStatus === "CONNECTED" && (
              <div className="flex items-center justify-between text-xs pt-2 border-t border-[var(--border)]">
                <span className="text-[var(--muted)]">
                  Sent today: <strong className="text-[var(--ink)]">{acc.sentToday}</strong> of {acc.dailySendLimit}
                </span>
                <label className="flex items-center gap-1.5 text-[var(--muted)]">
                  Most per day
                  <input
                    type="number"
                    defaultValue={acc.dailySendLimit}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (v > 0 && v !== acc.dailySendLimit) updateDailyLimit(acc.id, v);
                    }}
                    className="input w-20 py-1 px-2"
                  />
                </label>
              </div>
            )}
          </div>
        ))}
        <a href="/api/auth/google" className="btn-primary inline-block px-4 py-2.5 text-sm">
          {emailAccounts.length === 0 ? "Connect Gmail Account" : "Add Another Account"}
        </a>
        {emailAccounts.length > 0 && (
          <p className="text-xs text-[var(--muted-2)]">
            To connect a different Google account than the one you&apos;re currently signed into, sign out of
            Google first (or open this in a private/incognito window) before clicking the button above.
          </p>
        )}
      </section>

      <section className="card p-5 space-y-2">
        <h2 className="font-semibold text-sm text-[var(--ink)]">Is the automation running?</h2>
        {!heartbeat ? (
          <p className="text-sm text-[var(--muted)]">
            Not yet — the automatic follow-up sender hasn&apos;t started. If you&apos;re not sure how to start it,
            ask whoever set this system up for you.
          </p>
        ) : (
          <div className="flex items-center gap-2 text-sm">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{
                background:
                  heartbeatCheckedAt - new Date(heartbeat.lastRunAt).getTime() < 15 * 60 * 1000 && heartbeat.lastRunOk
                    ? "var(--success-fg)"
                    : "var(--danger-fg)",
              }}
            />
            <span className="text-[var(--ink)]">
              {heartbeatCheckedAt - new Date(heartbeat.lastRunAt).getTime() < 15 * 60 * 1000 && heartbeat.lastRunOk
                ? "Yes — running normally."
                : "It's gone quiet — may have stopped."}{" "}
              Last checked {new Date(heartbeat.lastRunAt).toLocaleString()}.
            </span>
            {!heartbeat.lastRunOk && (
              <span style={{ color: "var(--danger-fg)" }}>· Something went wrong: {heartbeat.lastError}</span>
            )}
          </div>
        )}
        <p className="text-xs text-[var(--muted-2)]">
          If this stops updating for a while, ask your technical contact to restart it.
        </p>
      </section>

      {settings && (
        <section className="card p-5 space-y-5">
          <h2 className="font-semibold text-sm text-[var(--ink)]">When Follow-Ups Go Out</h2>
          <div>
            <h3 className="text-xs font-medium text-[var(--muted)] mb-2 uppercase tracking-wide">
              Waiting time for brands (working days)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <NumField
                label="Before 1st follow-up"
                value={settings.brandDelayDays1}
                onChange={(v) => setSettings({ ...settings, brandDelayDays1: v })}
              />
              <NumField
                label="Before 2nd follow-up"
                value={settings.brandDelayDays2}
                onChange={(v) => setSettings({ ...settings, brandDelayDays2: v })}
              />
              <NumField
                label="Before 3rd follow-up"
                value={settings.brandDelayDays3}
                onChange={(v) => setSettings({ ...settings, brandDelayDays3: v })}
              />
            </div>
          </div>
          <div>
            <h3 className="text-xs font-medium text-[var(--muted)] mb-2 uppercase tracking-wide">
              Waiting time for creators (calendar days)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <NumField
                label="Before 1st follow-up"
                value={settings.creatorDelayDays1}
                onChange={(v) => setSettings({ ...settings, creatorDelayDays1: v })}
              />
              <NumField
                label="Before 2nd follow-up"
                value={settings.creatorDelayDays2}
                onChange={(v) => setSettings({ ...settings, creatorDelayDays2: v })}
              />
              <NumField
                label="Before 3rd follow-up"
                value={settings.creatorDelayDays3}
                onChange={(v) => setSettings({ ...settings, creatorDelayDays3: v })}
              />
            </div>
          </div>
          <div>
            <h3 className="text-xs font-medium text-[var(--muted)] mb-2 uppercase tracking-wide">
              What hours emails can go out
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <NumField
                label="Start (24-hour clock, e.g. 9 = 9am)"
                value={settings.sendWindowStartHour}
                onChange={(v) => setSettings({ ...settings, sendWindowStartHour: v })}
              />
              <NumField
                label="Stop (24-hour clock, e.g. 17 = 5pm)"
                value={settings.sendWindowEndHour}
                onChange={(v) => setSettings({ ...settings, sendWindowEndHour: v })}
              />
            </div>
          </div>
          <div>
            <h3 className="text-xs font-medium text-[var(--muted)] mb-2 uppercase tracking-wide">
              Delay between emails
            </h3>
            <p className="text-xs text-[var(--muted-2)] mb-2">
              Instead of sending every due follow-up at the exact same moment, we wait a random amount of time
              between each one — it looks more like a real person sending mail, not a robot.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <NumField
                label="Shortest wait (seconds)"
                value={settings.sendSpacingSecondsMin}
                onChange={(v) => setSettings({ ...settings, sendSpacingSecondsMin: v })}
              />
              <NumField
                label="Longest wait (seconds)"
                value={settings.sendSpacingSecondsMax}
                onChange={(v) => setSettings({ ...settings, sendSpacingSecondsMax: v })}
              />
            </div>
          </div>
          <div>
            <h3 className="text-xs font-medium text-[var(--muted)] mb-2 uppercase tracking-wide">
              After a vague reply
            </h3>
            <p className="text-xs text-[var(--muted-2)] mb-2">
              When a reply doesn&apos;t really say yes or no (&quot;ok, will check and get back to you&quot;), how many
              days before we check in again to ask if they&apos;ve had a chance to check internally?
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <NumField
                label="Days to wait"
                value={settings.nonCommittalDelayDays}
                onChange={(v) => setSettings({ ...settings, nonCommittalDelayDays: v })}
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={saveSettings} disabled={saving} className="btn-primary px-4 py-2.5 text-sm">
              {saving ? "Saving…" : "Save Settings"}
            </button>
            {saved && <span className="text-sm" style={{ color: "var(--success-fg)" }}>Saved.</span>}
          </div>
        </section>
      )}

      <section className="card p-5 space-y-3">
        <h2 className="font-semibold text-sm text-[var(--ink)]">Do Not Email List</h2>
        <p className="text-xs text-[var(--muted)]">
          Anyone on this list will never get an email from this system again — automatic or otherwise.
        </p>
        <div className="flex gap-2">
          <input
            className="input flex-1"
            placeholder="email@example.com"
            value={newSuppressEmail}
            onChange={(e) => setNewSuppressEmail(e.target.value)}
          />
          <button onClick={addSuppression} className="btn-secondary px-4 py-2 text-sm whitespace-nowrap">
            Add to List
          </button>
        </div>
        {suppressed.map((s) => (
          <div key={s.email} className="flex justify-between items-center text-sm rounded-xl p-3" style={{ border: "1px solid var(--border)" }}>
            <span className="text-[var(--ink)]">{s.email}</span>
            <button onClick={() => removeSuppression(s.email)} className="text-xs hover:underline" style={{ color: "var(--danger-fg)" }}>
              Remove
            </button>
          </div>
        ))}
      </section>

      <section className="card p-5 space-y-3">
        <h2 className="font-semibold text-sm text-[var(--ink)]">Your Team</h2>
        <p className="text-xs text-[var(--muted)]">
          Everyone below can log in and see this same dashboard. Add a teammate with their name, email, and a
          password for them to use.
        </p>
        <div className="space-y-2">
          {team.map((m) => (
            <div key={m.id} className="flex justify-between items-center text-sm rounded-xl p-3" style={{ border: "1px solid var(--border)" }}>
              <div>
                <div className="font-medium text-[var(--ink)]">{m.name}</div>
                <div className="text-[var(--muted-2)] text-xs">{m.email}</div>
              </div>
              <span className="text-xs text-[var(--muted)] capitalize">{m.role}</span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <input
            className="input"
            placeholder="Their name"
            value={newMember.name}
            onChange={(e) => setNewMember({ ...newMember, name: e.target.value })}
          />
          <input
            className="input"
            placeholder="Their email"
            value={newMember.email}
            onChange={(e) => setNewMember({ ...newMember, email: e.target.value })}
          />
          <input
            className="input"
            placeholder="A password for them"
            type="password"
            value={newMember.password}
            onChange={(e) => setNewMember({ ...newMember, password: e.target.value })}
          />
        </div>
        <button onClick={addTeamMember} disabled={addingMember} className="btn-secondary px-4 py-2 text-sm">
          {addingMember ? "Adding…" : "Add Teammate"}
        </button>
        {teamError && <p className="text-sm" style={{ color: "var(--danger-fg)" }}>{teamError}</p>}
      </section>
    </div>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="block text-xs text-[var(--muted-2)] mb-1.5">{label}</label>
      <input type="number" className="input" value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}
