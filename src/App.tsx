import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BusFront, Clock3, Keyboard, LocateFixed, MapPin, Mouse, Pause, Play, RotateCcw, Route as RouteIcon, Volume2, VolumeX, Wallet, X } from 'lucide-react';
import { formatCash, formatClock, ROUTE } from './simulation/transit';
import type { Hud, Prompt, Simulation } from './simulation/runtime';

type Panel = 'route' | 'controls' | 'pause' | 'restart' | null;
const sceneImage = `${import.meta.env.BASE_URL}images/mission-saigon.jpg`;

function MazeMark() {
  return <svg className="maze-mark" viewBox="0 0 35 35" fill="none" aria-hidden="true"><path d="M3 8 8 3h23v24l-5 5H3V8Z" stroke="currentColor" strokeWidth="1.45"/><path d="M9 23V11h7l4 5h5v-5m-10 5v8h9l2-2v-2h-6" stroke="currentColor" strokeWidth="1.65" strokeLinejoin="round"/><path d="M3 14h6m16 10v8" stroke="currentColor" strokeWidth="1.45"/></svg>;
}

function Brand() {
  return <div className="brand" aria-label="SCAMMAZE"><MazeMark /><span>SCAMMAZE</span></div>;
}

function Key({ children }: { children: ReactNode }) {
  return <kbd>{children}</kbd>;
}

function Header({ muted, toggleSound, openControls }: { muted: boolean; toggleSound: () => void; openControls: () => void }) {
  return <header className="brief-header">
    <Brand />
    <div className="chapter-id"><span>CHAPTER 01</span><i>/</i><span>MISSION 02</span></div>
    <div className="header-options">
      <button className="header-button" type="button" onClick={openControls} aria-label="Controls"><Keyboard size={18} strokeWidth={1.55} /><span>CONTROLS</span></button>
      <div className="header-divider" />
      <button className="audio-button" type="button" onClick={toggleSound} aria-label={muted ? 'Unmute audio' : 'Mute audio'} title={muted ? 'Unmute audio' : 'Mute audio'} aria-pressed={!muted}>{muted ? <VolumeX size={19} strokeWidth={1.55} /> : <Volume2 size={19} strokeWidth={1.55} />}</button>
    </div>
  </header>;
}

function Briefing({ resume, start, route, controls, muted, toggleSound }: { resume: boolean; start: () => void; route: () => void; controls: () => void; muted: boolean; toggleSound: () => void }) {
  return <main className="briefing">
    <div className="hero-visual" aria-hidden="true"><img src={sceneImage} alt="" fetchPriority="high" /><div className="hero-shade" /></div>
    <Header muted={muted} toggleSound={toggleSound} openControls={controls} />
    <section className="hero-content" aria-labelledby="mission-title">
      <div className="hero-copy">
        <div className="mission-kicker"><span className="kicker-line" /><span>WEDNESDAY</span><span className="kicker-slash">/</span><span>08:00</span></div>
        <h1 id="mission-title"><span>THE LAST</span><span>INTERVIEW<span className="title-point">.</span></span></h1>
        <p>Alex has an interview in District 5 at 11:30. Take Route 06 through the streets of Saigon and get there on time.</p>
        <div className="hero-actions">
          <button type="button" className="ui-button ui-primary" onClick={start}><Play size={15} strokeWidth={1.7} fill="currentColor" />{resume ? 'RESUME SIMULATION' : 'ENTER SIMULATION'}<ArrowRight aria-hidden="true" className="button-arrow" size={16} /></button>
          <button type="button" className="ui-button ui-outline" onClick={route}><RouteIcon size={17} strokeWidth={1.7} />VIEW ROUTE</button>
        </div>
      </div>
    </section>
    <footer className="brief-footer">
      <div className="footer-controls" aria-label="Keyboard shortcuts">
        <div><span className="key-group"><Key>W</Key><Key>A</Key><Key>S</Key><Key>D</Key></span><span>MOVE</span></div>
        <span className="footer-rule" />
        <div><Mouse size={17} strokeWidth={1.55} /><span>LOOK</span></div>
        <span className="footer-rule" />
        <div><Key>E</Key><span>INTERACT</span></div>
      </div>
      <div className="footer-place"><MapPin size={17} strokeWidth={1.75} /><span>TP. HỒ CHÍ MINH, VIỆT NAM</span></div>
    </footer>
  </main>;
}

