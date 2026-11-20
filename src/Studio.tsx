import { SURVEY } from "./simulation/survey462";
import { useState, useRef, useEffect } from "react";
import {
  Activity,
  BusFront,
  Camera,
  Check,
  ChevronRight,
  CircleHelp,
  Clapperboard,
  CloudRain,
  Eye,
  Footprints,
  Images,
  Keyboard,
  Layers3,
  MapPin,
  Maximize2,
  Monitor,
  Mouse,
  Pause,
  Play,
  ScanLine,
  SlidersHorizontal,
  Sun,
  Sunset,
  Volume2,
  VolumeX,
  X,
  RotateCcw,
  ArrowDownToLine,
  Armchair,
  ShipWheel,
  PanelBottomClose,
  SplitSquareHorizontal,
} from "lucide-react";
import {
  createSimulation,
  type Lens,
  type Hud,
  type Simulation,
} from "./simulation/runtime";
import type { Climate } from "./simulation/atmosphere";
import "./studio.css";
const conditions = [
  { id: "day", label: "Trưa nắng", time: "12:00", temp: 34, icon: Sun },
  { id: "sunset", label: "Hoàng hôn", time: "17:30", temp: 30, icon: Sunset },
  { id: "rain", label: "Đêm mưa", time: "20:15", temp: 26, icon: CloudRain },
] as const;
const views = [
  { id: "director", label: "Điện ảnh", icon: Clapperboard },
  { id: "walk", label: "Tự do", icon: Footprints },
  { id: "passenger", label: "Hành khách", icon: Armchair },
  { id: "driver", label: "Tài xế", icon: ShipWheel },
] as const;
const references = ["ly-thai-to-east", "ly-thai-to-west"];
const statuses = {
  waiting: "Chờ xe đến",
  approaching: "Đang vào trạm",
  boarding: "Đón hành khách",
  departing: "Chuẩn bị rời bến",
  driving: "Đang di chuyển",
  arrived: "Đến Chợ Lớn",
  complete: "Hoàn tất chuyến",
};
function Logo() {
  return (
    <span className="sg-logo">
      <svg viewBox="0 0 40 40" fill="none" aria-hidden="true">
        <path
          d="M4 32 14 8h7L11 32zm12 0 6-14h7l-6 14zm12 0 3.5-8H38l-3.5 8z"
          fill="currentColor"
        />
      </svg>
      <b>
        SAIGON<span>SIM</span>
      </b>
    </span>
  );
}
function timecode(t: number) {
  return [Math.floor(t / 3600), Math.floor(t / 60) % 60, Math.floor(t) % 60]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}
