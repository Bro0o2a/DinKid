import webpush from "web-push";
import { vapidKeys } from "@/lib/vapid";

export const runtime = "nodejs";

type Payload = {
  title: string;
  body: string;
  url: string;
  tag: string;
  subscriptions: webpush.PushSubscription[];
};

// The app asks for the public key when someone turns notifications on.
export function GET() {
  const secret = process.env.PUSH_SECRET;
  return Response.json({ publicKey: secret ? vapidKeys(secret).publicKey : null });
}

// The database calls this after a new message or event (see supabase/migrations/004_push.sql).
export async function POST(request: Request) {
  const secret = process.env.PUSH_SECRET;
  if (!secret || request.headers.get("x-push-secret") !== secret) {
    return new Response("Forbidden", { status: 403 });
  }
  const { title, body, url, tag, subscriptions } = (await request.json()) as Payload;
  const { publicKey, privateKey } = vapidKeys(secret);
  webpush.setVapidDetails("https://din-kid.vercel.app", publicKey, privateKey);

  const notification = JSON.stringify({ title, body, url, tag });
  const results = await Promise.allSettled(
    subscriptions.map((s) => webpush.sendNotification(s, notification, { TTL: 60 * 60 * 24 })),
  );
  return Response.json({ sent: results.filter((r) => r.status === "fulfilled").length, total: results.length });
}
