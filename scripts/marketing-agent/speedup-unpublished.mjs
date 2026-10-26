// Accélère ×1,25 (voix + images) les vidéos jamais publiées. Idempotent : les fichiers déjà traités finissent par "-x125.mp4".
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const env = (k) => { const v = process.env[k]; if (!v) throw new Error(`Secret manquant : ${k}`); return v; };
const sb = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false }, realtime: { transport: class NoRealtime {} } });
const SPEED = 1.25;

const { data: rows, error } = await sb.from("marketing_posts").select("id, video_url, status, published_at")
  .not("video_url", "is", null).is("published_at", null).neq("status", "published").limit(500);
if (error) throw error;
const todo = rows.filter((r) => !/-x125\.mp4/.test(r.video_url));
console.log(`${todo.length} vidéo(s) non publiée(s) à accélérer`);
const dir = mkdtempSync(join(tmpdir(), "speed-"));
let ok = 0;
for (const r of todo) {
  try {
    const res = await fetch(r.video_url);
    if (!res.ok) throw new Error(`téléchargement ${res.status}`);
    const inp = join(dir, `${r.id}.mp4`), out = join(dir, `${r.id}-x125.mp4`);
    writeFileSync(inp, Buffer.from(await res.arrayBuffer()));
    execFileSync("ffmpeg", ["-y", "-i", inp, "-filter_complex", `[0:v]setpts=PTS/${SPEED}[v];[0:a]atempo=${SPEED}[a]`, "-map", "[v]", "-map", "[a]",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-c:a", "aac", "-movflags", "+faststart", out], { stdio: "ignore" });
    const path = `speed/${r.id}-${Date.now()}-x125.mp4`;
    const up = await sb.storage.from("marketing-media").upload(path, readFileSync(out), { contentType: "video/mp4", upsert: true });
    if (up.error) throw up.error;
    const url = sb.storage.from("marketing-media").getPublicUrl(path).data.publicUrl;
    const { error: e } = await sb.from("marketing_posts").update({ video_url: url, updated_at: new Date().toISOString() }).eq("id", r.id);
    if (e) throw e;
    ok++; console.log(`✔ ${r.id}`);
  } catch (e) { console.log(`✘ ${r.id} : ${e.message}`); }
}
console.log(`${ok}/${todo.length} accélérée(s)`);
