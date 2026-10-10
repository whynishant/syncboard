import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowLeft, ArrowRight, Check, ChevronDown, Circle, Copy, Download, Eraser, Grid2X2, Hand, Link2, LoaderCircle, LockKeyhole, Minus, MousePointer2, Pencil, Plus, RectangleHorizontal, Redo2, RotateCcw, Share2, StickyNote, Type, Users, X } from 'lucide-react';
import { Canvas, Rect, Ellipse, Line, IText, PencilBrush, FabricObject, Group, Triangle, util } from 'fabric';
import { socket } from '../lib/socket';
import type { Participant, RoomPayload, ShapeOperation, Tool } from '../types';

type Props = { code: string; name: string; onLeave: () => void; onNameChange: (name: string) => void };
type Cursor = Participant & { x: number; y: number };
type RemoteStroke = { id: string; color: string; points: number[][] };
const uid = () => crypto.randomUUID();
(FabricObject as typeof FabricObject & { customProperties: string[] }).customProperties = ['syncId', 'syncVersion'];
const safeObject = (obj: FabricObject) => obj.toObject(['syncId', 'syncVersion']) as Record<string, unknown>;

export function Board({ code, name, onLeave }: Props) {
  const canvasEl = useRef<HTMLCanvasElement>(null);
  const containerEl = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<Canvas | null>(null);
  const roomRef = useRef<RoomPayload | null>(null);
  const readOnlyRef = useRef(false);
  const versions = useRef(new Map<string, number>());
  const suppress = useRef(false);
  const strokePoints = useRef<number[][]>([]);
  const currentTool = useRef<Tool>('select');
  const colorRef = useRef('#6657e8');
  const fillRef = useRef('#ffffff');
  const widthRef = useRef(3);
  const [tool, setTool] = useState<Tool>('select');
  const [stroke, setStroke] = useState('#6657e8');
  const [fill, setFill] = useState('#ffffff');
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [room, setRoom] = useState<RoomPayload | null>(null);
  const [self, setSelf] = useState<Participant | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [cursors, setCursors] = useState<Cursor[]>([]);
  const [remoteStrokes, setRemoteStrokes] = useState<RemoteStroke[]>([]);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'reconnecting' | 'offline'>('connecting');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [shareOpen, setShareOpen] = useState(false);
  const [grid, setGrid] = useState(true);
  const [background, setBackground] = useState('#fbfcff');
  const [zoom, setZoom] = useState(100);
  const [boardName, setBoardName] = useState('Untitled board');
  const [nameOpen, setNameOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState(name);
  const [confirmClear, setConfirmClear] = useState(false);
  const [, setHistoryTick] = useState(0);
  const undoStack = useRef<string[]>([]);
  const redoStack = useRef<string[]>([]);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const readOnly = !!room?.readOnly;

  const notify = useCallback((message: string) => { setToast(message); window.setTimeout(() => setToast(''), 2600); }, []);
  const sendOperation = useCallback((obj: FabricObject, kind: ShapeOperation['kind']) => {
    if (suppress.current || !socket.connected || !roomRef.current || readOnlyRef.current) return;
    const target = obj as FabricObject & { syncId?: string; syncVersion?: number };
    if (!target.syncId) target.syncId = uid();
    const nextVersion = Math.max(versions.current.get(target.syncId) ?? 0, target.syncVersion ?? 0) + 1;
    target.syncVersion = nextVersion; versions.current.set(target.syncId, nextVersion);
    setSaveStatus('saving');
    const op: ShapeOperation = { id: uid(), clientOpId: uid(), objectId: target.syncId, kind, version: nextVersion, ...(kind !== 'delete' ? { payload: safeObject(obj) } : {}) };
    socket.emit('shape:operation', op, (result: { ok?: boolean; error?: string }) => { if (result?.ok) setSaveStatus('saved'); else { setSaveStatus('error'); if (result?.error) notify(result.error); } });
  }, [notify]);

  const addShape = useCallback((obj: FabricObject) => {
    const canvas = canvasRef.current; if (!canvas || readOnlyRef.current) return;
    (obj as FabricObject & { syncId?: string; syncVersion?: number }).syncId = uid();
    canvas.add(obj); canvas.setActiveObject(obj); canvas.requestRenderAll();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas || !containerEl.current) return;
    const resize = () => { const rect = containerEl.current?.getBoundingClientRect(); if (!rect) return; canvas.setDimensions({ width: Math.max(300, rect.width), height: Math.max(300, rect.height) }); canvas.requestRenderAll(); };
    resize(); const observer = new ResizeObserver(resize); observer.observe(containerEl.current); return () => observer.disconnect();
  }, [loading]);

  useEffect(() => {
    if (!canvasEl.current) return;
    const canvas = new Canvas(canvasEl.current, { width: 1200, height: 800, backgroundColor: background, selection: true, preserveObjectStacking: true, fireRightClick: true, stopContextMenu: true });
    canvasRef.current = canvas;
    canvas.freeDrawingBrush = new PencilBrush(canvas); canvas.freeDrawingBrush.width = strokeWidth; canvas.freeDrawingBrush.color = stroke;
    const onAdded = (e: { target?: FabricObject }) => { if (!e.target || suppress.current) return; const o = e.target as FabricObject & { syncId?: string }; if (!o.syncId) o.syncId = uid(); sendOperation(o, 'create'); };
    const onModified = (e: { target?: FabricObject }) => { if (e.target) sendOperation(e.target, 'update'); };
    const onRemoved = (e: { target?: FabricObject }) => { if (e.target) sendOperation(e.target, 'delete'); };
    const onPath = (e: { path?: FabricObject }) => { if (e.path) { (e.path as FabricObject & { syncId?: string }).syncId = uid(); sendOperation(e.path, 'create'); } };
    canvas.on('object:added', onAdded); canvas.on('object:modified', onModified); canvas.on('object:removed', onRemoved); canvas.on('path:created', onPath);
    let drawingShape: FabricObject | null = null; let origin: { x: number; y: number } | null = null;
    const down = (opt: { e: Event }) => {
      const active = currentTool.current; const pointer = canvas.getPointer(opt.e as MouseEvent);
      if (active === 'draw') { strokePoints.current = [[pointer.x, pointer.y]]; if (socket.connected) socket.volatile.emit('stroke:start', { strokeId: uid(), x: pointer.x, y: pointer.y, color: colorRef.current }); return; }
      if (active === 'eraser') { const target = canvas.findTarget(opt.e as MouseEvent); if (target) canvas.remove(target); return; }
      if (active === 'rect' || active === 'ellipse' || active === 'line' || active === 'arrow') {
        origin = pointer;
        drawingShape = active === 'rect' ? new Rect({ left: pointer.x, top: pointer.y, width: 1, height: 1, fill: fillRef.current, stroke: colorRef.current, strokeWidth: widthRef.current, rx: 2, ry: 2 }) : active === 'ellipse' ? new Ellipse({ left: pointer.x, top: pointer.y, rx: 1, ry: 1, fill: fillRef.current, stroke: colorRef.current, strokeWidth: widthRef.current }) : new Line([pointer.x, pointer.y, pointer.x, pointer.y], { stroke: colorRef.current, strokeWidth: widthRef.current, selectable: false });
        canvas.add(drawingShape); return;
      }
      if (active === 'text') { const text = new IText('Type something…', { left: pointer.x, top: pointer.y, fontSize: 22, fill: colorRef.current, fontFamily: 'Inter, Arial, sans-serif', editable: true }); addShape(text); setTool('select'); currentTool.current = 'select'; canvas.isDrawingMode = false; setTimeout(() => text.enterEditing(), 30); }
      if (active === 'sticky') { const note = new Rect({ left: pointer.x, top: pointer.y, width: 180, height: 135, fill: '#fff2ad', stroke: '#f2d879', strokeWidth: 1 }); const label = new IText('Double-click to edit', { left: pointer.x + 12, top: pointer.y + 12, width: 156, fontSize: 16, fill: '#4c4324', fontFamily: 'Inter, Arial, sans-serif' }); addShape(note); addShape(label); setTool('select'); currentTool.current = 'select'; }
    };
    const move = (opt: { e: Event }) => { const pointer = canvas.getPointer(opt.e as MouseEvent); if (currentTool.current === 'draw' && strokePoints.current.length) { strokePoints.current.push([pointer.x, pointer.y]); if (socket.connected && strokePoints.current.length % 4 === 0) socket.volatile.emit('stroke:points', { points: strokePoints.current }); }
      if (!origin || !drawingShape) return;
      const active = currentTool.current; if (active === 'rect') { const rect = drawingShape as Rect; rect.set({ left: Math.min(origin.x, pointer.x), top: Math.min(origin.y, pointer.y), width: Math.abs(pointer.x - origin.x), height: Math.abs(pointer.y - origin.y) }); }
      else if (active === 'ellipse') { const el = drawingShape as Ellipse; el.set({ left: Math.min(origin.x, pointer.x), top: Math.min(origin.y, pointer.y), rx: Math.abs(pointer.x - origin.x) / 2, ry: Math.abs(pointer.y - origin.y) / 2 }); }
      else { (drawingShape as Line).set({ x1: origin.x, y1: origin.y, x2: pointer.x, y2: pointer.y }); }
      canvas.requestRenderAll();
    };
    const up = () => { if (drawingShape) { (drawingShape as FabricObject & { syncId?: string }).syncId = uid(); drawingShape.set({ selectable: true, evented: true }); if (currentTool.current === 'arrow' && drawingShape instanceof Line) { const line = drawingShape; const x1 = line.x1 ?? 0; const y1 = line.y1 ?? 0; const x2 = line.x2 ?? 0; const y2 = line.y2 ?? 0; const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI + 90; const head = new Triangle({ left: x2, top: y2, width: 12, height: 12, originX: 'center', originY: 'center', angle, fill: colorRef.current, stroke: colorRef.current, strokeWidth: 1 }); canvas.remove(line); const arrow = new Group([line, head], { selectable: true, evented: true }); (arrow as FabricObject & { syncId?: string }).syncId = uid(); drawingShape = arrow; canvas.add(arrow); }
        sendOperation(drawingShape, 'create'); drawingShape = null; origin = null; }
      if (currentTool.current === 'draw') { if (socket.connected) socket.volatile.emit('stroke:end', {}); strokePoints.current = []; }
      canvas.requestRenderAll();
    };
    canvas.on('mouse:down', down); canvas.on('mouse:move', move); canvas.on('mouse:up', up);
    let lastCursorSent = 0;
    const cursorMove = (ev: MouseEvent) => { const now = Date.now(); if (now - lastCursorSent < 30) return; lastCursorSent = now; const rect = canvas.getElement().getBoundingClientRect(); if (socket.connected) socket.volatile.emit('cursor:move', { x: ev.clientX - rect.left, y: ev.clientY - rect.top }); };
    canvas.getElement().addEventListener('mousemove', cursorMove);
    const joinRoom = () => { setStatus('connecting'); socket.emit('room:join', { code, name: (sessionStorage.getItem('syncboard-name') || name || 'Guest').trim().slice(0, 32) || 'Guest' }, async (result: { ok: boolean; error?: string; room?: RoomPayload; self?: Participant; peers?: Participant[] }) => {
      if (!result?.ok || !result.room) { setError(result?.error || 'Could not join this board'); setLoading(false); setStatus('offline'); return; }
      setRoom(result.room); setBoardName(result.room.name); setSelf(result.self || null); setParticipants(result.peers || []); setBackground(result.room.snapshot.settings?.background || '#fbfcff'); setGrid(result.room.snapshot.settings?.grid ?? true); canvas.backgroundColor = result.room.snapshot.settings?.background || '#fbfcff';
      const objects = Object.values(result.room.snapshot.objects || {});
      if (objects.length) { suppress.current = true; try { const hydrated = await util.enlivenObjects(objects as never[]); canvas.add(...hydrated as FabricObject[]); for (const obj of hydrated as FabricObject[]) { const x = obj as FabricObject & { syncId?: string; syncVersion?: number }; if (x.syncId) versions.current.set(x.syncId, x.syncVersion || 1); } } catch (e) { console.error('Could not restore board snapshot', e); } finally { suppress.current = false; } }
      canvas.requestRenderAll(); setLoading(false); setStatus('connected');
    }); };
    const onConnect = () => { setStatus('connected'); joinRoom(); };
    const onDisconnect = () => setStatus('reconnecting');
    const onConnectError = () => setStatus('offline');
    const onPresenceJoin = (p: Participant) => setParticipants(old => old.some(x => x.id === p.id) ? old : [...old, p]);
    const onPresenceLeave = (p: { socketId: string }) => { setParticipants(old => old.filter(x => x.id !== p.socketId)); setCursors(old => old.filter(x => x.id !== p.socketId)); setRemoteStrokes([]); };
    const onCursor = (p: Cursor) => setCursors(old => [...old.filter(x => x.id !== p.id), p]);
    const onOperation = async (op: ShapeOperation) => { if (!op?.objectId || !op.kind) return; const version = versions.current.get(op.objectId) || 0; if (op.version <= version) return; versions.current.set(op.objectId, op.version); suppress.current = true; try { const existing = canvas.getObjects().find(o => (o as FabricObject & { syncId?: string }).syncId === op.objectId); if (op.kind === 'delete') { if (existing) canvas.remove(existing); } else if (op.payload) { const hydrated = await util.enlivenObjects([op.payload] as never[]); const obj = hydrated[0] as FabricObject & { syncId?: string; syncVersion?: number }; if (obj) { obj.syncId = op.objectId; obj.syncVersion = op.version; if (existing) canvas.remove(existing); canvas.add(obj); } } canvas.requestRenderAll(); } catch (e) { console.error('Could not apply remote operation', e); } finally { suppress.current = false; } };
    const onSettings = (settings: { background: string; grid: boolean }) => { setBackground(settings.background); setGrid(settings.grid); canvas.backgroundColor = settings.background; canvas.requestRenderAll(); };
    const onStrokeStart = (p: { strokeId: string; x: number; y: number; color: string; userId: string }) => setRemoteStrokes(old => [...old.filter(s => s.id !== p.strokeId), { id: p.strokeId, color: p.color, points: [[p.x, p.y]] }]);
    const onStrokePoints = (p: { strokeId: string; points: number[][] }) => setRemoteStrokes(old => old.map(s => s.id === p.strokeId ? { ...s, points: p.points.slice(-2000) } : s));
    const onStrokeEnd = (p: { strokeId?: string }) => { if (p.strokeId) setRemoteStrokes(old => old.filter(s => s.id !== p.strokeId)); else setRemoteStrokes([]); };
    socket.on('connect', onConnect); socket.on('disconnect', onDisconnect); socket.on('connect_error', onConnectError); socket.on('presence:join', onPresenceJoin); socket.on('presence:leave', onPresenceLeave); socket.on('cursor:move', onCursor); socket.on('shape:operation', onOperation); socket.on('board:settings', onSettings); socket.on('stroke:start', onStrokeStart); socket.on('stroke:points', onStrokePoints); socket.on('stroke:end', onStrokeEnd);
    if (!socket.connected) socket.connect(); else joinRoom();
    return () => { socket.off('connect', onConnect); socket.off('disconnect', onDisconnect); socket.off('connect_error', onConnectError); socket.off('presence:join', onPresenceJoin); socket.off('presence:leave', onPresenceLeave); socket.off('cursor:move', onCursor); socket.off('shape:operation', onOperation); socket.off('board:settings', onSettings); socket.off('stroke:start', onStrokeStart); socket.off('stroke:points', onStrokePoints); socket.off('stroke:end', onStrokeEnd); socket.emit('room:leave', { code }); canvas.getElement().removeEventListener('mousemove', cursorMove); canvas.dispose(); canvasRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  useEffect(() => { currentTool.current = tool; const c = canvasRef.current; if (!c) return; c.isDrawingMode = tool === 'draw'; c.selection = tool === 'select'; c.defaultCursor = tool === 'select' ? 'default' : tool === 'eraser' ? 'not-allowed' : 'crosshair'; if (c.freeDrawingBrush) { c.freeDrawingBrush.color = stroke; c.freeDrawingBrush.width = strokeWidth; } c.getObjects().forEach(o => { o.selectable = tool === 'select'; o.evented = tool === 'select' || tool === 'eraser'; }); c.requestRenderAll(); }, [tool, stroke, strokeWidth]);
  useEffect(() => { roomRef.current = room; readOnlyRef.current = readOnly; }, [room, readOnly]);
  useEffect(() => { colorRef.current = stroke; fillRef.current = fill; widthRef.current = strokeWidth; }, [stroke, fill, strokeWidth]);
  useEffect(() => { const c = canvasRef.current; if (!c) return; c.backgroundColor = background; c.requestRenderAll(); }, [background]);
  useEffect(() => { const c = canvasRef.current; if (!c) return; c.setZoom(zoom / 100); c.requestRenderAll(); }, [zoom]);
  useEffect(() => { const overlay = containerEl.current; if (!overlay || !grid) return; overlay.classList.add('grid-on'); return () => overlay?.classList.remove('grid-on'); }, [grid]);

  const chooseTool = (next: Tool) => { setTool(next); currentTool.current = next; };
  const deleteSelected = () => { const c = canvasRef.current; if (!c || readOnly) return; const active = c.getActiveObjects(); if (!active.length) return; c.discardActiveObject(); active.forEach(o => c.remove(o)); c.requestRenderAll(); };
  const duplicate = () => { 
    const c = canvasRef.current; 
    if (!c || readOnly) return; 
    const active = c.getActiveObject(); 
    if (!active) return; 
    void active.clone().then((copy: FabricObject) => { 
      copy.set({ left: (active.left || 0) + 20, top: (active.top || 0) + 20 }); 
      (copy as FabricObject & { syncId?: string }).syncId = uid(); 
      c.add(copy); 
      c.setActiveObject(copy); 
      c.requestRenderAll(); 
    }); 
  };
  const clearBoard = () => { const c = canvasRef.current; if (!c || readOnly) return; c.getObjects().slice().forEach(o => c.remove(o)); c.requestRenderAll(); setConfirmClear(false); notify('Board cleared'); };
  const exportFile = (format: 'png' | 'svg') => { const c = canvasRef.current; if (!c) return; const link = document.createElement('a'); link.download = `syncboard-${code}.${format}`; link.href = format === 'png' ? c.toDataURL({ format: 'png', multiplier: 2 }) : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(c.toSVG())}`; link.click(); notify(`Exported ${format.toUpperCase()}`); };
  const fit = () => { setZoom(100); const c = canvasRef.current; if (!c) return; c.setViewportTransform([1, 0, 0, 1, 0, 0]); c.requestRenderAll(); };
  const copyLink = async () => { try { await navigator.clipboard.writeText(window.location.href); notify('Invitation link copied'); } catch { notify('Copy failed — copy the address bar link instead'); } };
  const saveBoardName = () => { setBoardName(nameDraft.trim().slice(0, 120) || 'Untitled board'); setNameOpen(false); notify('Board title updated for this session'); };
  const tools = useMemo(() => [
    { id: 'select' as Tool, label: 'Select (V)', icon: MousePointer2 }, { id: 'draw' as Tool, label: 'Freehand (P)', icon: Pencil }, { id: 'rect' as Tool, label: 'Rectangle (R)', icon: RectangleHorizontal }, { id: 'ellipse' as Tool, label: 'Ellipse (O)', icon: Circle }, { id: 'line' as Tool, label: 'Line (L)', icon: Minus }, { id: 'arrow' as Tool, label: 'Arrow (A)', icon: ArrowRight }, { id: 'text' as Tool, label: 'Text (T)', icon: Type }, { id: 'sticky' as Tool, label: 'Sticky note (N)', icon: StickyNote }, { id: 'eraser' as Tool, label: 'Eraser (E)', icon: Eraser }
  ], []);
  useEffect(() => { const key = (e: KeyboardEvent) => { const target = e.target as HTMLElement; if (target.isContentEditable || ['INPUT', 'TEXTAREA'].includes(target.tagName)) return; if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; } if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicate(); return; } if (e.key === 'Delete' || e.key === 'Backspace') deleteSelected(); const map: Record<string, Tool> = { v: 'select', p: 'draw', r: 'rect', o: 'ellipse', l: 'line', a: 'arrow', t: 'text', n: 'sticky', e: 'eraser' }; if (map[e.key.toLowerCase()]) chooseTool(map[e.key.toLowerCase()]!); }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key); });
  const snapshot = () => { const c = canvasRef.current; if (!c) return; undoStack.current.push(JSON.stringify(c.toObject(['syncId', 'syncVersion']))); if (undoStack.current.length > 40) undoStack.current.shift(); redoStack.current = []; setHistoryTick(x => x + 1); };
  const restore = async (json: string) => { const c = canvasRef.current; if (!c) return; suppress.current = true; try { await c.loadFromJSON(JSON.parse(json)); c.requestRenderAll(); } finally { suppress.current = false; } };
  const undo = () => { if (undoStack.current.length < 2) { notify('Nothing to undo yet'); return; } const c = canvasRef.current; if (!c) return; const current = JSON.stringify(c.toObject(['syncId', 'syncVersion'])); redoStack.current.push(current); undoStack.current.pop(); void restore(undoStack.current[undoStack.current.length - 1]!); setHistoryTick(x => x + 1); notify('Undo applied locally'); };
  const redo = () => { const next = redoStack.current.pop(); if (!next) { notify('Nothing to redo'); return; } undoStack.current.push(next); void restore(next); setHistoryTick(x => x + 1); notify('Redo applied locally'); };
  useEffect(() => { const c = canvasRef.current; if (!c) return; const onChanged = () => snapshot(); c.on('object:modified', onChanged); c.on('object:added', onChanged); return () => { c.off('object:modified', onChanged); c.off('object:added', onChanged); }; }, []);

  return <div className="board-app">
    <header className="board-header"><button className="back-btn" aria-label="Leave board" onClick={onLeave}><ArrowLeft size={18}/></button><div className="board-brand"><span className="brand-mark small"><Layers3Icon/></span><div className="board-title-wrap"><button className="board-title" onClick={() => { setNameDraft(boardName); setNameOpen(true); }}>{boardName}<ChevronDown size={13}/></button><div className="board-meta"><span className={`status-dot ${status}`}/>{status === 'connected' ? 'All changes synced' : status === 'connecting' ? 'Connecting…' : status === 'reconnecting' ? 'Reconnecting…' : 'Offline'} <span className="meta-separator">·</span> {code}</div></div></div><div className="header-spacer"/><div className="header-participants" aria-label={`${participants.length + (self ? 1 : 0)} participants`}>{self && <span className="avatar self-avatar" style={{ background: self.color }} title={`${self.name} (you)`}>{self.name.slice(0, 1).toUpperCase()}</span>}{participants.slice(0, 3).map(p => <span className="avatar" key={p.id} style={{ background: p.color }} title={p.name}>{p.name.slice(0, 1).toUpperCase()}</span>)}<span className="participant-count"><Users size={13}/>{participants.length + (self ? 1 : 0)}</span></div><span className={`save-label ${saveStatus}`}>{saveStatus === 'saving' ? <LoaderCircle size={13} className="spin"/> : saveStatus === 'error' ? <X size={13}/> : <Check size={13}/>} {saveStatus === 'saving' ? 'Saving' : saveStatus === 'error' ? 'Not saved' : 'Saved'}</span><button className="share-btn" onClick={() => setShareOpen(true)}><Share2 size={15}/> <span>Share</span></button><button className="more-btn" aria-label="Export options" onClick={() => exportFile('png')}><Download size={17}/></button></header>
    <div className="workspace"><aside className="tool-rail" aria-label="Drawing tools">{tools.map(item => { const Icon = item.icon; return <button key={item.id} title={item.label} aria-label={item.label} className={`tool-btn ${tool === item.id ? 'active' : ''}`} onClick={() => chooseTool(item.id)} disabled={readOnly && item.id !== 'select'}><Icon size={19}/></button>; })}<div className="rail-divider"/><button className="tool-btn" title="Undo (Ctrl+Z)" aria-label="Undo" onClick={undo}><RotateCcw size={18}/></button><button className="tool-btn" title="Redo (Ctrl+Shift+Z)" aria-label="Redo" onClick={redo}><Redo2 size={18}/></button><button className="tool-btn" title="Duplicate selected (Ctrl+D)" aria-label="Duplicate selected" onClick={duplicate}><Copy size={18}/></button><button className="tool-btn danger-tool" title="Delete selected" aria-label="Delete selected" onClick={deleteSelected}><X size={18}/></button><div className="rail-bottom"><button className={`tool-btn ${grid ? 'active-soft' : ''}`} title="Toggle grid" aria-label="Toggle grid" onClick={() => { const next = !grid; setGrid(next); if (socket.connected) socket.emit('board:settings', { background, grid: next }); }}><Grid2X2 size={18}/></button><button className="tool-btn" title="Clear board" aria-label="Clear board" onClick={() => setConfirmClear(true)}><ArrowDownToLine size={18}/></button></div></aside>
      <main className="canvas-area"><div className="canvas-toolbar"><div className="tool-context"><span className="context-icon">{tools.find(t => t.id === tool)?.icon && (() => { const Icon = tools.find(t => t.id === tool)!.icon; return <Icon size={15}/>; })()}</span><span>{tools.find(t => t.id === tool)?.label.split(' (')[0]}</span>{tool !== 'select' && <span className="context-hint">Click and drag on canvas</span>}</div><div className="style-controls"><label className="color-control" title="Stroke color"><span className="control-caption">Stroke</span><input aria-label="Stroke color" type="color" value={stroke} onChange={e => setStroke(e.target.value)}/></label><label className="color-control" title="Fill color"><span className="control-caption">Fill</span><input aria-label="Fill color" type="color" value={fill} onChange={e => setFill(e.target.value)}/></label><label className="width-control"><span className="control-caption">Width</span><select aria-label="Stroke thickness" value={strokeWidth} onChange={e => setStrokeWidth(Number(e.target.value))}><option value={1}>1 px</option><option value={2}>2 px</option><option value={3}>3 px</option><option value={5}>5 px</option><option value={8}>8 px</option></select></label><label className="color-control" title="Canvas background"><span className="control-caption">Canvas</span><input aria-label="Canvas background" type="color" value={background} onChange={e => { const value = e.target.value; setBackground(value); if (socket.connected && room && !readOnly) socket.emit('board:settings', { background: value, grid }); }}/></label></div></div>
        {error && <div className="board-error" role="alert"><span>{error}</span><button onClick={() => { setError(''); socket.connect(); }}>Retry</button><button aria-label="Dismiss error" onClick={() => setError('')}><X size={14}/></button></div>}
        <div className={`canvas-container ${grid ? 'grid-on' : ''}`} ref={containerEl}><canvas ref={canvasEl}/>{remoteStrokes.map(s => <svg key={s.id} className="remote-stroke-overlay" aria-hidden="true"><polyline points={s.points.map(p => `${p[0]},${p[1]}`).join(' ')} fill="none" stroke={s.color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"/></svg>)}{cursors.map(c => <div key={c.id} className="remote-cursor-live" style={{ left: c.x, top: c.y, color: c.color }}><MousePointer2 size={18} fill={c.color}/><span style={{ background: c.color }}>{c.name}</span></div>)}{loading && <div className="canvas-loading"><LoaderCircle size={24} className="spin"/><span>Opening your shared canvas…</span></div>}{readOnly && <div className="readonly-banner"><LockKeyholeIcon/> You're viewing a read-only board</div>}</div>
        <div className="canvas-footer"><div className="footer-left"><span className="connection-indicator"><span className={`status-dot ${status}`}/>{status === 'connected' ? 'Live' : status === 'reconnecting' ? 'Reconnecting' : status === 'offline' ? 'Offline' : 'Connecting'}</span><span className="footer-sep"/><button onClick={() => setShareOpen(true)}><Link2 size={13}/> Invite collaborators</button></div><div className="zoom-control"><button aria-label="Zoom out" onClick={() => setZoom(z => Math.max(25, z - 10))}><Minus size={14}/></button><button className="zoom-value" onClick={fit}>{zoom}%</button><button aria-label="Zoom in" onClick={() => setZoom(z => Math.min(200, z + 10))}><Plus size={14}/></button><span className="zoom-sep"/><button aria-label="Fit canvas to screen" title="Fit canvas to screen" onClick={fit}><Hand size={15}/></button></div></div>
      </main></div>
    {shareOpen && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setShareOpen(false); }}><section className="share-modal" role="dialog" aria-modal="true" aria-labelledby="share-title"><button className="modal-close" aria-label="Close share dialog" onClick={() => setShareOpen(false)}><X size={18}/></button><div className="modal-symbol"><Share2 size={21}/></div><h2 id="share-title">Bring everyone in</h2><p>Anyone with this link can join your board and contribute in real time.</p><label className="modal-label">INVITATION LINK</label><div className="copy-field"><input readOnly value={window.location.href}/><button onClick={() => void copyLink()}><Copy size={15}/> Copy</button></div><div className="share-info"><Users size={16}/><span>{participants.length + (self ? 1 : 0)} {participants.length + (self ? 1 : 0) === 1 ? 'person is' : 'people are'} in this room right now</span></div><button className="modal-done" onClick={() => setShareOpen(false)}>Done</button></section></div>}
    {nameOpen && <div className="modal-backdrop"><section className="share-modal compact-modal" role="dialog" aria-modal="true"><button className="modal-close" aria-label="Close" onClick={() => setNameOpen(false)}><X size={18}/></button><h2>Board name</h2><p>Give this canvas a name that helps your team find it.</p><input className="modal-input" value={nameDraft} maxLength={120} onChange={e => setNameDraft(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveBoardName()}/><button className="modal-done" onClick={saveBoardName}>Save title</button></section></div>}
    {confirmClear && <div className="modal-backdrop"><section className="share-modal compact-modal" role="dialog" aria-modal="true"><div className="modal-symbol warning"><X size={20}/></div><h2>Clear this board?</h2><p>This removes every object from the shared canvas for everyone in the room. This action cannot be undone.</p><div className="modal-actions"><button className="cancel-btn" onClick={() => setConfirmClear(false)}>Cancel</button><button className="clear-confirm-btn" onClick={clearBoard}>Clear board</button></div></section></div>}
    {toast && <div className="toast-message" role="status"><Check size={15}/>{toast}</div>}
  </div>;
}
function Layers3Icon() { return <span className="tiny-brand-icon">S</span>; }
function LockKeyholeIcon() { return <span className="lock-icon"><LockKeyhole size={12}/></span>; }