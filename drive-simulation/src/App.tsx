import { useEffect, useRef, useState, type ReactElement } from 'react';
import { Camera, Clapperboard, Eye, Footprints, Bus as BusIcon, Moon, Sun, Sunset, Settings2, Layers, Plane, Volume2 } from 'lucide-react';
import { Game, type CamMode, type Hud } from './engine/game';
import type { TimePreset } from './engine/render';

const BASE = import.meta.env.BASE_URL;
const MODES: { id: CamMode; label: string; key: string; icon: ReactElement }[] = [
  { id: 'cinematic', label: 'Điện ảnh', key: '1', icon: <Clapperboard size={15} /> },
  { id: 'walk', label: 'Đi bộ', key: '2', icon: <Footprints size={15} /> },
  { id: 'free', label: 'Camera tự do', key: '3', icon: <Plane size={15} /> },
  { id: 'passenger', label: 'Hành khách', key: '4', icon: <Eye size={15} /> },
  { id: 'driver', label: 'Tài xế', key: '5', icon: <BusIcon size={15} /> },
];
const TIMES: { id: TimePreset; label: string; icon: ReactElement }[] = [
  { id: 'noon', label: 'Trưa nắng gắt', icon: <Sun size={15} /> },
  { id: 'sunset', label: 'Hoàng hôn GTA', icon: <Sunset size={15} /> },
  { id: 'night', label: 'Đêm mưa Neon', icon: <Moon size={15} /> },
];

