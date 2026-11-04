// POST /api/send {sample, reply}: the maker approves; the reply goes out by email to the demo inbox.
// POST /api/send {kind:"request", sample, summary, reply}: a buyer sends their size from the buyer link; the maker gets it.
// Both only ever go to the fixed demo inbox (no visitor addresses are taken, so this can't be used as a relay).
import { allow } from "../src/live.ts";
export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const reply = String(req.body?.reply || "").slice(0, 3000), sample = String(req.body?.sample || "").replace(/[^\w -]/g, "").slice(0, 40);
  const request = req.body?.kind === "request", summary = String(req.body?.summary || "").slice(0, 1200);
  if (!reply.trim()) return res.status(400).json({ error: "The reply is empty." });
  if (!allow("sends")) return res.status(429).json({ error: "Today's sends are used up." });
  const to = process.env.DEMO_INBOX, keyR = process.env.RESEND_API_KEY;
  if (!to || !keyR) return res.status(200).json({ sent: false, channel: "outbox", to: "the demo outbox (email isn't set up on this server)" });
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${keyR}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.MAIL_FROM || "Measure Once <onboarding@resend.dev>", to: [to], ...(request
      ? { subject: `New sizing request (${sample})`, text: `${summary}\n\nDrafted reply, for you to check before it goes:\n\n${reply}\n\n(Sent from your Measure Once buyer link.)` }
      : { subject: `Your pole size (${sample})`, text: reply }) }),
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) return res.status(502).json({ error: `Email failed: ${j?.message || r.status}` });
  res.status(200).json({ sent: true, channel: "email", to: "the demo inbox", id: j.id });
}
