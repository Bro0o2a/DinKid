"use client";

import { Bell, BellOff, Share, X } from "lucide-react";
import { useEffect, useState } from "react";
import { disablePush, enablePush, pushState, type PushState } from "@/lib/push";

function usePush() {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    pushState().then(setState).catch(() => setState("unsupported"));
  }, []);

  async function run(action: () => Promise<PushState>) {
    setBusy(true);
    try {
      setState(await action());
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not change notifications.");
    }
    setBusy(false);
  }

  return { state, busy, turnOn: () => run(enablePush), turnOff: () => run(disablePush) };
}

const installHelp = (
  <>
    On iPhone: tap <Share size={14} className="inline -mt-0.5" /> Share, then <b>Add to Home Screen</b>. Open DinKin from
    your home screen and turn notifications on there.
  </>
);

// Small reminder at the top of the chat until notifications are on.
export function NotificationBanner() {
  const { state, busy, turnOn } = usePush();
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    try {
      setHidden(localStorage.getItem("dinkin:pushBannerHidden") === "1");
    } catch {
      setHidden(false);
    }
  }, []);

  if (hidden || (state !== "off" && state !== "needs-install")) return null;

  function hide() {
    setHidden(true);
    try {
      localStorage.setItem("dinkin:pushBannerHidden", "1");
    } catch {}
  }

  return (
    <div className="mx-3 mt-3 card p-3 flex items-start gap-3 text-sm">
      <span className="size-9 shrink-0 rounded-full bg-brand-soft text-brand flex items-center justify-center">
        <Bell size={18} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold">Get notified when family writes</p>
        {state === "needs-install" ? (
          <p className="text-muted mt-0.5">{installHelp}</p>
        ) : (
          <button onClick={turnOn} disabled={busy} className="mt-1.5 font-semibold text-brand">
            {busy ? "Turning on…" : "Turn on notifications"}
          </button>
        )}
      </div>
      <button onClick={hide} className="btn-ghost -m-1 p-1" aria-label="Hide">
        <X size={16} />
      </button>
    </div>
  );
}

// Settings card in the Family tab.
export function NotificationSettings() {
  const { state, busy, turnOn, turnOff } = usePush();
  if (state === null) return null;

  return (
    <section className="card p-4 space-y-2">
      <h2 className="font-semibold flex items-center gap-2">
        {state === "on" ? <Bell size={18} className="text-brand" /> : <BellOff size={18} className="text-muted" />}
        Notifications
      </h2>
      {state === "on" && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted">On for this device. You&apos;ll hear about new messages and events.</p>
          <button onClick={turnOff} disabled={busy} className="btn-secondary shrink-0">Turn off</button>
        </div>
      )}
      {state === "off" && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted">Get a notification when someone writes.</p>
          <button onClick={turnOn} disabled={busy} className="btn-primary shrink-0">
            {busy ? "…" : "Turn on"}
          </button>
        </div>
      )}
      {state === "needs-install" && <p className="text-sm text-muted">{installHelp}</p>}
      {state === "blocked" && (
        <p className="text-sm text-muted">Notifications are blocked. Allow them for DinKin in your phone or browser settings.</p>
      )}
      {state === "unsupported" && <p className="text-sm text-muted">This browser can&apos;t show notifications.</p>}
    </section>
  );
}
