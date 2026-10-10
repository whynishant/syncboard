import { useEffect, useState } from 'react';
import { ArrowRight, Check, CircleHelp, Command, Globe2, Layers3, Link2, LockKeyhole, MousePointer2, Pencil, Plus, Shapes, Sparkles, Users, Zap } from 'lucide-react';
import { Board } from './Board';
import { serverUrl } from '../lib/socket';

export default function App() {
  const [path, setPath] = useState(window.location.pathname);
  const [name, setName] = useState(() => sessionStorage.getItem('syncboard-name') || 'Nishant');
  const [roomCode, setRoomCode] = useState('');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  useEffect(() => { const fn = () => setPath(window.location.pathname); window.addEventListener('popstate', fn); return () => window.removeEventListener('popstate', fn); }, []);
  const match = path.match(/^\/board\/([A-Za-z0-9_-]{6,16})\/?$/);
  const navigate = (next: string) => { window.history.pushState({}, '', next); setPath(next); };
  const create = async () => {
    if (!name.trim()) { setError('Please enter a display name.'); return; }
    setCreating(true); setError('');
    try { const r = await fetch(`${serverUrl}/api/rooms`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Untitled board' }) }); const data = await r.json(); if (!r.ok) throw new Error(data.error || 'Could not create board'); sessionStorage.setItem('syncboard-name', name.trim()); navigate(`/board/${data.id}`); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not connect to SyncBoard server.'); }
    finally { setCreating(false); }
  };
  const join = async () => {
    if (!name.trim()) { setError('Please enter a display name.'); return; }
    if (!/^[A-Za-z0-9_-]{6,16}$/.test(roomCode.trim())) { setError('Enter a valid room code (6–16 letters or numbers).'); return; }
    setCreating(true); setError('');
    try { const r = await fetch(`${serverUrl}/api/rooms/${roomCode.trim()}`); const data = await r.json(); if (!r.ok) throw new Error(data.error || 'Room not found'); sessionStorage.setItem('syncboard-name', name.trim()); navigate(`/board/${data.id}`); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to join room.'); }
    finally { setCreating(false); }
  };
  if (match) return <Board key={match[1]} code={match[1]} name={name || sessionStorage.getItem('syncboard-name') || 'Guest'} onLeave={() => navigate('/')} onNameChange={setName} />;
  return <main className="landing min-h-screen overflow-hidden">
    <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 md:px-10"><a className="brand flex items-center gap-2" href="/" onClick={e => { e.preventDefault(); navigate('/'); }}><span className="brand-mark"><Layers3 size={21}/></span><span>syncboard<span className="brand-dot">.</span></span></a><div className="hidden items-center gap-6 text-sm text-slate-500 md:flex"><span className="flex items-center gap-2"><span className="live-dot"/> Real-time collaboration</span><span className="flex items-center gap-1"><LockKeyhole size={14}/> Private by room</span></div><a className="top-link" href="#start">Get started <ArrowRight size={15}/></a></nav>
    <section className="hero mx-auto grid max-w-7xl items-center gap-12 px-5 pb-20 pt-10 md:grid-cols-2 md:px-10 md:pb-28 md:pt-20">
      <div className="relative z-10"><div className="eyebrow"><Sparkles size={14}/> YOUR TEAM'S SHARED THINKING SPACE</div><h1>Good ideas get<br/>better <span>together.</span></h1><p className="hero-copy">Sketch a thought, map out a system, or untangle a big idea. SyncBoard is your shared canvas for making sense of things — together, in real time.</p>
        <div id="start" className="start-card"><label htmlFor="display-name">YOUR DISPLAY NAME</label><input id="display-name" value={name} maxLength={32} onChange={e => setName(e.target.value)} placeholder="What should we call you?" onKeyDown={e => e.key === 'Enter' && void create()}/><button className="primary-btn" onClick={() => void create()} disabled={creating}>{creating ? 'Creating board…' : <><Plus size={18}/> Create a new board <ArrowRight size={17}/></>}</button><div className="or-line"><span/> or join an existing board <span/></div><div className="join-row"><input aria-label="Room code" value={roomCode} onChange={e => setRoomCode(e.target.value.toUpperCase())} placeholder="Paste a room code" maxLength={16} onKeyDown={e => e.key === 'Enter' && void join()}/><button className="join-btn" onClick={() => void join()} disabled={creating}>Join board <ArrowRight size={15}/></button></div>{error && <p role="alert" className="error-text">{error}</p>}<p className="privacy-note"><LockKeyhole size={13}/> No account needed. Just bring your ideas.</p></div>
      </div>
      <div className="preview-wrap" aria-label="Illustration of a collaborative diagram"><div className="preview-glow"/><div className="preview-board"><div className="preview-top"><span className="preview-file"><span className="tiny-icon"><Layers3 size={12}/></span> Product brainstorm <span className="saved">Saved</span></span><div className="avatar-stack"><i>N</i><i>M</i><i>A</i><b>+2</b></div></div><div className="preview-canvas"><div className="mini-grid"/><svg className="connector-svg" viewBox="0 0 520 380" preserveAspectRatio="none"><path d="M260 110 V148 H126 V183 M260 148 H392 V183 M126 254 V285 H260 V302 M392 254 V285 H260" fill="none" stroke="#9ba4b7" strokeWidth="1.7" strokeDasharray="4 4"/><path d="M121 177 l5 7 5 -7 M387 177 l5 7 5 -7 M255 296 l5 6 5 -6" fill="none" stroke="#9ba4b7" strokeWidth="1.7"/></svg><div className="diagram-node center-node"><span className="node-icon purple"><Sparkles size={15}/></span><b>Big idea</b><small>Start with why</small></div><div className="diagram-node left-node"><span className="node-icon peach"><Users size={14}/></span><b>People</b><small>Who is it for?</small></div><div className="diagram-node right-node"><span className="node-icon mint"><Zap size={14}/></span><b>Possibilities</b><small>What could be?</small></div><div className="diagram-node bottom-node"><span className="node-icon yellow"><Check size={14}/></span><b>Next steps</b><small>Make it happen</small></div><div className="remote-cursor cursor-one"><MousePointer2 size={19} fill="#6657e8"/><span>you</span></div><div className="remote-cursor cursor-two"><MousePointer2 size={19} fill="#e56b93"/><span>maya</span></div><div className="note-card">“Keep it simple ✨”<span>— Maya</span></div></div><div className="preview-bottom"><span><span className="live-dot"/> 5 people collaborating</span><span><Command size={12}/> K <span className="shortcut">Shortcuts</span></span></div></div><div className="float-pill float-one"><span className="float-icon"><Pencil size={15}/></span> Ideas in motion</div><div className="float-pill float-two"><span className="float-icon green"><Globe2 size={15}/></span> Always in sync</div></div>
    </section>
    <section className="feature-strip mx-auto grid max-w-7xl gap-5 border-t border-slate-200/80 px-5 py-8 md:grid-cols-3 md:px-10"><div className="feature"><span className="feature-icon violet"><Users size={18}/></span><div><b>Think out loud</b><p>See teammates' cursors and ideas as they happen.</p></div></div><div className="feature"><span className="feature-icon amber"><Shapes size={18}/></span><div><b>Make it make sense</b><p>From quick sketches to clear diagrams, all on one canvas.</p></div></div><div className="feature"><span className="feature-icon blue"><Link2 size={18}/></span><div><b>Share in a click</b><p>Invite anyone with a room link. No signup required.</p></div></div></section>
    <footer className="mx-auto flex max-w-7xl items-center justify-between px-5 py-6 text-xs text-slate-400 md:px-10"><span>© 2026 SyncBoard · Made for shared thinking</span><span className="flex items-center gap-1"><CircleHelp size={13}/> Simple by design</span></footer>
  </main>;
}
