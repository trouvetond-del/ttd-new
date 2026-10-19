// Outils partagés : voix off (avec dictionnaire de prononciation du Studio) + montage vidéo Reel.
import { execFileSync, execSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function ensureFfmpeg() {
  try { execFileSync("ffmpeg", ["-version"], { stdio: "ignore" }); }
  catch { execSync("sudo apt-get install -y ffmpeg", { stdio: "inherit" }); }
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Remplace les mots mal prononcés par leur écriture phonétique choisie par l'admin.
export function applyPronunciations(text, dict) {
  let out = text;
  // les entrées les plus longues d'abord (ex. « www.site.fr » avant « site.fr »)
  for (const { word, spoken } of [...dict].sort((a, b) => b.word.length - a.word.length)) {
    if (!word?.trim()) continue;
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(word.trim())}(?=$|[^\\p{L}\\p{N}])`, "giu");
    out = out.replace(re, (_, pre) => `${pre}${spoken}`);
  }
  return out;
}

export async function loadVoiceConfig(sb) {
  const [{ data: dict }, { data: settings }] = await Promise.all([
    sb.from("social_pronunciations").select("word,spoken"),
    sb.from("social_studio_settings").select("voice,voice_instructions").eq("id", 1).maybeSingle(),
  ]);
  return {
    dict: dict ?? [],
    voice: settings?.voice || "nova",
    instructions: settings?.voice_instructions || "Voix française chaleureuse, rassurante et dynamique, rythme naturel de Reel.",
  };
}

// scenes : [{ voiceover, image: Buffer }]  →  Buffer MP4 1080x1920
export async function buildVideo(scenes, { openaiRaw, voice }) {
  ensureFfmpeg();
  const dir = mkdtempSync(join(tmpdir(), "reel-"));
  const parts = [];
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    const img = join(dir, `s${i}.png`), mp3 = join(dir, `s${i}.mp3`), mp4 = join(dir, `s${i}.mp4`);
    writeFileSync(img, s.image);
    writeFileSync(mp3, await openaiRaw("/audio/speech", {
      model: "gpt-4o-mini-tts", voice: voice.voice, input: applyPronunciations(s.voiceover, voice.dict),
      response_format: "mp3", instructions: voice.instructions,
    }));
    const dur = parseFloat(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", mp3]).toString()) + 0.4;
    const frames = Math.ceil(dur * 30);
    execFileSync("ffmpeg", ["-y", "-loop", "1", "-i", img, "-i", mp3,
      "-vf", `scale=1215:2160:force_original_aspect_ratio=increase,crop=1215:2160,zoompan=z='min(zoom+0.0006,1.10)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1080x1920:fps=30,format=yuv420p`,
      "-t", dur.toFixed(2), "-c:v", "libx264", "-preset", "veryfast", "-c:a", "aac", "-ar", "44100", "-ac", "2", "-shortest", mp4], { stdio: "ignore" });
    parts.push(mp4);
  }
  const list = join(dir, "list.txt");
  writeFileSync(list, parts.map((p) => `file '${p}'`).join("\n"));
  const out = join(dir, "reel.mp4");
  execFileSync("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", list, "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-c:a", "aac", "-movflags", "+faststart", out], { stdio: "ignore" });
  return readFileSync(out);
}