export default function Studio() {
  const mount = useRef<HTMLDivElement>(null),
    screen = useRef<HTMLDivElement>(null),
    sim = useRef<Simulation | null>(null),
    modal = useRef<HTMLDialogElement>(null);
  const [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [epoch, setEpoch] = useState(0),
    [hud, setHud] = useState<Hud | null>(null);
  const [climate, setClimate] = useState<Climate>(()=>conditions.find(c=>c.id===new URLSearchParams(location.search).get("time"))?.id??"day"),
    [lens, setLens] = useState<Lens>("director"),
    [pause, setPause] = useState(false),
    [mute, setMute] = useState(true),
    [clean, setClean] = useState(false),
    [split, setSplit] = useState(false),
    [splitX, setSplitX] = useState(50),
    [refNo, setRefNo] = useState(0);
  const [quality,setQuality]=useState({ao:true,film:true,shafts:true,reflections:true,exposure:1});
  const [panel, setPanel] = useState<
      "help" | "refs" | "gallery" | "route" | "look" | null
    >(null),
    [captures, setCaptures] = useState<string[]>([]),
    [clock, setClock] = useState(0),
    [full, setFull] = useState(false),
    [note, setNote] = useState("");
  useEffect(()=>{sim.current?.setQuality(quality)},[quality,ready]);
  const weather = conditions.find((c) => c.id === climate)!,
    active = views.find((v) => v.id === lens)!;
  useEffect(() => {
    let dead = false;
    const mountEl = mount.current!;
    const timer = setTimeout(() => {
      try {
        sim.current = createSimulation(
          mountEl,
          {
            onHud: setHud,
            onPanel: (v) => {
              if (v === "route") setPanel("route");
              else setPause(true);
            },
            onReady: () => {
              if (!dead) setReady(true);
            },
            onError: setError,
          },
          undefined,
          true,
        );
      } catch (e) {
        console.error(e);
        setError(
          "Không khởi tạo được WebGL 2. Hãy bật tăng tốc đồ họa trong trình duyệt.",
        );
      }
    }, 30);
    const tick = setInterval(() => {
      if (sim.current) setClock(sim.current.telemetry().time);
    }, 500);
    return () => {
      dead = true;
      clearTimeout(timer);
      clearInterval(tick);
      sim.current?.dispose();
      sim.current = null;
    };
  }, [epoch]);
  useEffect(() => {
    sim.current?.setPaused(pause || !!panel);
  }, [pause, panel, ready]);
  useEffect(() => {
    sim.current?.setWeather(climate);
  }, [climate, ready]);
  useEffect(() => {
    sim.current?.setLens(lens);
  }, [lens, ready]);
  useEffect(() => {
    sim.current?.setMuted(mute);
  }, [mute, ready]);
  useEffect(() => {
    sim.current?.setReference(split ? refNo : null);
  }, [split, refNo, ready]);
  useEffect(() => {
    if (panel) modal.current?.showModal();
    else modal.current?.close();
  }, [panel]);
  useEffect(() => {
    if (note) {
      const t = setTimeout(() => setNote(""), 2600);
      return () => clearTimeout(t);
    }
  }, [note]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.repeat ||
        e.altKey ||
        e.metaKey ||
        e.ctrlKey ||
        panel ||
        ["INPUT", "SELECT"].includes((e.target as HTMLElement).tagName)
      )
        return;
      if (e.code === "KeyH") setClean((c) => !c);
      if(e.code==="KeyN")sim.current?.nextShot();
      if (e.code === "KeyR") setSplit((c) => !c);
      if (
        e.code === "Space" &&
        (e.target as HTMLElement).tagName !== "BUTTON"
      ) {
        e.preventDefault();
        setPause((p) => !p);
      }
      if (
        e.code === "Digit1" ||
        e.code === "Digit2" ||
        e.code === "Digit3" ||
        e.code === "Digit4"
      )
        setLens(views[+e.code.slice(-1) - 1].id);
    };
    document.addEventListener("keydown", key);
    const change = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", change);
    return () => {
      document.removeEventListener("keydown", key);
      document.removeEventListener("fullscreenchange", change);
    };
  }, [panel]);
  function photo() {
    if (!ready) return;
    const data = sim.current?.capture();
    if (data) {
      setCaptures((old) => [data, ...old].slice(0, 8));
      setNote("Đã lưu vào thư viện ảnh");
    }
  }
  function restart() {
    setReady(false);
    setPause(false);
    setError("");
    setEpoch((n) => n + 1);
  }
  async function expand() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      setClean((c) => !c);
    }
  }
  return (
    <div className={"studio " + (clean ? "clean" : "")}>
      <header className="studio-head">
        <Logo />
        <div className="brand-sub">
          URBAN
          <br />
          SIMULATOR
        </div>
        <nav aria-label="Không gian làm việc">
          <button
            className={!panel || panel === "route" ? "sel" : ""}
            onClick={() => setPanel(null)}
          >
            <Monitor /> Mô phỏng
          </button>
          <button
            className={panel === "refs" ? "sel" : ""}
            onClick={() => setPanel("refs")}
          >
            <Layers3 /> Tham chiếu
          </button>
          <button
            className={panel === "gallery" ? "sel" : ""}
            onClick={() => setPanel("gallery")}
          >
            <Images /> Thư viện
          </button>
        </nav>
        <div className="head-end">
          <span className="online">
            <i /> HỆ THỐNG ONLINE
          </span>
          <button
            title="Hướng dẫn"
            aria-label="Hướng dẫn"
            onClick={() => setPanel("help")}
          >
            <CircleHelp />
          </button>
        </div>
      </header>
      <main className="workspace">
        <div className="workspace-line">
          <span>
            <span className="squares">▦</span> WORKSPACE <ChevronRight />{" "}
            <b>MÔ PHỎNG ĐÔ THỊ</b>
          </span>
          <span className="build-id">
            BUILD 1.0 <i /> WEBGL 2.0
          </span>
        </div>
        <section
          ref={screen}
          className="screen"
          aria-label="Khung cảnh 3D thời gian thực"
        >
          <div className="canvas-wrap" ref={mount} />
          {(!ready || error) && (
            <div className="loading-still" aria-hidden="true" />
          )}
          <div className="film-shade" />
          {split && (
            <div className="ref-pane" style={{ width: splitX + "%" }}>
              <img
                src={"/references/" + references[refNo] + ".jpg"}
                alt="Ảnh đối chiếu thực tế 462 Lý Thái Tổ"
              />
              <b>ẢNH THAM CHIẾU {refNo + 1}/2</b>
            </div>
          )}
          {split && (
            <input
              aria-label="Độ rộng ảnh đối chiếu"
              className="split-range"
              type="range"
              min="10"
              max="90"
              value={splitX}
              onChange={(e) => setSplitX(+e.target.value)}
            />
          )}
          <div className="screen-top">
            <div className="feed">
              <strong>
                <i />
                {!ready ? "LOAD" : pause ? "PAUSED" : "LIVE"}
              </strong>
              <span>
                {split ? "REF" : "CAM"} 0
                {split ? refNo + 1 : views.indexOf(active) + 1}
              </span>
            </div>
            <div className="meteo">
              <weather.icon />
              <b>{weather.time}</b>
              <span /> {weather.temp}°C
            </div>
          </div>
          <div className="scene-info">
            <div className="scene-index">
              <span /> MÔI TRƯỜNG 01 <i>/</i> SÀI GÒN
            </div>
            <h1>
              {hud?.phase === "arrived" ? "Trạm Chợ Lớn" : "Bến xe Lý Thái Tổ"}
            </h1>
            <div className="scene-loc">
              <MapPin />{" "}
              {hud?.phase === "arrived"
                ? "Chợ Lớn"
                : "462 Lý Thái Tổ · Vườn Lài"}
              , TP.HCM <i /> <b>ĐƯỜNG PHỐ</b>
            </div>
          </div>
          <div className="view-tools">
            <button aria-label="Chỉnh hình ảnh" title="Chỉnh hình ảnh" disabled={!ready} onClick={()=>setPanel('look')}><SlidersHorizontal/></button>
            <button
              title="Chụp khung hình"
              aria-label="Chụp khung hình"
              disabled={!ready}
              onClick={photo}
            >
              <Camera />
            </button>
            <button
              className={split ? "on" : ""}
              title="Đối chiếu ảnh (R)"
              aria-label="Đối chiếu ảnh"
              onClick={() => setSplit((s) => !s)}
            >
              <SplitSquareHorizontal />
            </button>
            <button
              title="Toàn màn hình"
              aria-label={full ? "Thu nhỏ" : "Toàn màn hình"}
              onClick={expand}
            >
              <Maximize2 />
            </button>
          </div>
          {clean && (
            <button className="show-hud" onClick={() => setClean(false)}>
              <Eye /> Hiện giao diện · H
            </button>
          )}
          {lens === "walk" && ready && !clean && (
            <div className="walk-controls">
              {hud?.prompt && (
                <button onClick={() => sim.current?.interact()}>
                  E · {hud.prompt.label}
                </button>
              )}
              {hud?.secondary && (
                <button onClick={() => sim.current?.requestAction()}>
                  F · {hud.secondary.label}
                </button>
              )}
              <div className="mobile-dir">
                {["W", "A", "S", "D"].map((k) => (
                  <button
                    key={k}
                    onPointerDown={(e) => {
                      e.currentTarget.setPointerCapture(e.pointerId);
                      sim.current?.setInput("Key" + k, true);
                    }}
                    onLostPointerCapture={() =>
                      sim.current?.setInput("Key" + k, false)
                    }
                  >
                    {k}
                  </button>
                ))}
              </div>
            </div>
          )}
          {(!ready || error) && (
            <div className="stage-message">
              <ScanLine />
              <span>{error || "Đang khởi tạo không gian 3D…"}</span>
              {error && <button onClick={restart}>Thử lại</button>}
              {!new URLSearchParams(location.search).has("safe") && (
                <a href="?safe">Chạy chế độ nhẹ</a>
              )}
            </div>
          )}
          {note && (
            <div className="shot-note">
              <Check /> {note}
            </div>
          )}
        </section>
        <section className="deck" aria-label="Bảng điều khiển">
          <div className="deck-head">
            <div>
              <SlidersHorizontal />
              <h2>Bảng điều khiển</h2>
              <em>SCENE CONTROL</em>
            </div>
            <button onClick={() => setClean(true)}>
              <PanelBottomClose /> Ẩn giao diện <kbd>H</kbd>
            </button>
          </div>
          <div className="deck-grid">
            <div className="weather-block">
              <h3>
                <Sun /> Thời gian & thời tiết
              </h3>
              <div className="weather-list">
                {conditions.map((c) => (
                  <button
                    key={c.id}
                    aria-pressed={c.id === climate}
                    className={"weather-card " + c.id}
                    onClick={() => setClimate(c.id)}
                  >
                    <c.icon className="weather-symbol" />
                    {c.id === climate && (
                      <span className="tile-check">
                        <Check />
                      </span>
                    )}
                    <span className="tile-title">{c.label}</span>
                    <small>{c.time}</small>
                  </button>
                ))}
              </div>
            </div>
            <div className="camera-block">
              <h3>
                <Clapperboard /> Góc máy
              </h3>
              <div className="camera-grid">
                {views.map((c) => (
                  <button
                    key={c.id}
                    aria-pressed={lens === c.id}
                    onClick={() => setLens(c.id)}
                  >
                    <c.icon />
                    {c.label}
                    {lens === c.id && <i />}
                  </button>
                ))}
              </div>
            </div>
            <div className="transport">
              <h3>
                <Activity /> Trạng thái mô phỏng
              </h3>
              <div className="transport-status">
                <i className={pause ? "paused" : ""} />
                <span>
                  {pause ? "Tạm dừng" : statuses[hud?.phase ?? "boarding"]}
                </span>
                <b>{timecode(clock)}</b>
              </div>
              <div className="transport-keys">
                <button
                  className="play-key"
                  onClick={() => setPause((p) => !p)}
                >
                  {pause ? <Play /> : <Pause />}
                  {pause ? "Tiếp tục" : "Tạm dừng"}
                </button>
                <button
                  title={mute ? "Bật âm thanh" : "Tắt âm thanh"}
                  aria-label={mute ? "Bật âm thanh" : "Tắt âm thanh"}
                  onClick={() => setMute((m) => !m)}
                >
                  {mute ? <VolumeX /> : <Volume2 />}
                </button>
                <button
                  title="Khởi động lại mô phỏng"
                  aria-label="Khởi động lại mô phỏng"
                  onClick={restart}
                >
                  <RotateCcw />
                </button>
              </div>
            </div>
          </div>
        </section>
        <footer className="studio-footer">
          <div>
            <Keyboard />
            <kbd>W A S D</kbd> Di chuyển <span /> <Mouse /> Nhìn quanh <span />{" "}
            <kbd>1–4</kbd> Góc máy
          </div>
          <button onClick={() => setPanel("route")}>
            <BusFront /> TUYẾN 06 <ChevronRight />
          </button>
        </footer>
      </main>
      <dialog
        ref={modal}
        className="studio-dialog"
        onCancel={(e) => {
          e.preventDefault();
          setPanel(null);
        }}
        onClick={(e) => {
          if (e.target === modal.current) setPanel(null);
        }}
      >
        <div>
          <div className="modal-tag">
            SAIGON SIM <i>/</i> FIELD CONSOLE
          </div>
          <button
            className="modal-x"
            aria-label="Đóng"
            onClick={() => setPanel(null)}
          >
            <X />
          </button>
          <h2>
            {panel === "look" ? "Chỉnh hình ảnh" : panel === "refs"
              ? "Ảnh tham chiếu"
              : panel === "help"
                ? "Hướng dẫn điều khiển"
                : panel === "route"
                  ? "Lộ trình tuyến 06"
                  : "Thư viện khung hình"}
          </h2>
          {panel === 'look' && <div className="look-settings">
            <button className="mission-link" disabled={lens!=="director"} onClick={()=>{sim.current?.nextShot();setPanel(null)}}>Góc điện ảnh kế tiếp · N</button>
            <p>Các thay đổi áp dụng trực tiếp lên cảnh. {sim.current?.hasHDR?'Đang dùng hậu kỳ HDR.':'Đang vẽ trực tiếp; bóng tiếp xúc màn hình và hiệu ứng ống kính cần HDR.'}</p>
            {([['ao','Bóng tiếp xúc'],['film','Ống kính điện ảnh'],['shafts','Nắng xuyên tán cây'],['reflections','Phản chiếu mặt đường ướt']] as const).map(([key,name])=><label key={key}><span>{name}</span><input type="checkbox" checked={quality[key]} disabled={!sim.current?.hasHDR&&(key==='ao'||key==='film')} onChange={e=>setQuality({...quality,[key]:e.target.checked})}/></label>)}
            <label>Phơi sáng · {quality.exposure.toFixed(2)}× <input aria-label="Phơi sáng" type="range" min="0.7" max="1.5" step="0.05" value={quality.exposure} onChange={e=>setQuality({...quality,exposure:+e.target.value})}/></label>
          </div>}
          {panel === "refs" && (
            <>
              <p>
                462 Lý Thái Tổ · Vườn Lài (Quận 10 trong ảnh tháng 6/2024). Cùng
                một vị trí cạnh hàng rào giữa đường, nhìn theo hai hướng ngược
                nhau. Mặt tiền và khoảng lùi được ước lượng theo ảnh; nhà chờ là
                phần mô phỏng.
              </p>
              <a
                className="mission-link"
                href={SURVEY.maps}
                target="_blank"
                rel="noreferrer"
              >
                Mở địa chỉ 462 trên Google Maps ↗
              </a>
              <div className="ref-cards">
                {references.map((r, i) => (
                  <button
                    aria-label={`Góc nhìn 0${i + 1}`}
                    aria-pressed={refNo === i}
                    key={r}
                    onClick={() => setRefNo(i)}
                  >
                    <img
                      src={"/references/" + r + ".jpg"}
                      alt={"Góc nhìn " + (i + 1)}
                    />
                    <span>
                      Góc nhìn 0{i + 1} {refNo === i && <Check />}
                    </span>
                  </button>
                ))}
              </div>
              <button
                className="primary"
                onClick={() => {
                  setSplit(true);
                  setPanel(null);
                }}
              >
                <SplitSquareHorizontal /> Đối chiếu với cảnh 3D
              </button>
            </>
          )}
          {panel === "help" && (
            <>
              <p>
                Chọn góc máy Tự do để đi bộ từ vỉa hè lên xe. Trình diễn Điện
                ảnh tự đón khách và khởi hành.
              </p>
              {[
                ["W A S D", "Di chuyển • Shift để đi nhanh"],
                ["Chuột", "Kéo để nhìn quanh trong chế độ Tự do"],
                ["E / F", "Tương tác / gọi xe, khởi hành"],
                ["1 – 4", "Chọn góc máy"],
                ["Space", "Tạm dừng / tiếp tục"],
                ["H / R", "Ẩn giao diện / so sánh ảnh"],
              ].map(([k, t]) => (
                <div className="help-row" key={k}>
                  <kbd>{k}</kbd>
                  {t}
                </div>
              ))}
            </>
          )}
          {panel === "route" && (
            <>
              <p>Tuyến mô phỏng · Giá vé 7.000 ₫ · 34 phút trong game</p>
              <ol className="stops">
                {["Lý Thái Tổ", "Châu Văn Liêm", "Chợ Lớn"].map((s, i) => (
                  <li key={s}>
                    <b>0{i + 1}</b> {s}
                  </li>
                ))}
              </ol>
              <button
                className="primary"
                onClick={() => {
                  setLens("walk");
                  if (hud?.phase === "waiting") sim.current?.waitForBus();
                  setPanel(null);
                }}
              >
                Khám phá tại trạm <ChevronRight />
              </button>
              <a className="mission-link" href="?mission">
                Chơi nhiệm vụ gốc: The Last Interview ↗
              </a>
            </>
          )}
          {panel === "gallery" &&
            (captures.length ? (
              <div className="ref-cards">
                {captures.map((c, i) => (
                  <a href={c} key={i} download={"saigon-frame-" + i + ".png"}>
                    <img src={c} alt={"Khung hình " + (i + 1)} />
                    <span>
                      Ảnh {captures.length - i}
                      <ArrowDownToLine />
                    </span>
                  </a>
                ))}
              </div>
            ) : (
              <div className="empty-gallery">
                <Camera />
                <strong>Chưa có khung hình</strong>
                <p>
                  Dùng nút máy ảnh ở góc dưới khung 3D để lưu tối đa 8 ảnh trong
                  phiên này.
                </p>
                <button
                  className="primary"
                  onClick={() => {
                    photo();
                  }}
                >
                  Chụp cảnh hiện tại
                </button>
              </div>
            ))}
        </div>
      </dialog>
    </div>
  );
}
