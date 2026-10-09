import { supabase } from "./supabase";

export type PushState = "unsupported" | "needs-install" | "blocked" | "off" | "on";

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isInstalled = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;

export function registerServiceWorker() {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
}

export async function pushState(): Promise<PushState> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    // On iPhone, notifications only work once DinKin is added to the home screen.
    return isIos() && !isInstalled() ? "needs-install" : "unsupported";
  }
  if (Notification.permission === "denied") return "blocked";
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
}

function keyBytes(base64url: string) {
  const base64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

export async function enablePush(): Promise<PushState> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "blocked" : "off";

  const { publicKey } = await fetch("/api/push").then((r) => r.json());
  if (!publicKey) throw new Error(document.documentElement.lang === "ar" ? "الإشعارات مش جاهزة بعد. اسأل أدمن العيلة." : "Notifications are not set up yet. Ask the family admin.");

  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  const current = sub?.options.applicationServerKey;
  const sameKey = current && btoa(String.fromCharCode(...new Uint8Array(current))) === btoa(String.fromCharCode(...keyBytes(publicKey)));
  if (sub && !sameKey) {
    await sub.unsubscribe();
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });

  const { endpoint, keys } = sub.toJSON();
  const { error } = await supabase.rpc("save_push_subscription", {
    sub_endpoint: endpoint,
    sub_p256dh: keys?.p256dh,
    sub_auth: keys?.auth,
  });
  if (error) throw new Error(error.message);
  return "on";
}

export async function disablePush(): Promise<PushState> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await supabase.rpc("remove_push_subscription", { sub_endpoint: sub.endpoint });
    await sub.unsubscribe();
  }
  return "off";
}

// Stop notifications on this device before signing out.
export async function signOut() {
  try {
    if ("serviceWorker" in navigator) await disablePush();
  } catch {}
  await supabase.auth.signOut();
}

// Opening the app counts as reading: clear the number on the icon and the shown notifications.
export async function clearBadge(familyId?: string) {
  try {
    const cache = await caches.open("dinkin-badge");
    await cache.put("/count", new Response("0"));
    await navigator.clearAppBadge?.();
    const reg = await navigator.serviceWorker?.getRegistration();
    const shown = (await reg?.getNotifications(familyId ? { tag: familyId } : undefined)) ?? [];
    shown.forEach((n) => n.close());
  } catch {}
}
