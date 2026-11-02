import { key, usage } from "../src/live.ts";
export default function handler(_req: any, res: any) { res.status(200).json({ live: !!key(), email: !!(process.env.RESEND_API_KEY && process.env.DEMO_INBOX), usage: usage() }); }