function Dialog({ name, tag, title, children, close }: { name: Exclude<Panel, null>; tag: string; title: string; children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => { if (dialog?.open) dialog.close(); };
  }, []);
  return <dialog className={`mission-dialog dialog-${name}`} ref={ref} aria-labelledby="panel-title" onCancel={(event) => { event.preventDefault(); close(); }} onClick={(event) => { if (event.target === event.currentTarget) close(); }} onKeyDown={(event) => { if (event.code === 'KeyM' && name === 'route' && !event.repeat) close(); }}>
    <div className="dialog-inner">
      <button className="dialog-close" type="button" onClick={close} aria-label="Close panel" autoFocus><X size={21} strokeWidth={1.65} /></button>
      <div className="dialog-kicker"><span className="kicker-line" />{tag}</div>
      <h2 id="panel-title">{title}</h2>
      {children}
    </div>
  </dialog>;
}

function RoutePanel({ hud, canWait, wait }: { hud: Hud | null; canWait: boolean; wait: () => void }) {
  const progress = hud?.progress ?? 0;
  const stop = progress === 1 ? 2 : progress >= 0.52 ? 1 : 0;
  return <>
    <div className="route-header"><span className="route-number">{ROUTE.number}</span><div><strong>{ROUTE.origin} <ArrowRight size={14} /> {ROUTE.destination}</strong><span>HO CHI MINH CITY PUBLIC BUS</span></div></div>
    <div className="route-sketch">
      <svg viewBox="0 0 536 153" role="img" aria-label="Schematic route: Lý Thái Tổ, Châu Văn Liêm, Chợ Lớn">
        <defs><pattern id="mapGrid" width="17" height="17" patternUnits="userSpaceOnUse"><path d="M17 0H0v17" fill="none" stroke="#b0c58f" strokeOpacity=".11" /></pattern></defs>
        <rect width="536" height="153" fill="url(#mapGrid)" />
        <g fill="none" stroke="#809879" strokeWidth="1.1" opacity=".32"><path d="M-50 140 43 39l53-51m-64 176 109-141 36-42M79 170l101-139 28-15 52-2 49-32M-9 64l98 49 96 33 52-25 47-2 87 38M9 8l112 67 94 36 55 42m-57-2 61-67 94-25 110-69M185 7l63 47 50 1 90 38 123 48M249-7l77 33 61 72 109 20m-28-127-33 61 25 42 44 28m-74-132-37 59 22 48m-77 57 40-38 43-48 69-32 69-14"/><path d="m413 156 16-26 46-13 23-27 25-31 21-5" stroke="#446b66" strokeWidth="8" opacity=".5" /></g>
        <path d="M73 105h79l51-31h88l48-29h120" fill="none" stroke="#9caf72" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" opacity=".36" />
        <path d="M73 105h79l51-31h88l48-29h120" fill="none" stroke="#caec79" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" pathLength="100" strokeDasharray={`${Math.max(1, progress * 100)} 100`} />
        {[[73, 105], [270, 74], [459, 45]].map(([x, y], i) => <g key={x} transform={`translate(${x} ${y})`}><circle r={i === stop ? 13 : 8} fill="#21291e" stroke="#a9c571" strokeWidth="1.6" />{i === stop && <circle r="5.5" fill="#cff07c" />}</g>)}
      </svg>
      <ol className="route-stops">
        {[[ROUTE.origin, 'District 3'], [ROUTE.via, 'Via'], [ROUTE.destination, 'District 5']].map(([label, note], i) => <li key={label} data-current={stop === i}><strong>{label}</strong><span>{note}</span></li>)}
      </ol>
    </div>
    <dl className="route-facts"><div><dt>FARE</dt><dd>{formatCash(ROUTE.fare)}</dd></div><div><dt>JOURNEY</dt><dd>{ROUTE.rideMinutes} min</dd></div><div><dt>INTERVIEW BY</dt><dd>{formatClock(ROUTE.deadline)}</dd></div></dl>
    <p className="panel-note">A fictional service for Mission 02. The bus saves money but takes longer than a booked ride.</p>
    {canWait && <button className="ui-button ui-primary dialog-primary" type="button" onClick={wait}><Clock3 size={16} />WAIT FOR ROUTE 06<ArrowRight className="button-arrow" size={16} /></button>}
  </>;
}

