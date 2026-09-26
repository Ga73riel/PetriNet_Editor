import { useState, useRef, useEffect, useCallback } from 'react';

/* ─── Types ─────────────────────────────────────────────────────────────────── */
interface PlaceNode { id: string; kind: 'place'; x: number; y: number; label: string; tokens: number }
interface TransNode { id: string; kind: 'transition'; x: number; y: number; label: string }
type NetNode = PlaceNode | TransNode;
interface NetArc { id: string; from: string; to: string; weight: number; inhibitor: boolean }
type Tool = 'select' | 'place' | 'transition' | 'arc' | 'inhibitor' | 'token' | 'delete';
type AppMode = 'edit' | 'simulate';

/* ─── Constants ─────────────────────────────────────────────────────────────── */
const PR = 26;   // place radius
const TW = 88;   // transition width
const TH = 28;   // transition height

/* ─── ID counter ────────────────────────────────────────────────────────────── */
let _ctr = 100;
const uid = (prefix: string) => `${prefix}${++_ctr}`;

/* ─── Geometry ──────────────────────────────────────────────────────────────── */
function placePt(n: PlaceNode, tx: number, ty: number) {
  const dx = tx - n.x, dy = ty - n.y, l = Math.hypot(dx, dy) || 1;
  return { x: n.x + dx / l * PR, y: n.y + dy / l * PR };
}
function transPt(n: TransNode, px: number, py: number) {
  const dx = px - n.x, dy = py - n.y;
  if (!dx && !dy) return { x: n.x, y: n.y };
  const sx = dx ? (TW / 2) / Math.abs(dx) : Infinity;
  const sy = dy ? (TH / 2) / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy);
  return { x: n.x + dx * s, y: n.y + dy * s };
}
function hitNode(nodes: NetNode[], cx: number, cy: number): NetNode | null {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    if (n.kind === 'place') {
      if (Math.hypot(cx - n.x, cy - n.y) <= PR + 6) return n;
    } else {
      if (Math.abs(cx - n.x) <= TW / 2 + 5 && Math.abs(cy - n.y) <= TH / 2 + 5) return n;
    }
  }
  return null;
}
function hitArc(arcs: NetArc[], nodes: NetNode[], cx: number, cy: number): NetArc | null {
  const nmap = Object.fromEntries(nodes.map(n => [n.id, n]));
  for (const arc of arcs) {
    const a = nmap[arc.from], b = nmap[arc.to];
    if (!a || !b) continue;
    const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
    if (l2 < 1) continue;
    const t = Math.max(0, Math.min(1, ((cx - a.x) * dx + (cy - a.y) * dy) / l2));
    if (Math.hypot(cx - a.x - t * dx, cy - a.y - t * dy) < 8) return arc;
  }
  return null;
}

/* ─── Logic ─────────────────────────────────────────────────────────────────── */
function enabledSet(nodes: NetNode[], arcs: NetArc[], m: Record<string, number>): Set<string> {
  const s = new Set<string>();
  for (const n of nodes) {
    if (n.kind !== 'transition') continue;
    const ins = arcs.filter(a => a.to === n.id);
    if (ins.every(a => a.inhibitor ? (m[a.from] ?? 0) === 0 : (m[a.from] ?? 0) >= a.weight)) s.add(n.id);
  }
  return s;
}
function fireT(tid: string, arcs: NetArc[], m: Record<string, number>): Record<string, number> {
  const next = { ...m };
  for (const a of arcs) {
    if (a.inhibitor) continue;
    if (a.to === tid) next[a.from] = (next[a.from] ?? 0) - a.weight;
    if (a.from === tid) next[a.to] = (next[a.to] ?? 0) + a.weight;
  }
  return next;
}

