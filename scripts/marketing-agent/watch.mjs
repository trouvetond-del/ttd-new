// Surveillance continue du Studio : dès qu'une action est demandée par l'admin, l'agent la traite (vérifie toutes les 20 s).
import { createClient } from "@supabase/supabase-js";
import { spawnSync } from "node:child_process";

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false }, realtime: { transport: class NoRealtime {} } });
const end = Date.now() + Number(process.env.WATCH_MINUTES || 340) * 60_000;
while (Date.now() < end) {
  const { count, error } = await sb.from("social_jobs").select("id", { count: "exact", head: true }).eq("status", "queued");
  if (error) console.error("Lecture des actions :", error.message);
  else if (count) {
    console.log(`${new Date().toISOString()} : ${count} action(s) à traiter`);
    spawnSync("node", ["studio.mjs"], { stdio: "inherit" });
  }
  await new Promise((r) => setTimeout(r, 20_000));
}