function ControlPanel({ muted, toggleSound, back }: { muted: boolean; toggleSound: () => void; back?: () => void }) {
  return <>
    <p className="panel-note intro-note">Click the scene to use mouse look. Arrow keys also work without pointer lock. On touchscreens, drag the scene to look.</p>
    <dl className="control-list">
      <div><dt>Walk</dt><dd><Key>W</Key><Key>A</Key><Key>S</Key><Key>D</Key></dd></div>
      <div><dt>Walk slowly (hold)</dt><dd><Key>C</Key></dd></div>
      <div><dt>Look around</dt><dd><Mouse size={17} /><span>or</span><Key><ArrowLeft size={12} /></Key><Key><ArrowUp size={12} /></Key><Key><ArrowDown size={12} /></Key><Key><ArrowRight size={12} /></Key></dd></div>
      <div><dt>Interact / Sit / Stand</dt><dd><Key>E</Key></dd></div>
      <div><dt>Wait / Signal departure</dt><dd><Key>F</Key></dd></div>
      <div><dt>Route map</dt><dd><Key>M</Key></dd></div>
      <div><dt>Pause / Release mouse</dt><dd><Key>ESC</Key></dd></div>
    </dl>
    <div className="settings-line">
      <span>Street and vehicle audio</span>
      <button type="button" className="ui-button ui-outline ui-mini" onClick={toggleSound} aria-pressed={!muted}>{muted ? <VolumeX size={16} /> : <Volume2 size={16} />}{muted ? 'OFF' : 'ON'}</button>
    </div>
    {back && <button className="text-button" type="button" onClick={back}><ArrowLeft size={16} />BACK TO PAUSE</button>}
  </>;
}

function PromptButton({ prompt, action, variant }: { prompt: Prompt; action: () => void; variant?: 'secondary' }) {
  return <button type="button" className={variant ? 'hud-prompt hud-prompt-secondary' : 'hud-prompt'} onClick={action}><Key>{prompt.key}</Key><span><strong>{prompt.label}</strong>{prompt.detail && <small>{prompt.detail}</small>}</span><span className="sr-only"> (or press {prompt.key})</span></button>;
}