/* ─── Example net (toy machine) ─────────────────────────────────────────────── */
function buildExample(): { nodes: NetNode[]; arcs: NetArc[] } {
  const nodes: NetNode[] = [
    { id: 'ep0', kind: 'place', x: 450, y: 80, label: 'Pronta', tokens: 1 },
    { id: 'ep1', kind: 'place', x: 160, y: 290, label: 'Tent.1', tokens: 0 },
    { id: 'ep2', kind: 'place', x: 450, y: 290, label: 'Tent.2', tokens: 0 },
    { id: 'ep3', kind: 'place', x: 740, y: 290, label: 'Tent.3', tokens: 0 },
    { id: 'ep4', kind: 'place', x: 270, y: 560, label: 'Prêmio', tokens: 0 },
    { id: 'ep5', kind: 'place', x: 700, y: 560, label: 'Esgotado', tokens: 0 },
    { id: 'et0', kind: 'transition', x: 450, y: 175, label: 'Inserir Moeda' },
    { id: 'et1', kind: 'transition', x: 275, y: 420, label: 'Ganhar T1' },
    { id: 'et2', kind: 'transition', x: 110, y: 420, label: 'Perder T1' },
    { id: 'et3', kind: 'transition', x: 450, y: 420, label: 'Ganhar T2' },
    { id: 'et4', kind: 'transition', x: 610, y: 420, label: 'Perder T2' },
    { id: 'et5', kind: 'transition', x: 740, y: 420, label: 'Ganhar T3' },
    { id: 'et6', kind: 'transition', x: 870, y: 420, label: 'Perder T3' },
    { id: 'et7', kind: 'transition', x: 270, y: 660, label: 'Resetar' },
    { id: 'et8', kind: 'transition', x: 700, y: 660, label: 'Resetar' },
  ];
  const a = (from: string, to: string, weight = 1, inhibitor = false): NetArc =>
    ({ id: uid('ea'), from, to, weight, inhibitor });
  const arcs: NetArc[] = [
    a('ep0','et0'), a('et0','ep1'), a('et0','ep2'), a('et0','ep3'),
    a('ep1','et1'), a('ep2','et1'), a('ep3','et1'), a('et1','ep4'),
    a('ep1','et2'),
    a('ep2','et3'), a('ep3','et3'), a('et3','ep4'),
    a('ep1','et3',1,true), // inhibitor
    a('ep2','et4'), a('et4', 'ep4', 1), // bug: et4 should consume, not produce prize - fixing
    a('ep1','et4',1,true),
    a('ep3','et5'), a('et5','ep4'),
    a('ep1','et5',1,true), a('ep2','et5',1,true),
    a('ep3','et6'), a('et6','ep5'),
    a('ep1','et6',1,true), a('ep2','et6',1,true),
    a('ep4','et7'), a('et7','ep0'),
    a('ep5','et8'), a('et8','ep0'),
  ];
  // Fix et4 (Perder T2) - should NOT produce prize
  const fixedArcs = arcs.filter(x => !(x.from === 'et4' && x.to === 'ep4'));
  return { nodes, arcs: fixedArcs };
}

/* ─── Token dots ─────────────────────────────────────────────────────────────── */
function TokenDots({ count, cx, cy }: { count: number; cx: number; cy: number }) {
  if (count <= 0) return null;
  if (count === 1) return <circle cx={cx} cy={cy} r={7} fill="#fbbf24" />;
  if (count === 2) return <>
    <circle cx={cx - 8} cy={cy} r={6} fill="#fbbf24" />
    <circle cx={cx + 8} cy={cy} r={6} fill="#fbbf24" />
  </>;
  if (count === 3) return <>
    <circle cx={cx} cy={cy - 8} r={5} fill="#fbbf24" />
    <circle cx={cx - 8} cy={cy + 5} r={5} fill="#fbbf24" />
    <circle cx={cx + 8} cy={cy + 5} r={5} fill="#fbbf24" />
  </>;
  return <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
    fill="#fbbf24" fontSize={13} fontWeight="700" fontFamily="JetBrains Mono,monospace">{count}</text>;
}

