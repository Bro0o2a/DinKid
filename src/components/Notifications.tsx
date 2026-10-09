"use client";

import { Bell, BellOff, Share, X } from "lucide-react";
import { useEffect, useState } from "react";
import { disablePush, enablePush, pushState, type PushState } from "@/lib/push";
import { useT } from "@/lib/i18n";

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

function InstallHelp() {
  const { t } = useT();
  return (
    <>
      <Share size={14} className="inline -mt-0.5" /> {t("On iPhone: tap Share, then Add to Home Screen. Open DinKin from your home screen and turn notifications on there.")}
    </>
  );
}

// Small reminder at the top of the chat until notifications are on.
export function NotificationBanner() {
  const { t } = useT();
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
        <p className="font-semibold">{t("Get notified when family writes")}</p>
        {state === "needs-install" ? (
          <p className="text-muted mt-0.5"><InstallHelp /></p>
        ) : (
          <button onClick={turnOn} disabled={busy} className="mt-1.5 font-semibold text-brand">
            {busy ? t("Turning on…") : t("Turn on notifications")}
          </button>
        )}
      </div>
      <button onClick={hide} className="btn-ghost -m-1 p-1" aria-label={t("Hide")}>
        <X size={16} />
      </button>
    </div>
  );
}

// Settings card in the Family tab.
export function NotificationSettings() {
  const { t } = useT();
  const { state, busy, turnOn, turnOff } = usePush();
  if (state === null) return null;

  return (
    <section className="card p-4 space-y-2">
      <h2 className="font-semibold flex items-center gap-2">
        {state === "on" ? <Bell size={18} className="text-brand" /> : <BellOff size={18} className="text-muted" />}
        {t("Notifications")}
      </h2>
      {state === "on" && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted">{t("On for this device. You'll hear about new messages and events.")}</p>
          <button onClick={turnOff} disabled={busy} className="btn-secondary shrink-0">{t("Turn off")}</button>
        </div>
      )}
      {state === "off" && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted">{t("Get a notification when someone writes.")}</p>
          <button onClick={turnOn} disabled={busy} className="btn-primary shrink-0">
            {busy ? "…" : t("Turn on")}
          </button>
        </div>
      )}
      {state === "needs-install" && <p className="text-sm text-muted"><InstallHelp /></p>}
      {state === "blocked" && (
        <p className="text-sm text-muted">{t("Notifications are blocked. Allow them for DinKin in your phone or browser settings.")}</p>
      )}
      {state === "unsupported" && <p className="text-sm text-muted">{t("This browser can't show notifications.")}</p>}
    </section>
  );
}
