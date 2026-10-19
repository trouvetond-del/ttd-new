import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Clapperboard, Image as ImageIcon, Video, Facebook, Instagram, Pencil, Mic, Trash2, Upload, BarChart3,
  RefreshCw, Loader, ExternalLink, Eye, MousePointerClick, Heart, MessageCircle, Share2, Clock, CheckCircle2,
  XCircle, Plus, BookA, X, Sparkles, Archive,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { showToast } from '../../utils/toast';

type Table = 'marketing_posts' | 'marketing_opportunity_posts';
type Scene = { voiceover: string; image_url?: string | null; image_prompt?: string | null };
type Pub = {
  id: string; target_table: Table; target_id: string; platform: 'facebook' | 'instagram'; permalink: string | null;
  published_at: string; deleted_at: string | null; views: number | null; clicks: number | null; likes: number | null;
  comments: number | null; shares: number | null; saves: number | null; stats_at: string | null; stats_error: string | null;
};
type Job = { id: string; action: string; target_table: Table | null; target_id: string | null; platforms: string[]; status: string; result: string | null; error: string | null; created_at: string; done_at: string | null };
type Post = {
  id: string; table: Table; kind: string; audience: string; status: string; title: string | null; body: string;
  image: string | null; video: string | null; scenes: Scene[] | null; created_at: string; published_at: string | null; error: string | null;
};

const KIND_LABEL: Record<string, string> = {
  article_client: 'Article client', article_mover: 'Article déménageur', video_client: 'Reel client', video_mover: 'Reel déménageur',
  manual_image: 'Photo importée', manual_video: 'Vidéo importée', opportunity: 'Déménagement dispo',
};
const STATUS: Record<string, { label: string; cls: string }> = {
  published: { label: 'Publié', cls: 'bg-emerald-100 text-emerald-700' },
  pending: { label: 'En préparation', cls: 'bg-amber-100 text-amber-700' },
  draft: { label: 'À publier plus tard', cls: 'bg-slate-100 text-slate-700' },
  failed: { label: 'Échec', cls: 'bg-red-100 text-red-700' },
  archived: { label: 'Archivé', cls: 'bg-slate-200 text-slate-500' },
};
const ACTION_LABEL: Record<string, string> = {
  publish: 'Publication', update_text: 'Modification du texte', rerender_video: 'Nouvelle voix off', delete: 'Suppression', refresh_stats: 'Actualiser les stats',
};
const VOICES = ['nova', 'shimmer', 'coral', 'sage', 'alloy', 'echo', 'onyx', 'ash', 'ballad', 'verse'];

const sum = (pubs: Pub[], k: keyof Pub) => pubs.reduce((a, p) => a + (typeof p[k] === 'number' ? (p[k] as number) : 0), 0);
const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—');

