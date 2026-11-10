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
// Règle : toute voix off se termine par « Rendez-vous sur trouvetondemenageur point FR ».
export const CTA_VOICE = "Rendez-vous sur trouvetondemenageur point FR.";
export function withCta(scenes) {
  if (!scenes?.length || scenes.some((s) => /point\s*FR/i.test(s.voiceover ?? ""))) return scenes;
  const last = scenes[scenes.length - 1];
  return [...scenes.slice(0, -1), { ...last, voiceover: `${(last.voiceover ?? "").trim()} ${CTA_VOICE}`.trim() }];
}

// Rythme : légèrement accéléré (au-delà de 1,15 la voix devient robotique).
const VOICE_SPEED = 1.12;
// Consignes imposées en plus de celles de l'admin : débit naturel, sans blancs.
const NATURAL_STYLE = "Parle comme une vraie personne qui raconte à un ami, débit rapide et fluide de Reel, enchaîne les phrases sans marquer de longues pauses, intonation vivante et variée, sourire dans la voix, jamais monotone ni lu.";
// Coupe les blancs au début/à la fin et raccourcit les pauses internes à 0,15 s max.
const TIGHTEN = "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.03," +
  "silenceremove=stop_periods=-1:stop_threshold=-45dB:stop_duration=0.15:stop_silence=0.12";

const probe = (f) => parseFloat(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString());

export async function buildVideo(scenes, { openaiRaw, voice }) {
  ensureFfmpeg();
  scenes = withCta(scenes);
  const dir = mkdtempSync(join(tmpdir(), "reel-"));
  // « nova » était l'ancienne valeur par défaut ; « coral » sonne plus humain en français.
  const voiceName = !voice.voice || voice.voice === "nova" ? "coral" : voice.voice;
  const parts = [], audios = [];
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    const img = join(dir, `s${i}.png`), wav = join(dir, `s${i}.wav`), mp4 = join(dir, `s${i}.mp4`);
    writeFileSync(img, s.image);
    const raw = join(dir, `s${i}-raw.mp3`);
    writeFileSync(raw, await openaiRaw("/audio/speech", {
      model: "gpt-4o-mini-tts", voice: voiceName, input: applyPronunciations(s.voiceover, voice.dict),
      response_format: "mp3", instructions: `${voice.instructions} ${NATURAL_STYLE}`,
    }));
    // Blancs retirés aux deux bouts + pauses raccourcies, puis léger accélérage sans changer la hauteur.
    execFileSync("ffmpeg", ["-y", "-i", raw, "-af", `${TIGHTEN},areverse,${TIGHTEN.split(",")[0]},areverse,atempo=${VOICE_SPEED}`, "-ar", "48000", "-ac", "2", wav], { stdio: "ignore" });
    const dur = probe(wav) + (i === scenes.length - 1 ? 0.6 : 0.08); // 80 ms de respiration entre scènes
    audios.push({ wav, dur });
    const frames = Math.ceil(dur * 30);
    execFileSync("ffmpeg", ["-y", "-loop", "1", "-i", img,
      "-vf", `scale=1215:2160:force_original_aspect_ratio=increase,crop=1215:2160,zoompan=z='min(zoom+0.0009,1.12)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1080x1920:fps=30,format=yuv420p`,
      "-t", dur.toFixed(3), "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "18", mp4], { stdio: "ignore" });
    parts.push(mp4);
  }
  // Une seule piste voix continue (pas de coupure audio entre scènes), volume normalisé pour les réseaux.
  const voiceTrack = join(dir, "voice.wav");
  const inputs = audios.flatMap((a) => ["-i", a.wav]);
  const pads = audios.map((a, i) => `[${i}:a]apad=whole_dur=${a.dur.toFixed(3)}[a${i}]`).join(";");
  const chain = audios.map((_, i) => `[a${i}]`).join("");
  execFileSync("ffmpeg", ["-y", ...inputs, "-filter_complex", `${pads};${chain}concat=n=${audios.length}:v=0:a=1,loudnorm=I=-14:TP=-1.5:LRA=11[out]`, "-map", "[out]", "-ar", "48000", voiceTrack], { stdio: "ignore" });
  const list = join(dir, "list.txt");
  writeFileSync(list, parts.map((p) => `file '${p}'`).join("\n"));
  const out = join(dir, "reel.mp4");
  execFileSync("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", list, "-i", voiceTrack, "-map", "0:v", "-map", "1:a",
    "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-maxrate", "8M", "-bufsize", "16M", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", out], { stdio: "ignore" });
  return readFileSync(out);
}