function GameHud({ hud, muted, toggleSound, openPanel, engine }: { hud: Hud | null; muted: boolean; toggleSound: () => void; openPanel: (panel: Panel) => void; engine: Simulation | null }) {
  const phase = hud?.phase ?? 'waiting';
  const onTrip = phase === 'driving' || phase === 'departing';
  const location = phase === 'complete' || phase === 'arrived' ? 'CHỢ LỚN / DISTRICT 5' : onTrip ? 'ROUTE 06 / EN ROUTE' : 'LÝ THÁI TỔ / DISTRICT 3';
  return <div className="game-hud" data-phase={phase} data-onboard={hud?.onboard ?? false} data-seated={hud?.seated ?? false} data-paid={hud?.paid ?? false}>
    <div className="hud-top">
      <div className="hud-objective"><span><LocateFixed size={14} />MISSION 02 <i>/</i> THE LAST INTERVIEW</span><strong>{hud?.objective ?? 'Catch Route 06 to Chợ Lớn'}</strong><small>INTERVIEW DEADLINE / 11:30</small></div>
      <div className="hud-right">
        <div className="hud-resource"><Clock3 size={16} /><div><span>WEDNESDAY</span><strong>{hud?.clock ?? '08:00'}</strong></div></div>
        <div className="hud-resource"><Wallet size={16} /><div><span>CASH</span><strong>{formatCash(hud?.cash ?? ROUTE.initialCash)}</strong></div></div>
        <button className="hud-icon" type="button" onClick={toggleSound} aria-label={muted ? 'Unmute audio' : 'Mute audio'} aria-pressed={!muted}>{muted ? <VolumeX size={18} /> : <Volume2 size={18} />}</button>
        <button className="hud-icon" type="button" onClick={() => openPanel('pause')} aria-label="Pause simulation"><Pause size={17} /></button>
      </div>
    </div>
    <span className="reticle" aria-hidden="true" />
    <div className="hud-context">
      {hud?.notice && <div role="status" className="hud-notice">{hud.notice}</div>}
      {hud?.prompt && <PromptButton key={hud.prompt.label} prompt={hud.prompt} action={() => engine?.interact()} />}
      {hud?.secondary && <PromptButton prompt={hud.secondary} variant="secondary" action={() => engine?.requestAction()} />}
    </div>
    {onTrip && <div className="hud-journey"><span><BusFront size={15} />06 <i>/</i> CHỢ LỚN</span><progress aria-label="Trip progress" max="1" value={hud?.progress ?? 0} /></div>}
    {phase === 'complete' && <div className="hud-complete" role="status"><span>PUBLIC BUS TRANSFER COMPLETE</span><strong>{hud?.onTime ? 'Arrived before the interview' : 'Arrived after the deadline'}</strong><small>CHỢ LỚN, DISTRICT 5 / {hud?.clock}</small></div>}
    <div className="touch-pad" aria-label="Touch movement controls">
      {([['KeyW', ArrowUp, 'Walk forward'], ['KeyA', ArrowLeft, 'Strafe left'], ['KeyS', ArrowDown, 'Walk backward'], ['KeyD', ArrowRight, 'Strafe right']] as const).map(([key, Icon, label]) => (
        <button key={key} type="button" aria-label={label} onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); engine?.setInput(key, true); }} onPointerUp={() => engine?.setInput(key, false)} onPointerCancel={() => engine?.setInput(key, false)} onLostPointerCapture={() => engine?.setInput(key, false)}><Icon size={19} /></button>
      ))}
    </div>
    <div className="hud-footer"><div className="hud-place"><MapPin size={15} /><span>{location}</span></div><button type="button" className="hud-map" onClick={() => openPanel('route')}><Key>M</Key><RouteIcon size={16} />ROUTE MAP</button></div>
  </div>;
}

function savedMute() {
  try { return localStorage.getItem('scammaze-audio') !== 'on'; } catch { return true; }
}