export default function AdminSocialStudio() {
  const [tab, setTab] = useState<'posts' | 'import' | 'stats' | 'voice' | 'queue'>('posts');
  const [posts, setPosts] = useState<Post[]>([]);
  const [pubs, setPubs] = useState<Pub[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'article' | 'video' | 'manual' | 'opportunity'>('all');
  const [editText, setEditText] = useState<Post | null>(null);
  const [editVoice, setEditVoice] = useState<Post | null>(null);

  const load = async () => {
    setLoading(true);
    const [m, o, p, j] = await Promise.all([
      supabase.from('marketing_posts').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('marketing_opportunity_posts').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('social_publications').select('*').order('published_at', { ascending: false }).limit(1000),
      supabase.from('social_jobs').select('*').order('created_at', { ascending: false }).limit(100),
    ]);
    const list: Post[] = [
      ...((m.data ?? []) as any[]).map((r) => ({
        id: r.id, table: 'marketing_posts' as Table, kind: r.kind, audience: r.audience, status: r.status, title: r.title,
        body: r.body ?? '', image: r.image_urls?.[0] ?? null, video: r.video_url, created_at: r.created_at, published_at: r.published_at, error: r.error,
        scenes: r.video_scenes ?? (r.video_script ? String(r.video_script).split('\n').filter(Boolean).map((v: string) => ({ voiceover: v })) : null),
      })),
      ...((o.data ?? []) as any[]).map((r) => ({
        id: r.id, table: 'marketing_opportunity_posts' as Table, kind: 'opportunity', audience: 'mover', status: r.status, title: null,
        body: r.body ?? '', image: r.image_url, video: null, scenes: null, created_at: r.created_at, published_at: r.published_at, error: r.error,
      })),
    ].sort((a, b) => b.created_at.localeCompare(a.created_at));
    setPosts(list);
    setPubs((p.data as Pub[]) ?? []);
    setJobs((j.data as Job[]) ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); const id = setInterval(load, 60_000); return () => clearInterval(id); }, []);

  const queue = async (action: string, post: Post | null, platforms: string[] = [], payload: Record<string, unknown> = {}) => {
    const { error } = await supabase.from('social_jobs').insert({
      action, target_table: post?.table ?? null, target_id: post?.id ?? null, platforms, payload,
    });
    if (error) { showToast(`Impossible : ${error.message}`, 'error'); return false; }
    showToast("C'est noté : l'agent s'en occupe dans les 30 minutes maximum.", 'success');
    load();
    return true;
  };

  const pubsOf = (p: Post) => pubs.filter((x) => x.target_id === p.id && !x.deleted_at);
  const pendingOf = (p: Post) => jobs.filter((j) => j.target_id === p.id && (j.status === 'queued' || j.status === 'running'));

  const filtered = useMemo(() => posts.filter((p) =>
    filter === 'all' ? true : filter === 'article' ? p.kind.startsWith('article') : filter === 'video' ? !!p.video
      : filter === 'manual' ? p.kind.startsWith('manual') : p.kind === 'opportunity'), [posts, filter]);

  const live = pubs.filter((p) => !p.deleted_at);
  const totals = { views: sum(live, 'views'), clicks: sum(live, 'clicks'), likes: sum(live, 'likes'), comments: sum(live, 'comments'), shares: sum(live, 'shares') };
  const queued = jobs.filter((j) => j.status === 'queued' || j.status === 'running').length;

  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-gradient-to-br from-slate-900 via-blue-900 to-emerald-700 p-6 text-white shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-white/15 p-3"><Clapperboard className="h-7 w-7" /></div>
            <div>
              <h2 className="text-2xl font-bold">Studio Social Media</h2>
              <p className="text-sm text-blue-100">Facebook & Instagram : posts, vidéos, voix off, imports et statistiques</p>
            </div>
          </div>
          <button onClick={() => queue('refresh_stats', null)} className="flex items-center gap-2 rounded-xl bg-white/15 px-4 py-2 text-sm font-medium hover:bg-white/25">
            <RefreshCw className="h-4 w-4" /> Actualiser les stats
          </button>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-5">
          {[
            { l: 'Vues', v: totals.views, i: Eye }, { l: 'Clics', v: totals.clicks, i: MousePointerClick }, { l: "J'aime", v: totals.likes, i: Heart },
            { l: 'Commentaires', v: totals.comments, i: MessageCircle }, { l: 'Partages', v: totals.shares, i: Share2 },
          ].map(({ l, v, i: I }) => (
            <div key={l} className="rounded-2xl bg-white/10 p-3 backdrop-blur">
              <div className="flex items-center gap-2 text-xs text-blue-100"><I className="h-4 w-4" />{l}</div>
              <div className="mt-1 text-2xl font-bold">{v.toLocaleString('fr-FR')}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {([
          ['posts', 'Tous les posts', ImageIcon], ['import', 'Importer', Upload], ['stats', 'Statistiques', BarChart3],
          ['voice', 'Voix off & prononciation', Mic], ['queue', `Actions en cours${queued ? ` (${queued})` : ''}`, Clock],
        ] as const).map(([id, label, I]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition ${tab === id ? 'bg-gradient-to-r from-blue-600 to-emerald-500 text-white shadow' : 'bg-white text-slate-700 shadow-sm hover:bg-slate-50'}`}>
            <I className="h-4 w-4" />{label}
          </button>
        ))}
      </div>

      {loading && !posts.length ? (
        <div className="flex justify-center py-16"><Loader className="h-8 w-8 animate-spin text-blue-600" /></div>
      ) : tab === 'posts' ? (
        <>
          <div className="flex flex-wrap gap-2">
            {([['all', 'Tout'], ['article', 'Articles'], ['video', 'Vidéos'], ['manual', 'Importés'], ['opportunity', 'Déménagements dispo']] as const).map(([id, l]) => (
              <button key={id} onClick={() => setFilter(id)} className={`rounded-full px-3 py-1 text-xs font-semibold ${filter === id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>{l}</button>
            ))}
          </div>
          {!filtered.length && <p className="rounded-2xl bg-white p-8 text-center text-slate-500 shadow-sm">Aucun post pour l'instant.</p>}
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((p) => {
              const ps = pubsOf(p); const pend = pendingOf(p); const st = STATUS[p.status] ?? STATUS.pending;
              return (
                <div key={`${p.table}-${p.id}`} className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-md ring-1 ring-slate-100">
                  <div className="relative aspect-square bg-slate-100">
                    {p.video ? <video src={p.video} controls className="h-full w-full object-cover" />
                      : p.image ? <img src={p.image} alt="" className="h-full w-full object-cover" loading="lazy" />
                      : <div className="flex h-full items-center justify-center text-slate-400">Pas encore de média</div>}
                    <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2 py-0.5 text-xs font-semibold text-slate-800">{KIND_LABEL[p.kind] ?? p.kind}</span>
                    <span className={`absolute right-3 top-3 rounded-full px-2 py-0.5 text-xs font-semibold ${st.cls}`}>{st.label}</span>
                  </div>
                  <div className="flex flex-1 flex-col gap-3 p-4">
                    {p.title && <h3 className="font-semibold text-slate-900">{p.title}</h3>}
                    <p className="line-clamp-4 whitespace-pre-line text-sm text-slate-600">{p.body || '—'}</p>
                    <div className="text-xs text-slate-400">Créé le {fmtDate(p.created_at)}{p.published_at ? ` · publié le ${fmtDate(p.published_at)}` : ''}</div>
                    {p.error && p.status === 'failed' && <p className="rounded-lg bg-red-50 p-2 text-xs text-red-700">{p.error.slice(0, 200)}</p>}
                    {ps.length > 0 && (
                      <div className="space-y-1">
                        {ps.map((x) => (
                          <div key={x.id} className="flex items-center gap-3 rounded-lg bg-slate-50 px-2 py-1 text-xs text-slate-600">
                            {x.platform === 'facebook' ? <Facebook className="h-4 w-4 text-blue-600" /> : <Instagram className="h-4 w-4 text-pink-600" />}
                            <span title="Vues"><Eye className="mr-0.5 inline h-3 w-3" />{x.views ?? '—'}</span>
                            <span title="Clics"><MousePointerClick className="mr-0.5 inline h-3 w-3" />{x.clicks ?? '—'}</span>
                            <span title="J'aime"><Heart className="mr-0.5 inline h-3 w-3" />{x.likes ?? 0}</span>
                            <span title="Commentaires"><MessageCircle className="mr-0.5 inline h-3 w-3" />{x.comments ?? 0}</span>
                            {x.permalink && <a href={x.permalink} target="_blank" rel="noreferrer" className="ml-auto text-blue-600"><ExternalLink className="h-3.5 w-3.5" /></a>}
                          </div>
                        ))}
                      </div>
                    )}
                    {pend.length > 0 && (
                      <p className="flex items-center gap-1 text-xs font-medium text-amber-600"><Loader className="h-3 w-3 animate-spin" />{pend.map((j) => ACTION_LABEL[j.action]).join(', ')} en attente…</p>
                    )}
                    <div className="mt-auto grid grid-cols-2 gap-2 pt-2">
                      <button onClick={() => queue('publish', p, ['facebook'])} className="flex items-center justify-center gap-1 rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700">
                        <Facebook className="h-4 w-4" />Partager Facebook
                      </button>
                      <button onClick={() => queue('publish', p, ['instagram'])} className="flex items-center justify-center gap-1 rounded-xl bg-gradient-to-r from-pink-500 to-orange-400 px-3 py-2 text-xs font-semibold text-white hover:opacity-90">
                        <Instagram className="h-4 w-4" />Partager Instagram
                      </button>
                      <button onClick={() => setEditText(p)} className="flex items-center justify-center gap-1 rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200">
                        <Pencil className="h-4 w-4" />Modifier le texte
                      </button>
                      {p.video && p.table === 'marketing_posts' ? (
                        <button onClick={() => setEditVoice(p)} className="flex items-center justify-center gap-1 rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200">
                          <Mic className="h-4 w-4" />Voix off
                        </button>
                      ) : (
                        <button onClick={() => { if (confirm('Supprimer ce post de Facebook et l’archiver ?')) queue('delete', p); }} className="flex items-center justify-center gap-1 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-100">
                          <Trash2 className="h-4 w-4" />Supprimer
                        </button>
                      )}
                      {p.video && p.table === 'marketing_posts' && (
                        <button onClick={() => { if (confirm('Supprimer ce post de Facebook et l’archiver ?')) queue('delete', p); }} className="col-span-2 flex items-center justify-center gap-1 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-100">
                          <Trash2 className="h-4 w-4" />Supprimer
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : tab === 'import' ? (
        <ImportPanel onDone={() => { setTab('posts'); load(); }} queue={queue} />
      ) : tab === 'stats' ? (
        <StatsPanel posts={posts} pubs={live} />
      ) : tab === 'voice' ? (
        <VoicePanel />
      ) : (
        <div className="overflow-hidden rounded-2xl bg-white shadow-md">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr><th className="p-3">Action</th><th className="p-3">Réseaux</th><th className="p-3">Demandée</th><th className="p-3">État</th><th className="p-3">Résultat</th></tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id} className="border-t border-slate-100">
                  <td className="p-3 font-medium">{ACTION_LABEL[j.action] ?? j.action}</td>
                  <td className="p-3">{j.platforms?.length ? j.platforms.join(', ') : '—'}</td>
                  <td className="p-3 text-slate-500">{fmtDate(j.created_at)}</td>
                  <td className="p-3">
                    {j.status === 'done' ? <span className="flex items-center gap-1 text-emerald-600"><CheckCircle2 className="h-4 w-4" />Fait</span>
                      : j.status === 'failed' ? <span className="flex items-center gap-1 text-red-600"><XCircle className="h-4 w-4" />Échec</span>
                      : <span className="flex items-center gap-1 text-amber-600"><Loader className="h-4 w-4 animate-spin" />{j.status === 'running' ? 'En cours' : 'En attente'}</span>}
                  </td>
                  <td className="p-3 text-xs text-slate-600">{j.error ?? j.result ?? ''}</td>
                </tr>
              ))}
              {!jobs.length && <tr><td colSpan={5} className="p-8 text-center text-slate-500">Aucune action demandée.</td></tr>}
            </tbody>
          </table>
          <p className="border-t border-slate-100 p-3 text-xs text-slate-500">L'agent passe toutes les 30 minutes et exécute les actions dans l'ordre.</p>
        </div>
      )}

      {editText && <TextModal post={editText} onClose={() => setEditText(null)} onSaved={async (p, republish) => {
        setEditText(null);
        if (p.published_at || pubsOf(p).length) await queue('update_text', p);
        if (republish.length) await queue('publish', p, republish);
        load();
      }} />}
      {editVoice && <VoiceModal post={editVoice} onClose={() => setEditVoice(null)} onSubmit={async (scenes, republish) => {
        setEditVoice(null);
        await queue('rerender_video', editVoice, republish, { scenes });
      }} />}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-bold">{title}</h3><button onClick={onClose}><X className="h-5 w-5" /></button></div>
        {children}
      </div>
    </div>
  );
}

function PlatformPick({ value, onChange, label }: { value: string[]; onChange: (v: string[]) => void; label: string }) {
  const toggle = (p: string) => onChange(value.includes(p) ? value.filter((x) => x !== p) : [...value, p]);
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <span className="text-slate-600">{label}</span>
      {['facebook', 'instagram'].map((p) => (
        <label key={p} className="flex items-center gap-1"><input type="checkbox" checked={value.includes(p)} onChange={() => toggle(p)} />{p === 'facebook' ? 'Facebook' : 'Instagram'}</label>
      ))}
    </div>
  );
}

function TextModal({ post, onClose, onSaved }: { post: Post; onClose: () => void; onSaved: (p: Post, republish: string[]) => void }) {
  const [title, setTitle] = useState(post.title ?? '');
  const [body, setBody] = useState(post.body);
  const [republish, setRepublish] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    const patch = post.table === 'marketing_posts' ? { title: title || null, body, updated_at: new Date().toISOString() } : { body };
    const { error } = await supabase.from(post.table).update(patch).eq('id', post.id);
    setSaving(false);
    if (error) return showToast(`Erreur : ${error.message}`, 'error');
    onSaved({ ...post, title, body }, republish);
  };
  return (
    <Modal title="Modifier le texte" onClose={onClose}>
      {post.kind.startsWith('article') && <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titre" className="mb-3 w-full rounded-xl border border-slate-200 p-3" />}
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={10} className="w-full rounded-xl border border-slate-200 p-3 text-sm" />
      <p className="mt-1 text-xs text-slate-500">{body.length} caractères · pensez à garder « https://www.trouvetondemenageur.fr ».</p>
      <LinkPreview text={body} />
      <p className="mt-3 rounded-lg bg-blue-50 p-3 text-xs text-blue-800">Le post Facebook déjà publié sera corrigé automatiquement. Instagram ne permet pas de modifier une légende : cochez Instagram ci‑dessous pour le republier avec le nouveau texte.</p>
      <div className="mt-3"><PlatformPick value={republish} onChange={setRepublish} label="Republier aussi sur :" /></div>
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm">Annuler</button>
        <button onClick={save} disabled={saving} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
      </div>
    </Modal>
  );
}

function VoiceModal({ post, onClose, onSubmit }: { post: Post; onClose: () => void; onSubmit: (s: Scene[], republish: string[]) => void }) {
  const [scenes, setScenes] = useState<Scene[]>(post.scenes?.length ? post.scenes : [{ voiceover: '' }]);
  const [republish, setRepublish] = useState<string[]>([]);
  const set = (i: number, v: string) => setScenes(scenes.map((s, k) => (k === i ? { ...s, voiceover: v } : s)));
  return (
    <Modal title="Corriger la voix off" onClose={onClose}>
      <p className="mb-4 text-sm text-slate-600">Modifiez ce que dit la voix, scène par scène. Astuce : écrivez les mots difficiles comme ils se prononcent (ex. « ka-biss » pour KBIS), ou ajoutez-les une fois pour toutes dans l'onglet « Voix off & prononciation ».</p>
      <div className="space-y-3">
        {scenes.map((s, i) => (
          <div key={i} className="flex gap-3 rounded-xl bg-slate-50 p-3">
            {s.image_url ? <img src={s.image_url} alt="" className="h-20 w-14 shrink-0 rounded-lg object-cover" /> : <div className="flex h-20 w-14 shrink-0 items-center justify-center rounded-lg bg-slate-200 text-xs text-slate-500">#{i + 1}</div>}
            <textarea value={s.voiceover} onChange={(e) => set(i, e.target.value)} rows={3} className="flex-1 rounded-lg border border-slate-200 p-2 text-sm" />
            {scenes.length > 1 && <button onClick={() => setScenes(scenes.filter((_, k) => k !== i))} className="self-start text-slate-400 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>}
          </div>
        ))}
        <button onClick={() => setScenes([...scenes, { voiceover: '' }])} className="flex items-center gap-1 text-sm font-medium text-blue-600"><Plus className="h-4 w-4" />Ajouter une scène</button>
      </div>
      {!post.scenes?.some((s) => s.image_url) && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">Cette ancienne vidéo n'a pas gardé ses images : de nouvelles images seront créées pour chaque scène.</p>}
      <div className="mt-4"><PlatformPick value={republish} onChange={setRepublish} label="Une fois refaite, publier sur :" /></div>
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm">Annuler</button>
        <button onClick={() => onSubmit(scenes.filter((s) => s.voiceover.trim()), republish)} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Refaire la vidéo</button>
      </div>
    </Modal>
  );
}

function ImportPanel({ onDone, queue }: { onDone: () => void; queue: (a: string, p: Post | null, pl?: string[]) => Promise<boolean> }) {
  const [file, setFile] = useState<File | null>(null);
  const [body, setBody] = useState('\n\n👉 https://www.trouvetondemenageur.fr');
  const [audience, setAudience] = useState<'client' | 'mover' | 'all'>('all');
  const [platforms, setPlatforms] = useState<string[]>(['facebook', 'instagram']);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  const isVideo = file?.type.startsWith('video/');

  const [hint, setHint] = useState('');
  const [writing, setWriting] = useState(false);

  const grabFrames = async (): Promise<string[]> => {
    if (!file || !preview) return [];
    const draw = (src: CanvasImageSource, w: number, h: number) => {
      const scale = Math.min(1, 768 / Math.max(w, h));
      const c = document.createElement('canvas'); c.width = Math.round(w * scale); c.height = Math.round(h * scale);
      c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.75);
    };
    if (!isVideo) {
      const img = new Image(); img.src = preview; await img.decode();
      return [draw(img, img.naturalWidth, img.naturalHeight)];
    }
    const v = document.createElement('video'); v.src = preview; v.muted = true; v.preload = 'auto';
    await new Promise((ok, ko) => { v.onloadeddata = ok; v.onerror = ko; });
    const out: string[] = [];
    for (const f of [0.1, 0.35, 0.6, 0.85]) {
      await new Promise((ok) => { v.onseeked = ok; v.currentTime = (v.duration || 1) * f; });
      out.push(draw(v, v.videoWidth, v.videoHeight));
    }
    return out;
  };

  const writeWithAI = async () => {
    if (!file) return showToast('Importez d’abord une photo ou une vidéo.', 'error');
    setWriting(true);
    try {
      const images = await grabFrames();
      const { data, error } = await supabase.functions.invoke('studio-caption', { body: { images, audience, isVideo, hint } });
      if (error || !data?.text) {
        let msg = data?.error || error?.message || 'Erreur inconnue';
        try { msg = (await (error as any)?.context?.json())?.error ?? msg; } catch { /* ignore */ }
        showToast(`Texte non créé : ${msg}`, 'error');
      } else { setBody(data.text); showToast('Texte créé — relisez-le avant de publier.', 'success'); }
    } catch { showToast('Impossible de lire ce fichier.', 'error'); }
    setWriting(false);
  };

  const submit = async (publish: boolean) => {
    if (!file) return showToast('Choisissez une photo ou une vidéo.', 'error');
    if (isVideo && file.type !== 'video/mp4' && file.type !== 'video/quicktime') return showToast('Vidéo au format MP4 ou MOV uniquement.', 'error');
    if (file.size > 100 * 1024 * 1024) return showToast('Fichier trop lourd (100 Mo maximum).', 'error');
    setBusy(true);
    const ext = file.name.split('.').pop()?.toLowerCase() || (isVideo ? 'mp4' : 'jpg');
    const path = `studio/uploads/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const up = await supabase.storage.from('marketing-media').upload(path, file, { contentType: file.type });
    if (up.error) { setBusy(false); return showToast(`Envoi impossible : ${up.error.message}`, 'error'); }
    const url = supabase.storage.from('marketing-media').getPublicUrl(path).data.publicUrl;
    const { data, error } = await supabase.from('marketing_posts').insert({
      kind: isVideo ? 'manual_video' : 'manual_image', audience, status: 'draft', body,
      image_urls: isVideo ? [] : [url], video_url: isVideo ? url : null,
    }).select('id').single();
    if (error || !data) { setBusy(false); return showToast(`Erreur : ${error?.message}`, 'error'); }
    if (publish && platforms.length) await queue('publish', { id: data.id, table: 'marketing_posts' } as Post, platforms);
    else showToast('Post archivé : publiez-le quand vous voulez depuis « Tous les posts ».', 'success');
    setFile(null);
    setBusy(false);
    onDone();
  };

  return (
    <div className="grid gap-6 rounded-2xl bg-white p-6 shadow-md md:grid-cols-2">
      <div>
        <button onClick={() => input.current?.click()} className="flex aspect-square w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 text-slate-500 hover:border-blue-400">
          {preview ? (isVideo ? <video src={preview} controls className="h-full w-full object-cover" /> : <img src={preview} alt="" className="h-full w-full object-cover" />)
            : <><Upload className="h-10 w-10" /><span className="font-medium">Importer une photo ou une vidéo</span><span className="text-xs">JPG, PNG, MP4 · vidéo verticale conseillée pour les Reels</span></>}
        </button>
        <input ref={input} type="file" accept="image/jpeg,image/png,video/mp4,video/quicktime" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        {file && <p className="mt-2 flex items-center gap-1 text-xs text-slate-500">{isVideo ? <Video className="h-3 w-3" /> : <ImageIcon className="h-3 w-3" />}{file.name}</p>}
      </div>
      <div className="flex flex-col gap-4">
        <div className="rounded-xl border border-violet-200 bg-violet-50 p-3">
          <input value={hint} onChange={(e) => setHint(e.target.value)} placeholder="Indication pour l’IA (facultatif) : ex. promo rentrée, présentation du site…" className="w-full rounded-lg border border-violet-200 bg-white p-2 text-sm" />
          <button onClick={writeWithAI} disabled={writing || !file} className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50">
            {writing ? <Loader className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{writing ? 'L’IA regarde votre fichier…' : `Créer le texte à partir de ${isVideo ? 'la vidéo' : 'la photo'}`}
          </button>
        </div>
        <label className="text-sm font-medium text-slate-700">Texte du post
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm font-normal" />
          <LinkPreview text={body} />
        </label>
        <label className="text-sm font-medium text-slate-700">Public
          <select value={audience} onChange={(e) => setAudience(e.target.value as any)} className="mt-1 w-full rounded-xl border border-slate-200 p-2 font-normal">
            <option value="all">Tout le monde</option><option value="client">Clients</option><option value="mover">Déménageurs</option>
          </select>
        </label>
        <PlatformPick value={platforms} onChange={setPlatforms} label="Publier sur :" />
        <p className="text-xs text-slate-500">« Archiver » garde le post de côté : publiez-le plus tard depuis « Tous les posts ».</p>
        <div className="mt-auto grid grid-cols-2 gap-2">
          <button onClick={() => submit(false)} disabled={busy} className="flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            <Archive className="h-4 w-4" />Archiver pour plus tard
          </button>
          <button onClick={() => submit(true)} disabled={busy || !platforms.length} className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-emerald-500 px-4 py-3 font-semibold text-white disabled:opacity-50">
            {busy ? <Loader className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}Publier maintenant
          </button>
        </div>
      </div>
    </div>
  );
}

function StatsPanel({ posts, pubs }: { posts: Post[]; pubs: Pub[] }) {
  const by = (pl: string) => pubs.filter((p) => p.platform === pl);
  const rows = posts.map((p) => {
    const ps = pubs.filter((x) => x.target_id === p.id);
    return { p, n: ps.length, views: sum(ps, 'views'), clicks: sum(ps, 'clicks'), likes: sum(ps, 'likes'), comments: sum(ps, 'comments'), shares: sum(ps, 'shares') };
  }).filter((r) => r.n).sort((a, b) => b.views + b.likes * 5 - (a.views + a.likes * 5));
  const igErr = pubs.find((p) => p.platform === 'instagram' && p.stats_error)?.stats_error;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        {(['facebook', 'instagram'] as const).map((pl) => {
          const ps = by(pl);
          return (
            <div key={pl} className="rounded-2xl bg-white p-5 shadow-md">
              <div className="mb-3 flex items-center gap-2 font-semibold">{pl === 'facebook' ? <Facebook className="h-5 w-5 text-blue-600" /> : <Instagram className="h-5 w-5 text-pink-600" />}{pl === 'facebook' ? 'Facebook' : 'Instagram'} · {ps.length} publication(s)</div>
              <div className="grid grid-cols-5 gap-2 text-center">
                {([['Vues', 'views'], ['Clics', 'clicks'], ["J'aime", 'likes'], ['Comm.', 'comments'], ['Partages', 'shares']] as const).map(([l, k]) => (
                  <div key={k} className="rounded-xl bg-slate-50 p-2"><div className="text-lg font-bold">{sum(ps, k)}</div><div className="text-xs text-slate-500">{l}</div></div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {igErr && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Les vues Instagram s'afficheront quand l'autorisation « instagram_manage_insights » sera ajoutée à l'application Meta (après la validation de votre entreprise). Les « j'aime » et commentaires sont déjà comptés.</p>}
      <div className="overflow-x-auto rounded-2xl bg-white shadow-md">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr><th className="p-3">Post</th><th className="p-3">Type</th><th className="p-3 text-right">Vues</th><th className="p-3 text-right">Clics</th><th className="p-3 text-right">J'aime</th><th className="p-3 text-right">Comm.</th><th className="p-3 text-right">Partages</th></tr>
          </thead>
          <tbody>
            {rows.map(({ p, ...r }) => (
              <tr key={p.id} className="border-t border-slate-100">
                <td className="max-w-xs truncate p-3">{p.title || p.body.split('\n')[0]}</td>
                <td className="p-3 text-xs text-slate-500">{KIND_LABEL[p.kind] ?? p.kind}</td>
                <td className="p-3 text-right">{r.views}</td><td className="p-3 text-right">{r.clicks}</td><td className="p-3 text-right">{r.likes}</td><td className="p-3 text-right">{r.comments}</td><td className="p-3 text-right">{r.shares}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={7} className="p-8 text-center text-slate-500">Les statistiques apparaîtront après le prochain passage de l'agent.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function VoicePanel() {
  const [dict, setDict] = useState<{ id: string; word: string; spoken: string }[]>([]);
  const [word, setWord] = useState(''); const [spoken, setSpoken] = useState('');
  const [voice, setVoice] = useState('nova'); const [instr, setInstr] = useState('');
  const load = async () => {
    const [d, s] = await Promise.all([
      supabase.from('social_pronunciations').select('*').order('word'),
      supabase.from('social_studio_settings').select('*').eq('id', 1).maybeSingle(),
    ]);
    setDict((d.data as any) ?? []);
    if (s.data) { setVoice((s.data as any).voice); setInstr((s.data as any).voice_instructions); }
  };
  useEffect(() => { load(); }, []);
  const add = async () => {
    if (!word.trim() || !spoken.trim()) return;
    const { error } = await supabase.from('social_pronunciations').upsert({ word: word.trim(), spoken: spoken.trim() }, { onConflict: 'word' });
    if (error) return showToast(error.message, 'error');
    setWord(''); setSpoken(''); load();
  };
  const del = async (id: string) => { await supabase.from('social_pronunciations').delete().eq('id', id); load(); };
  const saveVoice = async () => {
    const { error } = await supabase.from('social_studio_settings').update({ voice, voice_instructions: instr, updated_at: new Date().toISOString() }).eq('id', 1);
    showToast(error ? error.message : 'Voix enregistrée pour les prochaines vidéos.', error ? 'error' : 'success');
  };
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="rounded-2xl bg-white p-6 shadow-md">
        <h3 className="mb-1 flex items-center gap-2 font-bold"><BookA className="h-5 w-5 text-blue-600" />Dictionnaire de prononciation</h3>
        <p className="mb-4 text-sm text-slate-500">Quand la voix prononce mal un mot, écrivez ici comment il doit sonner. C'est appliqué à toutes les prochaines vidéos (et quand vous refaites une voix off).</p>
        <div className="mb-4 flex gap-2">
          <input value={word} onChange={(e) => setWord(e.target.value)} placeholder="Mot écrit (ex. KBIS)" className="w-1/2 rounded-xl border border-slate-200 p-2 text-sm" />
          <input value={spoken} onChange={(e) => setSpoken(e.target.value)} placeholder="Se prononce (ex. ka-biss)" className="w-1/2 rounded-xl border border-slate-200 p-2 text-sm" />
          <button onClick={add} className="rounded-xl bg-blue-600 px-3 text-white"><Plus className="h-4 w-4" /></button>
        </div>
        <ul className="divide-y divide-slate-100">
          {dict.map((d) => (
            <li key={d.id} className="flex items-center justify-between py-2 text-sm">
              <span><b>{d.word}</b> → <span className="text-slate-600">{d.spoken}</span></span>
              <button onClick={() => del(d.id)} className="text-slate-400 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-2xl bg-white p-6 shadow-md">
        <h3 className="mb-1 flex items-center gap-2 font-bold"><Mic className="h-5 w-5 text-emerald-600" />Voix des vidéos</h3>
        <p className="mb-4 text-sm text-slate-500">Choisissez la voix et le ton utilisés pour les Reels.</p>
        <label className="text-sm font-medium">Voix
          <select value={voice} onChange={(e) => setVoice(e.target.value)} className="mt-1 mb-4 w-full rounded-xl border border-slate-200 p-2 font-normal">
            {VOICES.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium">Consignes de ton
          <textarea value={instr} onChange={(e) => setInstr(e.target.value)} rows={4} className="mt-1 w-full rounded-xl border border-slate-200 p-2 text-sm font-normal" />
        </label>
        <button onClick={saveVoice} className="mt-4 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">Enregistrer</button>
      </div>
    </div>
  );
}

function LinkPreview({ text }: { text: string }) {
  const fixed = text.replace(/(?<!https:\/\/)www\.trouvetondemenageur\.fr/g, 'https://www.trouvetondemenageur.fr');
  const parts = fixed.split(/(https?:\/\/[^\s]+)/g);
  return (
    <div className="mt-2 rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm font-normal text-slate-700">
      <div className="mb-1 text-xs font-semibold text-slate-500">Aperçu du post (le lien sera cliquable sur Facebook)</div>
      <div className="whitespace-pre-wrap">{parts.map((p, i) => /^https?:\/\//.test(p)
        ? <a key={i} href={p} target="_blank" rel="noreferrer" className="font-medium text-blue-600 underline">{p.replace(/^https:\/\//, '')}</a>
        : <span key={i}>{p}</span>)}</div>
    </div>
  );
}
