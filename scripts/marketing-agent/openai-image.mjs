// Génère une image OpenAI en essayant plusieurs modèles : si le compte n'a pas
// accès à l'un d'eux (« model does not exist »), on passe au suivant.
const DALLE_SIZE = { "1024x1536": "1024x1792", "1536x1024": "1792x1024", "1024x1024": "1024x1024" };

export async function generateImage(prompt, size = "1024x1024") {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("Clé OpenAI manquante");
  const attempts = [
    { model: "gpt-image-1", size, quality: "medium" },
    { model: "gpt-image-1-mini", size, quality: "medium" },
    { model: "dall-e-3", size: DALLE_SIZE[size] ?? "1024x1024", response_format: "b64_json" },
  ];
  let last = "";
  for (const a of attempts) {
    const r = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...a, prompt }),
    });
    const text = await r.text();
    if (r.ok) {
      const b64 = JSON.parse(text)?.data?.[0]?.b64_json;
      if (b64) return Buffer.from(b64, "base64");
      last = `${a.model}: réponse sans image`;
      continue;
    }
    last = `${a.model} [${r.status}] ${text.slice(0, 300)}`;
    // Modèle inaccessible ou paramètre refusé → on essaie le suivant ; sinon on arrête.
    if (![400, 403, 404].includes(r.status)) break;
  }
  throw new Error(`Création d'image impossible : ${last}`);
}