function Toggle({ label, on, set }: { label: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <button onClick={() => set(!on)} className={`flex items-center justify-between w-full px-2.5 py-1.5 rounded-lg text-[12px] border transition ${on ? 'bg-amber-400/15 border-amber-300/50 text-amber-100' : 'bg-white/5 border-white/10 text-white/60'}`}>
      <span>{label}</span><span className={`w-7 h-4 rounded-full relative ${on ? 'bg-amber-400' : 'bg-white/20'}`}><i className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${on ? 'left-3.5' : 'left-0.5'}`} /></span>
    </button>
  );
}

export default function App() {
  const mount = useRef<HTMLDivElement>(null); const gameRef = useRef<Game | null>(null);
  const [prog, setProg] = useState({ p: 0, t: 'Khởi tạo…' }); const [ready, setReady] = useState(false); const [started, setStarted] = useState(false);
  const [hud, setHud] = useState<Hud | null>(null); const [panel, setPanel] = useState(true); const [ui, setUi] = useState(true);
  const [q, setQ] = useState({ ao: true, bloom: true, dof: false, motion: true, grain: true, chroma: true, reflections: true, shafts: true });
  const [ref, setRef] = useState<{ mode: 'off' | 'overlay' | 'split'; img: 1 | 2; op: number }>({ mode: 'off', img: 1, op: 0.5 });
  const [exp, setExp] = useState(1); const [err, setErr] = useState('');

  useEffect(() => {
    if (!mount.current) return; let g: Game | null = null; let dead = false;
    try {
      g = new Game(mount.current); gameRef.current = g; g.onHud = (h) => setHud({ ...h });
      g.init((p, t) => { console.log('[init]', p, t); !dead && setProg({ p, t }); }).then(() => !dead && setReady(true)).catch((e) => { console.error(e); setErr(String(e?.message ?? e)); });
    } catch (e: any) { console.error(e); setErr(String(e?.message ?? e)); }
    const key = (e: KeyboardEvent) => { if (e.code === 'Backquote' || e.code === 'F1') { e.preventDefault(); setPanel((v) => !v); } if (e.code === 'KeyU') setUi((v) => !v); };
    window.addEventListener('keydown', key);
    return () => { dead = true; window.removeEventListener('keydown', key); g?.dispose(); gameRef.current = null; };
  }, []);

  const G = () => gameRef.current;
  const setQual = (k: keyof typeof q, v: boolean) => { setQ((s) => ({ ...s, [k]: v })); G()?.setQuality(k, v); };

  return (
    <div className="fixed inset-0 select-none">
      <div ref={mount} className="absolute inset-0" />
      {/* reference overlay */}
      {ref.mode !== 'off' && (
        <div className="absolute inset-0 pointer-events-none">
          <img src={`${BASE}reference/ref${ref.img}.jpg`} alt="reference" className="absolute inset-0 w-full h-full object-cover" style={ref.mode === 'overlay' ? { opacity: ref.op } : { clipPath: 'inset(0 50% 0 0)' }} />
          {ref.mode === 'split' && <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-amber-300/80 shadow-[0_0_12px_rgba(255,190,50,.8)]" />}
          <div className="absolute bottom-24 left-4 text-[11px] glass px-2 py-1">{ref.mode === 'split' ? '◀ Ảnh tham chiếu (Lý Thái Tổ) | Cảnh 3D ▶' : 'Overlay ảnh tham chiếu'}</div>
        </div>
      )}
      {/* loading */}
      {!started && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-[radial-gradient(ellipse_at_30%_20%,#31445c,#06090d_70%)]">
          <div className="max-w-xl w-[90%] text-center">
            <div className="title text-5xl md:text-6xl font-bold text-amber-300 drop-shadow">SÀI GÒN · BẾN XE BUÝT</div>
            <div className="title text-xl text-white/70 mt-1">Đường Lý Thái Tổ, Quận 10 · TP. Hồ Chí Minh</div>
            <p className="text-white/60 text-sm mt-5">Tích hợp từ dự án gốc (Three.js) + mô hình tài xế <b>taixe.glb</b> + kho nhân vật <b>teehihi/scam-maze</b> · PBR · SSAO · Bloom · ACES · DoF · Motion Blur · SMAA</p>
            <div className="mt-7 h-2 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all" style={{ width: `${prog.p * 100}%` }} /></div>
            <div className="text-xs text-white/50 mt-2 h-4">{err ? <span className="text-red-400">Lỗi: {err}</span> : prog.t}</div>
            <button disabled={!ready} onClick={() => { G()?.enableAudio(); setStarted(true); }} className="mt-6 px-8 py-3 rounded-xl font-semibold title text-xl tracking-wide disabled:opacity-30 bg-amber-400 text-black hover:bg-amber-300 transition">{ready ? '▶ VÀO KHU PHỐ' : 'Đang tải…'}</button>
          </div>
        </div>
      )}
      {started && ui && hud && (
        <>
          <div className="absolute top-4 left-4 glass px-4 py-3 w-[300px] pointer-events-none">
            <div className="title text-2xl text-amber-300 leading-none">BẾN XE BUÝT LÝ THÁI TỔ</div>
            <div className="text-[11px] text-white/60 mt-1">Q.10, TP.HCM · {hud.label}</div>
            <div className="mt-2 text-[12px] flex items-center gap-2"><BusIcon size={14} className="text-sky-300" /> Tuyến 06 · <span className="text-white/90">{hud.busState}</span></div>
            <div className="text-[11px] text-white/50 mt-0.5">Vận tốc xe: {hud.busSpeed.toFixed(0)} km/h · {hud.people} nhân vật</div>
            {hud.shot && <div className="mt-2 text-[11px] text-amber-200/90 flex items-center gap-1.5"><Camera size={12} /> {hud.shot}</div>}
          </div>
          <div className="absolute top-4 right-4 glass px-3 py-2 text-[11px] text-right pointer-events-none"><div className="text-lg title text-emerald-300">{hud.fps.toFixed(0)} FPS</div><div className="text-white/50">{(hud.tris / 1000).toFixed(0)}k tris · {hud.calls} calls</div><div className="text-white/40">Grade: {hud.grade}</div></div>
          {(hud.mode === 'walk' || hud.mode === 'free') && <div className="absolute left-1/2 top-1/2 w-1.5 h-1.5 -ml-[3px] -mt-[3px] rounded-full bg-white/70 pointer-events-none" />}
          {(hud.mode === 'walk' || hud.mode === 'free' || hud.mode === 'driver' || hud.mode === 'passenger') && <div className="absolute bottom-24 left-1/2 -translate-x-1/2 text-[11px] glass px-3 py-1 pointer-events-none">Click vào cảnh để điều khiển · <span className="kbd">WASD</span> di chuyển · <span className="kbd">Shift</span> chạy · <span className="kbd">Q/E</span> lên/xuống (camera tự do) · <span className="kbd">Esc</span> thả chuột</div>}
          {/* bottom bar */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-wrap gap-2 justify-center">
            <div className="glass p-1.5 flex gap-1">{MODES.map((m) => (
              <button key={m.id} onClick={() => { G()?.setRefView(0); G()?.setMode(m.id); }} className={`px-3 py-2 rounded-lg text-[12px] flex items-center gap-1.5 transition ${hud.mode === m.id ? 'bg-amber-400 text-black font-semibold' : 'hover:bg-white/10 text-white/80'}`}>{m.icon}{m.label}<span className="kbd !text-black/60 !border-black/20">{m.key}</span></button>))}</div>
            <div className="glass p-1.5 flex gap-1">{TIMES.map((t) => (
              <button key={t.id} onClick={() => G()?.setTime(t.id)} className={`px-3 py-2 rounded-lg text-[12px] flex items-center gap-1.5 transition ${hud.time === t.id ? 'bg-sky-400 text-black font-semibold' : 'hover:bg-white/10 text-white/80'}`}>{t.icon}{t.label}</button>))}
              <button onClick={() => G()?.honk()} className="px-3 py-2 rounded-lg text-[12px] hover:bg-white/10 flex items-center gap-1.5"><Volume2 size={15} />Còi <span className="kbd">H</span></button>
            </div>
            <button onClick={() => setPanel((v) => !v)} className="glass px-3 py-2 text-[12px] flex items-center gap-1.5 hover:bg-white/10"><Settings2 size={15} />Inspector <span className="kbd">`</span></button>
          </div>
          {/* inspector */}
          {panel && (
            <div className="absolute top-24 right-4 w-[260px] glass p-3 max-h-[calc(100vh-220px)] overflow-auto text-[12px]">
              <div className="title text-lg text-amber-300 flex items-center gap-2"><Settings2 size={16} />INSPECTOR</div>
              <div className="text-[10px] uppercase tracking-wider text-white/40 mt-2 mb-1">Hậu kỳ điện ảnh</div>
              <div className="grid gap-1.5">
                <Toggle label="N8AO Ambient Occlusion" on={q.ao} set={(v) => setQual('ao', v)} /><Toggle label="Bloom vật lý" on={q.bloom} set={(v) => setQual('bloom', v)} />
                <Toggle label="Depth of Field" on={q.dof} set={(v) => setQual('dof', v)} /><Toggle label="Motion Blur" on={q.motion} set={(v) => setQual('motion', v)} />
                <Toggle label="Film grain" on={q.grain} set={(v) => setQual('grain', v)} /><Toggle label="Chromatic aberration" on={q.chroma} set={(v) => setQual('chroma', v)} />
                <Toggle label="Phản chiếu phẳng (vũng nước)" on={q.reflections} set={(v) => setQual('reflections', v)} /><Toggle label="Tia nắng thể tích" on={q.shafts} set={(v) => setQual('shafts', v)} />
              </div>
              <div className="mt-2 flex items-center gap-2"><span className="text-white/60 w-16">Exposure</span><input type="range" min={0.5} max={1.8} step={0.05} value={exp} onChange={(e) => { setExp(+e.target.value); G()?.setQuality('exposure', +e.target.value); }} className="flex-1" /><span className="w-8 text-right">{exp.toFixed(2)}</span></div>
              <div className="mt-2 flex items-center gap-2"><span className="text-white/60 w-16">Shadow</span><select onChange={(e) => G()?.setQuality('shadowRes', +e.target.value)} defaultValue={4096} className="flex-1 bg-white/10 rounded px-2 py-1"><option value={1024}>1024</option><option value={2048}>2048</option><option value={4096}>4096</option></select></div>
              <div className="text-[10px] uppercase tracking-wider text-white/40 mt-3 mb-1 flex items-center gap-1"><Layers size={11} />So sánh ảnh tham chiếu</div>
              <div className="grid grid-cols-3 gap-1">{(['off', 'overlay', 'split'] as const).map((m) => <button key={m} onClick={() => setRef((r) => ({ ...r, mode: m }))} className={`py-1.5 rounded-lg border ${ref.mode === m ? 'bg-amber-400 text-black border-amber-300' : 'bg-white/5 border-white/10'}`}>{m === 'off' ? 'Tắt' : m === 'overlay' ? 'Overlay' : 'Split'}</button>)}</div>
              <div className="grid grid-cols-2 gap-1 mt-1.5">{([1, 2] as const).map((i) => <button key={i} onClick={() => { setRef((r) => ({ ...r, img: i })); G()?.setRefView(i); }} className={`py-1.5 rounded-lg border ${ref.img === i ? 'border-amber-300/70 bg-amber-300/10' : 'border-white/10 bg-white/5'}`}>Ảnh {i} · khớp góc</button>)}</div>
              {ref.mode === 'overlay' && <div className="mt-2 flex items-center gap-2"><span className="text-white/60 w-16">Độ mờ</span><input type="range" min={0} max={1} step={0.02} value={ref.op} onChange={(e) => setRef((r) => ({ ...r, op: +e.target.value }))} className="flex-1" /></div>}
              <div className="mt-3 text-[10px] text-white/40 leading-relaxed"><span className="kbd">T</span> đổi thời gian · <span className="kbd">N</span> shot kế · <span className="kbd">U</span> ẩn UI · <span className="kbd">`</span> Inspector</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