export default function App() {
  const [view, setView] = useState<'briefing' | 'game'>('briefing');
  const [panel, setPanel] = useState<Panel>(null);
  const [muted, setMuted] = useState(savedMute);
  const [hud, setHud] = useState<Hud | null>(null);
  const [session, setSession] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const viewport = useRef<HTMLDivElement>(null);
  const engine = useRef<Simulation | null>(null);
  const soundPreference = useRef(muted);
  const playState = useRef(false);
  const controlsFromPause = useRef(false);
  playState.current = view === 'game' && !panel && !error;

  function openPanel(next: Panel) {
    if (next) engine.current?.setPaused(true);
    setPanel(next);
  }

  function toggleSound() {
    const next = !soundPreference.current;
    soundPreference.current = next;
    setMuted(next);
    engine.current?.setMuted(next);
    try { localStorage.setItem('scammaze-audio', next ? 'on' : 'off'); } catch { /* Preference remains available for this session. */ }
  }

  function start(fresh = false) {
    if (fresh || !session || error) {
      setHud(null); setReady(false); setError(''); setSession((id) => id + 1);
    }
    setPanel(null); setView('game');
  }

  function closePanel() {
    if (view === 'game' && (panel === 'controls' && controlsFromPause.current || panel === 'restart')) setPanel('pause');
    else setPanel(null);
  }

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    let simulation: Simulation | null = null;
    const timer = window.setTimeout(() => {
      void import('./simulation/runtime').then(({ createSimulation }) => {
        if (cancelled || !viewport.current) return;
        let instance: Simulation;
        try {
          instance = createSimulation(viewport.current, {
            onHud: setHud,
            onPanel: (next) => { engine.current?.setPaused(true); setPanel(next); },
            onReady: () => { if (!cancelled) setReady(true); },
            onError: (message) => { if (!cancelled) setError(message); },
          });
        } catch (err) {
          console.error(err);
          if (!cancelled) setError('This simulation needs WebGL 2. Enable hardware acceleration or open it in a WebGL 2 browser.');
          return;
        }
        simulation = instance; engine.current = instance;
        instance.setMuted(soundPreference.current);
        instance.setPaused(!playState.current);
      }).catch(() => { if (!cancelled) setError('The scene could not be loaded. Check your connection and try again.'); });
    }, 80);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      simulation?.dispose();
      if (engine.current === simulation) engine.current = null;
    };
  }, [session]);

  useEffect(() => {
    engine.current?.setPaused(view !== 'game' || !!panel || !!error);
  }, [view, panel, error]);

  const titles = { route: 'Route briefing', controls: 'Simulation controls', pause: 'Simulation paused', restart: 'Restart mission?' };
  const tags = { route: 'TRANSIT / ROUTE 06', controls: 'FIELD MANUAL', pause: 'MISSION 02 / PAUSE', restart: 'MISSION 02 / RESET' };

  return <div className="experience">
    {!!session && <section className={`game ${view === 'game' ? '' : 'game-hidden'}`} aria-label="SCAMMAZE first-person simulation" aria-hidden={view !== 'game'} inert={view !== 'game'}>
      <div className="viewport" ref={viewport} />
      {ready && !error && view === 'game' && <GameHud hud={hud} muted={muted} toggleSound={toggleSound} openPanel={openPanel} engine={engine.current} />}
      {(!ready || error) && <div className="game-loader">
        <img aria-hidden="true" src={sceneImage} alt="" />
        <div className="load-caption" role={error ? 'alert' : 'status'}><MazeMark /><span>SCAMMAZE / MISSION 02</span><h2>{error ? 'Renderer unavailable' : 'Entering Saigon'}</h2><p>{error || 'Preparing Lý Thái Tổ, District 3'}</p>{error ? <div className="loader-actions"><button className="ui-button ui-primary" type="button" onClick={() => start(true)}><RotateCcw size={16} />RETRY</button><button className="ui-button ui-outline" type="button" onClick={() => setView('briefing')}>BACK TO BRIEFING</button></div> : <div className="loading-line" />}</div>
      </div>}
    </section>}
    {view === 'briefing' && <Briefing resume={!!session && ready && !error} start={() => start()} route={() => openPanel('route')} controls={() => { controlsFromPause.current = false; openPanel('controls'); }} muted={muted} toggleSound={toggleSound} />}
    {panel && <Dialog key={panel} name={panel} tag={tags[panel]} title={titles[panel]} close={closePanel}>
      {panel === 'route' && <RoutePanel hud={view === 'game' ? hud : null} canWait={view === 'game' && hud?.phase === 'waiting' && hud.nearStop} wait={() => { engine.current?.waitForBus(); setPanel(null); }} />}
      {panel === 'controls' && <ControlPanel muted={muted} toggleSound={toggleSound} back={controlsFromPause.current ? () => openPanel('pause') : undefined} />}
      {panel === 'pause' && <><p className="panel-note intro-note">Your position and the mission clock are on hold.</p><div className="pause-actions"><button className="ui-button ui-primary" type="button" onClick={() => setPanel(null)}><Play size={15} fill="currentColor" />RESUME SIMULATION</button><button className="ui-button ui-outline" type="button" onClick={() => { controlsFromPause.current = true; openPanel('controls'); }}><Keyboard size={17} />CONTROLS</button><button className="ui-button ui-outline" type="button" onClick={() => openPanel('restart')}><RotateCcw size={16} />RESTART MISSION</button><button className="text-button" type="button" onClick={() => { setPanel(null); setView('briefing'); }}><ArrowLeft size={16} />BACK TO BRIEFING</button></div></>}
      {panel === 'restart' && <><p className="panel-note intro-note">Start again at Lý Thái Tổ at 08:00. Your current ride and ticket will be reset.</p><div className="pause-actions"><button className="ui-button ui-primary" type="button" onClick={() => start(true)}><RotateCcw size={16} />RESTART MISSION</button><button className="ui-button ui-outline" type="button" onClick={closePanel}>KEEP MY PROGRESS</button></div></>}
    </Dialog>}
  </div>;
}