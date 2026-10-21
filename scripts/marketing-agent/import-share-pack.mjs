// Importe les vidéos publicitaires du dossier marketing/a-partager dans l'onglet « À partager » du Studio.
// Idempotent : une vidéo déjà importée (même titre) est ignorée, sauf si sa version change : elle est alors remplacée.
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false }, realtime: { transport: class NoRealtime {} } });
const dir = join(process.cwd(), "..", "..", "marketing", "a-partager");
const items = existsSync(join(dir, "manifest.json")) ? JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) : [];

for (const it of items) {
  const { data: ex } = await sb.from("marketing_posts").select("id").limit(1).eq("topic", "a_partager").eq("title", it.title);
  const v = it.version ? `v${it.version}/` : "";
  const path = `studio/a-partager/${v}${it.file}`;
  if (ex?.length) {
    const { data: row } = await sb.from("marketing_posts").select("id, video_url").eq("id", ex[0].id).single();
    if (row?.video_url?.endsWith(path)) { console.log("Déjà à jour :", it.title); continue; }
    const up = await sb.storage.from("marketing-media").upload(path, readFileSync(join(dir, it.file)), { contentType: "video/mp4", upsert: true });
    if (up.error) throw new Error(`${it.file} : ${up.error.message}`);
    const url = sb.storage.from("marketing-media").getPublicUrl(path).data.publicUrl;
    const { error } = await sb.from("marketing_posts").update({ video_url: url, video_script: it.script, body: it.body, video_scenes: null }).eq("id", row.id);
    if (error) throw new Error(`${it.title} : ${error.message}`);
    console.log("Remplacée :", it.title);
    continue;
  }
  const up = await sb.storage.from("marketing-media").upload(path, readFileSync(join(dir, it.file)), { contentType: "video/mp4", upsert: true });
  if (up.error) throw new Error(`${it.file} : ${up.error.message}`);
  const url = sb.storage.from("marketing-media").getPublicUrl(path).data.publicUrl;
  const { error } = await sb.from("marketing_posts").insert({
    kind: "manual_video", audience: it.audience, status: "draft", topic: "a_partager",
    title: it.title, body: it.body, video_url: url, image_urls: [], video_script: it.script,
  });
  if (error) throw new Error(`${it.title} : ${error.message}`);
  console.log("Importée :", it.title);
}