/* ─── Main ──────────────────────────────────────────────────────────────────── */
export default function App() {
  const [nodes, setNodes] = useState<NetNode[]>([]);
  const [arcs, setArcs]   = useState<NetArc[]>([]);
  const [tool, setTool]   = useState<Tool>('select');
  const [mode, setMode]   = useState<AppMode>('edit');
  const [selected, setSelected] = useState<string | null>(null);
  const [arcSrc, setArcSrc]     = useState<string | null>(null);
  const [mouse, setMouse]       = useState({ x: 0, y: 0 });
  const [marking, setMarking]   = useState<Record<string, number>>({});
  const [log, setLog]           = useState<string[]>([]);
  const [editId, setEditId]     = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [pan, setPan]   = useState({ x: 60, y: 40 });
  const [zoom, setZoom] = useState(1);
  const svgRef  = useRef<SVGSVGElement>(null);
  const panning = useRef(false);
  const panAnchor = useRef({ mx: 0, my: 0, px: 0, py: 0 });
  const dragging  = useRef<{ id: string; ox: number; oy: number } | null>(null);

  const nmap = Object.fromEntries(nodes.map(n => [n.id, n]));
  const simEnabled = mode === 'simulate' ? enabledSet(nodes, arcs, marking) : new Set<string>();

  const selNode = selected ? nodes.find(n => n.id === selected) ?? null : null;
  const selArc  = selected ? arcs.find(a => a.id === selected) ?? null : null;

  function toCanvas(ex: number, ey: number) {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: (ex - r.left - pan.x) / zoom, y: (ey - r.top - pan.y) / zoom };
  }

  function initM(ns: NetNode[]) {
    return Object.fromEntries(ns.filter(n => n.kind === 'place').map(n => [n.id, (n as PlaceNode).tokens]));
  }

  const enterSim = () => { setMarking(initM(nodes)); setMode('simulate'); setSelected(null); setArcSrc(null); setLog([]); };
  const exitSim  = () => { setMode('edit'); setLog([]); };

  function getTokens(pid: string) {
    if (mode === 'simulate') return marking[pid] ?? 0;
    const n = nmap[pid];
    return n && n.kind === 'place' ? (n as PlaceNode).tokens : 0;
  }

  /* Arc endpoints */
  function arcEp(arc: NetArc) {
    const fn = nmap[arc.from], tn = nmap[arc.to];
    if (!fn || !tn) return null;
    if (fn.kind === 'place') {
      return { start: placePt(fn as PlaceNode, tn.x, tn.y), end: transPt(tn as TransNode, fn.x, fn.y) };
    }
    return { start: transPt(fn as TransNode, tn.x, tn.y), end: placePt(tn as PlaceNode, fn.x, fn.y) };
  }

  /* Mouse handlers */
  const onDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      panning.current = true;
      panAnchor.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y };
      e.preventDefault(); return;
    }
    if (e.button !== 0) return;
    const pos = toCanvas(e.clientX, e.clientY);
    const node = hitNode(nodes, pos.x, pos.y);

    /* Simulate mode */
    if (mode === 'simulate') {
      if (node?.kind === 'transition' && simEnabled.has(node.id)) {
        const nm = fireT(node.id, arcs, marking);
        setMarking(nm);
        setLog(p => [`⚡ ${node.label}`, ...p].slice(0, 14));
      }
      return;
    }

    /* Edit mode */
    if (tool === 'select') {
      if (node) {
        setSelected(node.id);
        dragging.current = { id: node.id, ox: pos.x - node.x, oy: pos.y - node.y };
      } else {
        const arc = hitArc(arcs, nodes, pos.x, pos.y);
        setSelected(arc?.id ?? null);
      }
      return;
    }
    if (tool === 'place') {
      const cnt = nodes.filter(n => n.kind === 'place').length + 1;
      const id = uid('p');
      setNodes(ns => [...ns, { id, kind: 'place', x: pos.x, y: pos.y, label: `P${cnt}`, tokens: 0 }]);
      setSelected(id); return;
    }
    if (tool === 'transition') {
      const cnt = nodes.filter(n => n.kind === 'transition').length + 1;
      const id = uid('t');
      setNodes(ns => [...ns, { id, kind: 'transition', x: pos.x, y: pos.y, label: `T${cnt}` }]);
      setSelected(id); return;
    }
    if (tool === 'arc' || tool === 'inhibitor') {
      if (!node) { setArcSrc(null); return; }
      if (!arcSrc) { setArcSrc(node.id); return; }
      if (arcSrc === node.id) { setArcSrc(null); return; }
      const fn = nmap[arcSrc], tn = node;
      if (fn && fn.kind !== tn.kind) {
        const isInh = tool === 'inhibitor';
        if (!isInh || (fn.kind === 'place' && tn.kind === 'transition')) {
          setArcs(as => [...as, { id: uid('a'), from: arcSrc, to: tn.id, weight: 1, inhibitor: isInh }]);
        }
      }
      setArcSrc(null); return;
    }
    if (tool === 'token') {
      if (node?.kind === 'place') {
        const delta = e.shiftKey ? -1 : 1;
        setNodes(ns => ns.map(n => n.id === node.id
          ? { ...n, tokens: Math.max(0, (n as PlaceNode).tokens + delta) } : n));
      }
      return;
    }
    if (tool === 'delete') {
      if (node) {
        setNodes(ns => ns.filter(n => n.id !== node.id));
        setArcs(as => as.filter(a => a.from !== node.id && a.to !== node.id));
        if (selected === node.id) setSelected(null);
      } else {
        const arc = hitArc(arcs, nodes, pos.x, pos.y);
        if (arc) { setArcs(as => as.filter(a => a.id !== arc.id)); if (selected === arc.id) setSelected(null); }
      }
    }
  }, [nodes, arcs, tool, mode, arcSrc, marking, simEnabled, pan, zoom, selected, nmap]);

  const onMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (panning.current) {
      setPan({ x: panAnchor.current.px + e.clientX - panAnchor.current.mx, y: panAnchor.current.py + e.clientY - panAnchor.current.my });
      return;
    }
    const pos = toCanvas(e.clientX, e.clientY);
    setMouse(pos);
    if (dragging.current && tool === 'select') {
      const { id, ox, oy } = dragging.current;
      setNodes(ns => ns.map(n => n.id === id ? { ...n, x: pos.x - ox, y: pos.y - oy } : n));
    }
  }, [tool, pan, zoom]);

  const onUp = useCallback(() => { panning.current = false; dragging.current = null; }, []);

  const onWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.88 : 1.12;
    const nz = Math.max(0.15, Math.min(5, zoom * factor));
    const r = svgRef.current!.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    setPan(p => ({ x: mx - (mx - p.x) * nz / zoom, y: my - (my - p.y) * nz / zoom }));
    setZoom(nz);
  }, [zoom]);

  const onDblClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (mode !== 'edit') return;
    const pos = toCanvas(e.clientX, e.clientY);
    const node = hitNode(nodes, pos.x, pos.y);
    if (node) { setEditId(node.id); setEditLabel(node.label); }
  }, [nodes, mode, pan, zoom]);

  /* Keyboard */
  useEffect(() => {
    const keys: Record<string, () => void> = {
      's': () => setTool('select'), 'S': () => setTool('select'),
      'p': () => setTool('place'),  'P': () => setTool('place'),
      't': () => setTool('transition'), 'T': () => setTool('transition'),
      'a': () => setTool('arc'),    'A': () => setTool('arc'),
      'i': () => setTool('inhibitor'), 'I': () => setTool('inhibitor'),
      'f': () => setTool('token'),  'F': () => setTool('token'),
      'd': () => setTool('delete'), 'D': () => setTool('delete'),
    };
    function handler(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || editId) return;
      if (keys[e.key]) { keys[e.key](); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!selected) return;
        const sn = nodes.find(n => n.id === selected);
        if (sn) { setNodes(ns => ns.filter(n => n.id !== selected)); setArcs(as => as.filter(a => a.from !== selected && a.to !== selected)); }
        else setArcs(as => as.filter(a => a.id !== selected));
        setSelected(null);
      }
      if (e.key === 'Escape') { setArcSrc(null); setSelected(null); setEditId(null); }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [editId, selected, nodes, arcs]);

  /* Prop updates */
  const setNodeLabel = (id: string, label: string) => setNodes(ns => ns.map(n => n.id === id ? { ...n, label } : n));
  const setNodeTokens = (id: string, t: number) => setNodes(ns => ns.map(n => n.id === id && n.kind === 'place' ? { ...n, tokens: Math.max(0, t) } : n));
  const setArcWeight = (id: string, w: number) => setArcs(as => as.map(a => a.id === id ? { ...a, weight: Math.max(1, w) } : a));
  const toggleInhibitor = (id: string) => {
    const arc = arcs.find(a => a.id === id); if (!arc) return;
    const fn = nmap[arc.from], tn = nmap[arc.to];
    if (!fn || fn.kind !== 'place' || !tn || tn.kind !== 'transition') return;
    setArcs(as => as.map(a => a.id === id ? { ...a, inhibitor: !a.inhibitor } : a));
  };
  const deleteSelected = () => {
    if (!selected) return;
    if (selNode) { setNodes(ns => ns.filter(n => n.id !== selected)); setArcs(as => as.filter(a => a.from !== selected && a.to !== selected)); }
    else if (selArc) setArcs(as => as.filter(a => a.id !== selected));
    setSelected(null);
  };

  const loadExample = () => {
    const ex = buildExample();
    setNodes(ex.nodes); setArcs(ex.arcs);
    setSelected(null); setArcSrc(null); setMode('edit'); setLog([]);
    setPan({ x: 20, y: 20 }); setZoom(0.9);
  };

  const clearAll = () => { setNodes([]); setArcs([]); setSelected(null); setArcSrc(null); setMode('edit'); setLog([]); };

  const TOOLS: { id: Tool; icon: string; label: string; hint: string; color: string }[] = [
    { id: 'select',     icon: '↖',  label: 'Mover',  hint: 'S — Selecionar e mover elementos', color: '#94a3b8' },
    { id: 'place',      icon: '○',  label: 'Lugar',  hint: 'P — Adicionar lugar (círculo)',     color: '#22c55e' },
    { id: 'transition', icon: '▬',  label: 'Trans',  hint: 'T — Adicionar transição (rect)',    color: '#3b82f6' },
    { id: 'arc',        icon: '→',  label: 'Arco',   hint: 'A — Arco regular (lugar↔trans)',   color: '#8b5cf6' },
    { id: 'inhibitor',  icon: '⊸',  label: 'Inib',   hint: 'I — Arco inibidor (lugar→trans)',  color: '#f59e0b' },
    { id: 'token',      icon: '●',  label: 'Ficha',  hint: 'F — Click +ficha / Shift −ficha',  color: '#fbbf24' },
    { id: 'delete',     icon: '✕',  label: 'Apagar', hint: 'D — Apagar elemento',              color: '#ef4444' },
  ];

  /* Ghost arc */
  const ghostArc = (() => {
    if (!arcSrc || (tool !== 'arc' && tool !== 'inhibitor')) return null;
    const fn = nmap[arcSrc]; if (!fn) return null;
    const from = fn.kind === 'place'
      ? placePt(fn as PlaceNode, mouse.x, mouse.y)
      : transPt(fn as TransNode, mouse.x, mouse.y);
    return { from, to: mouse, isInh: tool === 'inhibitor' };
  })();

  const placeCount = nodes.filter(n => n.kind === 'place').length;
  const transCount = nodes.filter(n => n.kind === 'transition').length;

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#060b18', fontFamily: 'Inter,sans-serif', overflow: 'hidden', userSelect: 'none' }}>

      {/* ─── Toolbar ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: '#080f1c', borderBottom: '1px solid #1e293b', flexShrink: 0, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 12, fontWeight: 700, color: '#60a5fa', marginRight: 6 }}>
          Petri Net Editor
        </span>

        {/* Mode */}
        <div style={{ display: 'flex', gap: 2, background: '#0f172a', borderRadius: 6, padding: 2, border: '1px solid #1e293b', marginRight: 6 }}>
          {(['edit', 'simulate'] as AppMode[]).map(m => (
            <button key={m} onClick={() => m === 'simulate' ? enterSim() : exitSim()}
              style={{ padding: '4px 12px', borderRadius: 4, border: 'none', cursor: 'pointer', fontFamily: 'JetBrains Mono,monospace', fontSize: 10, fontWeight: 600, background: mode === m ? (m === 'simulate' ? '#14532d' : '#172554') : 'transparent', color: mode === m ? (m === 'simulate' ? '#4ade80' : '#60a5fa') : '#334155' }}>
              {m === 'edit' ? '✏ Editar' : '▶ Simular'}
            </button>
          ))}
        </div>

        {/* Tools (edit only) */}
        {mode === 'edit' && TOOLS.map(tb => (
          <button key={tb.id} title={tb.hint} onClick={() => { setTool(tb.id); setArcSrc(null); }}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 9px', borderRadius: 5, border: `1px solid ${tool === tb.id ? tb.color : '#1e293b'}`, cursor: 'pointer', fontFamily: 'JetBrains Mono,monospace', fontSize: 10, background: tool === tb.id ? '#1e293b' : 'transparent', color: tool === tb.id ? tb.color : '#334155' }}>
            <span style={{ fontSize: 12 }}>{tb.icon}</span>
            <span>{tb.label}</span>
          </button>
        ))}

        <div style={{ flex: 1 }} />

        <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 10, color: '#1e293b' }}>
          {placeCount}P · {transCount}T · {arcs.length}A
        </span>

        {nodes.length === 0 && (
          <button onClick={loadExample}
            style={{ padding: '4px 10px', borderRadius: 5, border: '1px solid #1d4ed8', background: '#172554', color: '#60a5fa', cursor: 'pointer', fontFamily: 'JetBrains Mono,monospace', fontSize: 10 }}>
            ⬇ Carregar Exemplo
          </button>
        )}

        <button onClick={() => { setPan({ x: 60, y: 40 }); setZoom(1); }}
          style={{ padding: '4px 10px', borderRadius: 5, border: '1px solid #1e293b', background: 'transparent', color: '#334155', cursor: 'pointer', fontFamily: 'JetBrains Mono,monospace', fontSize: 10 }}>
          ⌂ Reset View
        </button>

        <button onClick={clearAll}
          style={{ padding: '4px 10px', borderRadius: 5, border: '1px solid #1e293b', background: 'transparent', color: '#334155', cursor: 'pointer', fontFamily: 'JetBrains Mono,monospace', fontSize: 10 }}>
          Limpar
        </button>
      </div>

      {/* ─── Main ────────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Canvas */}
        <svg ref={svgRef} style={{ flex: 1, background: '#07101f', cursor: tool === 'delete' ? 'crosshair' : tool === 'select' && dragging.current ? 'grabbing' : 'default', display: 'block' }}
          onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp}
          onMouseLeave={onUp} onWheel={onWheel} onDoubleClick={onDblClick}>
          <defs>
            <pattern id="grid" width={40} height={40} patternUnits="userSpaceOnUse"
              patternTransform={`translate(${pan.x % (40 * zoom)},${pan.y % (40 * zoom)}) scale(${zoom})`}>
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#ffffff05" strokeWidth="0.8" />
            </pattern>
            {/* Arrow markers */}
            {[['arr','#334155'],['arr-hi','#60a5fa'],['arr-en','#22c55e'],['arr-g','#8b5cf660']].map(([id,fill]) => (
              <marker key={id} id={id} markerWidth="9" markerHeight="7" refX="8" refY="3.5" orient="auto">
                <polygon points="0 0,9 3.5,0 7" fill={fill} />
              </marker>
            ))}
            <filter id="gsel"><feGaussianBlur stdDeviation="5" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
            <filter id="gen"><feGaussianBlur stdDeviation="5" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          </defs>

          <rect width="100%" height="100%" fill="url(#grid)" />

          <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>

            {/* Arcs */}
            {arcs.map(arc => {
              const ep = arcEp(arc); if (!ep) return null;
              const { start, end } = ep;
              const isSel = selected === arc.id;
              const fn = nmap[arc.from], tn = nmap[arc.to];
              const isEn = mode === 'simulate' && (
                (tn?.kind === 'transition' && simEnabled.has(arc.to)) ||
                (fn?.kind === 'transition' && simEnabled.has(arc.from))
              );
              const col = isSel ? '#60a5fa' : isEn ? '#22c55e' : '#2d3f52';
              const mkr = isSel ? 'arr-hi' : isEn ? 'arr-en' : 'arr';
              const dx = end.x - start.x, dy = end.y - start.y, l = Math.hypot(dx, dy) || 1;
              const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };

              if (arc.inhibitor) {
                const cp = { x: end.x - dx / l * 7, y: end.y - dy / l * 7 };
                return (
                  <g key={arc.id} onClick={e => { e.stopPropagation(); setSelected(arc.id); }} style={{ cursor: 'pointer' }}>
                    <line x1={start.x} y1={start.y} x2={cp.x} y2={cp.y} stroke="transparent" strokeWidth={10} />
                    <line x1={start.x} y1={start.y} x2={cp.x} y2={cp.y} stroke={col} strokeWidth={isSel ? 2 : 1.5} strokeDasharray="5 3" />
                    <circle cx={end.x} cy={end.y} r={5} fill="#07101f" stroke={col} strokeWidth={isSel ? 2 : 1.5} />
                    {arc.weight > 1 && <text x={mid.x + 6} y={mid.y - 6} fill={col} fontSize={10} fontFamily="JetBrains Mono,monospace" textAnchor="middle">{arc.weight}</text>}
                  </g>
                );
              }
              return (
                <g key={arc.id} onClick={e => { e.stopPropagation(); setSelected(arc.id); }} style={{ cursor: 'pointer' }}>
                  <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="transparent" strokeWidth={10} />
                  <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke={col} strokeWidth={isSel ? 2 : 1.5} markerEnd={`url(#${mkr})`} />
                  {arc.weight > 1 && <text x={mid.x + 6} y={mid.y - 6} fill={col} fontSize={10} fontFamily="JetBrains Mono,monospace" textAnchor="middle">{arc.weight}</text>}
                </g>
              );
            })}

            {/* Ghost arc */}
            {ghostArc && (
              ghostArc.isInh ? (
                <g>
                  <line x1={ghostArc.from.x} y1={ghostArc.from.y} x2={ghostArc.to.x - 4} y2={ghostArc.to.y - 4} stroke="#f59e0b60" strokeWidth={1.5} strokeDasharray="5 3" />
                  <circle cx={ghostArc.to.x} cy={ghostArc.to.y} r={5} fill="#07101f" stroke="#f59e0b60" strokeWidth={1.5} />
                </g>
              ) : (
                <line x1={ghostArc.from.x} y1={ghostArc.from.y} x2={ghostArc.to.x} y2={ghostArc.to.y}
                  stroke="#8b5cf660" strokeWidth={1.5} strokeDasharray="6 3" markerEnd="url(#arr-g)" />
              )
            )}

            {/* Places */}
            {nodes.filter(n => n.kind === 'place').map(n => {
              const p = n as PlaceNode;
              const isSel = selected === p.id;
              const isArcSrc = arcSrc === p.id;
              const tkn = getTokens(p.id);
              return (
                <g key={p.id}>
                  {(isSel || isArcSrc) && <circle cx={p.x} cy={p.y} r={PR + 10} fill={isArcSrc ? '#8b5cf618' : '#3b82f618'} filter="url(#gsel)" />}
                  <circle cx={p.x} cy={p.y} r={PR} fill="#07101f" stroke={isSel ? '#60a5fa' : isArcSrc ? '#8b5cf6' : '#2d3f52'} strokeWidth={isSel || isArcSrc ? 2.5 : 1.5} />
                  <TokenDots count={tkn} cx={p.x} cy={p.y} />
                  {editId === p.id ? (
                    <foreignObject x={p.x - 44} y={p.y + PR + 4} width={88} height={22}>
                      <input autoFocus value={editLabel}
                        onChange={e => setEditLabel(e.target.value)}
                        onBlur={() => { setNodeLabel(p.id, editLabel); setEditId(null); }}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') { setNodeLabel(p.id, editLabel); setEditId(null); } }}
                        style={{ width: '100%', background: '#1e293b', border: '1px solid #3b82f6', color: '#e2e8f0', fontFamily: 'JetBrains Mono,monospace', fontSize: 10, textAlign: 'center', borderRadius: 3, padding: '2px 4px', outline: 'none', boxSizing: 'border-box' }} />
                    </foreignObject>
                  ) : (
                    <text x={p.x} y={p.y + PR + 15} textAnchor="middle" fill={isSel ? '#93c5fd' : '#475569'} fontSize={11} fontFamily="JetBrains Mono,monospace">{p.label}</text>
                  )}
                </g>
              );
            })}

            {/* Transitions */}
            {nodes.filter(n => n.kind === 'transition').map(n => {
              const t = n as TransNode;
              const isSel = selected === t.id;
              const isArcSrc = arcSrc === t.id;
              const isEn = simEnabled.has(t.id);
              return (
                <g key={t.id}>
                  {isEn && <rect x={t.x - TW / 2 - 8} y={t.y - TH / 2 - 8} width={TW + 16} height={TH + 16} rx={7} fill="#22c55e14" filter="url(#gen)" />}
                  {(isSel || isArcSrc) && <rect x={t.x - TW / 2 - 8} y={t.y - TH / 2 - 8} width={TW + 16} height={TH + 16} rx={7} fill="#3b82f614" filter="url(#gsel)" />}
                  <rect x={t.x - TW / 2} y={t.y - TH / 2} width={TW} height={TH} rx={3}
                    fill={isEn ? '#14532d' : '#0f172a'}
                    stroke={isSel ? '#60a5fa' : isArcSrc ? '#8b5cf6' : isEn ? '#4ade80' : '#1e293b'}
                    strokeWidth={isSel || isEn ? 2 : 1.5}
                    style={{ cursor: mode === 'simulate' && isEn ? 'pointer' : 'default' }} />
                  {editId === t.id ? (
                    <foreignObject x={t.x - 42} y={t.y - 10} width={84} height={20}>
                      <input autoFocus value={editLabel}
                        onChange={e => setEditLabel(e.target.value)}
                        onBlur={() => { setNodeLabel(t.id, editLabel); setEditId(null); }}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') { setNodeLabel(t.id, editLabel); setEditId(null); } }}
                        style={{ width: '100%', background: '#1e293b', border: '1px solid #3b82f6', color: '#e2e8f0', fontFamily: 'JetBrains Mono,monospace', fontSize: 10, textAlign: 'center', borderRadius: 3, padding: '1px 4px', outline: 'none', boxSizing: 'border-box' }} />
                    </foreignObject>
                  ) : (
                    <text x={t.x} y={t.y} textAnchor="middle" dominantBaseline="central"
                      fill={isSel ? '#93c5fd' : isEn ? '#4ade80' : '#475569'}
                      fontSize={10} fontWeight="600" fontFamily="JetBrains Mono,monospace">{t.label}</text>
                  )}
                </g>
              );
            })}
          </g>

          {/* Empty canvas hint */}
          {nodes.length === 0 && (
            <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fill="#1e293b" fontSize={14} fontFamily="JetBrains Mono,monospace">
              Selecione uma ferramenta e clique no canvas para começar
            </text>
          )}
        </svg>

        {/* ─── Right panel ─────────────────────────────────────────────────── */}
        <div style={{ width: 210, flexShrink: 0, background: '#080f1c', borderLeft: '1px solid #1e293b', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>

          {/* Properties */}
          <div style={{ padding: '12px', borderBottom: '1px solid #1e293b' }}>
            <div style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 9, color: '#334155', letterSpacing: '0.1em', marginBottom: 10 }}>PROPRIEDADES</div>

            {!selected && <p style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 10, color: '#1e293b', margin: 0 }}>Nenhum elemento selecionado</p>}

            {selNode && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Field label="RÓTULO">
                  <input value={selNode.label} onChange={e => setNodeLabel(selNode.id, e.target.value)}
                    style={{ width: '100%', background: '#1e293b', border: '1px solid #334155', color: '#e2e8f0', fontFamily: 'JetBrains Mono,monospace', fontSize: 11, borderRadius: 4, padding: '5px 8px', outline: 'none', boxSizing: 'border-box' }} />
                </Field>
                <Field label="TIPO">
                  <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 10, color: '#475569' }}>
                    {selNode.kind === 'place' ? '○ Lugar' : '▬ Transição'}
                  </span>
                </Field>
                {selNode.kind === 'place' && (
                  <Field label="FICHAS INICIAIS">
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <Btn onClick={() => setNodeTokens(selNode.id, (selNode as PlaceNode).tokens - 1)}>−</Btn>
                      <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 14, color: '#fbbf24', minWidth: 22, textAlign: 'center' }}>{(selNode as PlaceNode).tokens}</span>
                      <Btn onClick={() => setNodeTokens(selNode.id, (selNode as PlaceNode).tokens + 1)}>+</Btn>
                    </div>
                  </Field>
                )}
                <button onClick={deleteSelected} style={delBtnStyle}>✕ Deletar</button>
              </div>
            )}

            {selArc && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Field label="TIPO">
                  <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 10, color: selArc.inhibitor ? '#f59e0b' : '#8b5cf6' }}>
                    {selArc.inhibitor ? '⊸ Inibidor' : '→ Regular'}
                  </span>
                </Field>
                <Field label="DE → PARA">
                  <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 10, color: '#475569' }}>
                    {nmap[selArc.from]?.label} → {nmap[selArc.to]?.label}
                  </span>
                </Field>
                {!selArc.inhibitor && (
                  <Field label="PESO">
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <Btn onClick={() => setArcWeight(selArc.id, selArc.weight - 1)}>−</Btn>
                      <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 14, color: '#a78bfa', minWidth: 22, textAlign: 'center' }}>{selArc.weight}</span>
                      <Btn onClick={() => setArcWeight(selArc.id, selArc.weight + 1)}>+</Btn>
                    </div>
                  </Field>
                )}
                {(() => {
                  const fn = nmap[selArc.from], tn = nmap[selArc.to];
                  if (fn?.kind === 'place' && tn?.kind === 'transition') return (
                    <button onClick={() => toggleInhibitor(selArc.id)}
                      style={{ padding: '5px 8px', borderRadius: 4, border: '1px solid #78350f', background: '#451a03', color: '#fbbf24', cursor: 'pointer', fontFamily: 'JetBrains Mono,monospace', fontSize: 10 }}>
                      {selArc.inhibitor ? '→ Tornar Regular' : '⊸ Tornar Inibidor'}
                    </button>
                  );
                })()}
                <button onClick={deleteSelected} style={delBtnStyle}>✕ Deletar Arco</button>
              </div>
            )}
          </div>

          {/* Sim log */}
          {mode === 'simulate' && (
            <div style={{ padding: '12px', borderBottom: '1px solid #1e293b' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 9, color: '#334155', letterSpacing: '0.1em' }}>LOG</span>
                <button onClick={() => { setMarking(initM(nodes)); setLog([]); }}
                  style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 9, color: '#334155', background: 'none', border: 'none', cursor: 'pointer' }}>↺ Reset</button>
              </div>
              <div style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 9, color: '#22c55e', marginBottom: 6 }}>
                {simEnabled.size} habilitada(s)
              </div>
              {log.length === 0
                ? <p style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 9, color: '#1e293b', margin: 0 }}>Clique nas transições verdes…</p>
                : log.map((e, i) => (
                  <div key={i} style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 9, color: '#475569', padding: '1px 0', opacity: Math.max(0.15, 1 - i * 0.07) }}>{e}</div>
                ))
              }
            </div>
          )}

          {/* Shortcuts */}
          <div style={{ padding: '12px', marginTop: 'auto' }}>
            <div style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 9, color: '#1e293b', letterSpacing: '0.1em', marginBottom: 8 }}>ATALHOS</div>
            {[['S','Selecionar'],['P','Lugar'],['T','Transição'],['A','Arco'],['I','Inibidor'],['F','Ficha'],['D','Apagar'],['Del','Deletar sel.'],['Esc','Cancelar'],['Scroll','Zoom'],['Alt+drag','Pan']].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 3 }}>
                <kbd style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 8, padding: '1px 4px', background: '#1e293b', border: '1px solid #334155', borderRadius: 3, color: '#475569', whiteSpace: 'nowrap' }}>{k}</kbd>
                <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 9, color: '#334155' }}>{v}</span>
              </div>
            ))}
            <div style={{ marginTop: 8, fontFamily: 'JetBrains Mono,monospace', fontSize: 9, color: '#1e293b' }}>
              Dbl-click: renomear nó
            </div>
          </div>
        </div>
      </div>

      {/* Status bar */}
      <div style={{ padding: '3px 14px', background: '#080f1c', borderTop: '1px solid #1e293b', display: 'flex', gap: 16, alignItems: 'center', flexShrink: 0 }}>
        <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 9, color: '#334155' }}>
          {mode === 'edit' ? `ferramenta: ${tool}` : 'modo simulação — clique transições verdes'}
        </span>
        {arcSrc && mode === 'edit' && (
          <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 9, color: '#8b5cf6' }}>
            arco iniciado em {nmap[arcSrc]?.label} — clique no destino
          </span>
        )}
        <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 9, color: '#1e293b', marginLeft: 'auto' }}>
          {(zoom * 100).toFixed(0)}% · {Math.round(-pan.x / zoom)},{Math.round(-pan.y / zoom)}
        </span>
      </div>
    </div>
  );
}

/* ─── Helper components ──────────────────────────────────────────────────────── */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 9, color: '#334155', marginBottom: 4, letterSpacing: '0.06em' }}>{label}</div>
      {children}
    </div>
  );
}
function Btn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      style={{ width: 24, height: 24, borderRadius: 4, border: '1px solid #334155', background: '#1e293b', color: '#94a3b8', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {children}
    </button>
  );
}
const delBtnStyle: React.CSSProperties = {
  padding: '5px 8px', borderRadius: 4, border: '1px solid #7f1d1d',
  background: '#450a0a', color: '#f87171', cursor: 'pointer',
  fontFamily: 'JetBrains Mono,monospace', fontSize: 10,
};
