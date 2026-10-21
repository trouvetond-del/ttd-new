import { useEffect, useRef, useState } from 'react';
import { Bot, Send, Loader, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

type Msg = { role: 'user' | 'assistant'; content: string };
const KEY = 'ttd-studio-agent-chat';
const IDEAS = [
  'Fais-moi une vidéo pour les déménageurs sur les retours à vide',
  'Écris un post client sur le check-up photo avant déménagement',
  'Quels sont mes posts qui marchent le mieux ?',
  'Raccourcis le texte de mon dernier article',
];

export default function StudioAgentChat({ onChanged }: { onChanged: () => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { try { setMsgs(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch { /* vide */ } box.current?.focus(); }, []);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, busy]);
  const save = (m: Msg[]) => { setMsgs(m); localStorage.setItem(KEY, JSON.stringify(m.slice(-60))); };

  const send = async (value = text) => {
    const v = value.trim();
    if (!v || busy) return;
    const next = [...msgs, { role: 'user' as const, content: v }];
    save(next); setText(''); setBusy(true);
    const { data, error } = await supabase.functions.invoke('studio-agent', { body: { messages: next } });
    let reply: string;
    if (error) {
      let detail = error.message;
      try { detail = (await (error as any).context?.json())?.error ?? detail; } catch { /* rien */ }
      reply = `⚠️ ${detail}`;
    } else {
      reply = data?.reply ?? '…';
      if (data?.created?.length) {
        reply += '\n\n' + data.created.map((c: any) => `✅ ${c.kind} « ${c.title} » rangé en « À publier plus tard »`).join('\n');
        onChanged();
      }
    }
    save([...next, { role: 'assistant', content: reply }]);
    setBusy(false);
    setTimeout(() => box.current?.focus(), 0);
  };

  return (
    <div className="flex h-[70vh] flex-col overflow-hidden rounded-2xl bg-white shadow-md ring-1 ring-slate-100">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-gradient-to-br from-blue-600 to-emerald-500 p-2 text-white"><Bot className="h-5 w-5" /></div>
          <div>
            <p className="font-semibold text-slate-900">Agent marketing</p>
            <p className="text-xs text-slate-500">Donne-lui un travail : il crée en brouillon, tu publies toi-même.</p>
          </div>
        </div>
        {msgs.length > 0 && (
          <button onClick={() => save([])} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-100">
            <Trash2 className="h-3.5 w-3.5" /> Nouvelle discussion
          </button>
        )}
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50 p-5">
        {!msgs.length && (
          <div className="grid gap-2 md:grid-cols-2">
            {IDEAS.map((i) => (
              <button key={i} onClick={() => send(i)} className="rounded-xl bg-white p-3 text-left text-sm text-slate-700 shadow-sm ring-1 ring-slate-100 hover:ring-blue-300">{i}</button>
            ))}
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] whitespace-pre-line rounded-2xl px-4 py-2 text-sm ${m.role === 'user' ? 'bg-blue-600 text-white' : 'bg-white text-slate-800 shadow-sm ring-1 ring-slate-100'}`}>{m.content}</div>
          </div>
        ))}
        {busy && <div className="flex items-center gap-2 text-sm text-slate-500"><Loader className="h-4 w-4 animate-spin" /> L'agent travaille… (une photo prend jusqu'à 1 minute)</div>}
        <div ref={end} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex items-end gap-2 border-t border-slate-100 p-3">
        <textarea ref={box} value={text} onChange={(e) => setText(e.target.value)} rows={2}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Ex : fais une vidéo client sur la casse de vaisselle…" className="flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none" />
        <button type="submit" disabled={busy || !text.trim()} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-blue-600 to-emerald-500 text-white disabled:opacity-40">
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
