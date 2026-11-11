// Publication LinkedIn (profil Trouve Ton Déménageur) via la passerelle de connecteurs.
// Ne bloque jamais Facebook/Instagram : en cas d'échec on renvoie l'erreur au lieu de lever.
const GW = "https://connector-gateway.lovable.dev/linkedin";
const H = () => ({ Authorization: `Bearer ${process.env.LOVABLE_API_KEY}`, "X-Connection-Api-Key": process.env.LINKEDIN_API_KEY, "X-Restli-Protocol-Version": "2.0.0" });

async function li(path, init = {}) {
  const r = await fetch(`${GW}${path}`, { ...init, headers: { ...H(), "Content-Type": "application/json", ...(init.headers ?? {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`LinkedIn ${path} [${r.status}] ${t}`);
  return t ? JSON.parse(t) : {};
}
let author;
async function me() { author ??= `urn:li:person:${(await li("/v2/userinfo")).sub}`; return author; }

async function uploadMedia(url, kind) {
  const owner = await me();
  const reg = await li("/v2/assets?action=registerUpload", { method: "POST", body: JSON.stringify({ registerUploadRequest: {
    recipes: [`urn:li:digitalmediaRecipe:feedshare-${kind}`], owner,
    serviceRelationships: [{ relationshipType: "OWNER", identifier: "urn:li:userGeneratedContent" }] } }) });
  const up = Object.values(reg.value.uploadMechanism)[0].uploadUrl; // URL pré-signée par LinkedIn
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  const r = await fetch(up, { method: "PUT", body: buf });
  if (!r.ok) throw new Error(`LinkedIn upload [${r.status}] ${await r.text()}`);
  return reg.value.asset;
}

export async function shareLinkedIn({ text, imageUrl, videoUrl }) {
  if (!process.env.LINKEDIN_API_KEY || !process.env.LOVABLE_API_KEY) return { id: null, error: "LinkedIn non configuré" };
  try {
    const kind = videoUrl ? "video" : imageUrl ? "image" : null;
    const asset = kind ? await uploadMedia(videoUrl ?? imageUrl, kind) : null;
    const body = { author: await me(), lifecycleState: "PUBLISHED", visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
      specificContent: { "com.linkedin.ugc.ShareContent": { shareCommentary: { text: text.slice(0, 2900) },
        shareMediaCategory: kind ? kind.toUpperCase() : "NONE", ...(asset ? { media: [{ status: "READY", media: asset }] } : {}) } } };
    if (kind === "video") await new Promise((s) => setTimeout(s, 20_000)); // laisser LinkedIn traiter la vidéo
    const r = await fetch(`${GW}/v2/ugcPosts`, { method: "POST", headers: { ...H(), "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const t = await r.text();
    if (!r.ok) throw new Error(`LinkedIn ugcPosts [${r.status}] ${t}`);
    return { id: r.headers.get("x-restli-id") ?? JSON.parse(t || "{}").id ?? "ok", error: null };
  } catch (e) { console.warn(String(e?.message ?? e)); return { id: null, error: String(e?.message ?? e) }; }
}
