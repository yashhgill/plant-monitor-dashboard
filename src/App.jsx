import { useState, useEffect, useRef, useCallback } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

const T = {
  en: {
    sub:"Smart Greenhouse", live:"Live", espOff:"Sensor offline", netOff:"Offline",
    temp:"Temperature", humid:"Humidity", optimal:"In range", low:"Below range", high:"Above range",
    fan:"Fan", pump:"Mist Maker", auto:"Auto", running:"Running", misting:"Misting 🌫️", idle:"Idle", manual:"Manual",
    controls:"Controls", autoMode:"Automatic", fanCtrl:"Fan", pumpCtrl:"Mist Maker",
    autoHint:"Disable Auto to override controls",
    aiTitle:"Plant AI", aiBy:"Groq · LLaMA-3.3-70B",
    aiPlaceholder:"Enter plant name — tomato, orchid, basil…",
    aiBtn:"Set & Control", aiLoading:"Thinking…", aiAdviceLabel:"Care notes",
    aiEmpty:"Enter a plant name and the AI will set the optimal thresholds.",
    aiFail:"AI unavailable. Check GROQ_API_KEY on backend.",
    activeFor:"Active for", thriving:"Thriving", good:"Good", fair:"Fair", stressed:"Stressed",
    health:"Plant Health", standby:"Standby", fanAct:"Running", pumpAct:"Misting",
    fanPump:"Fan + Pump", manMode:"Manual", alertOn:"Alerts on", alertOff:"Enable alerts",
    alertIOS:"Add to Home Screen for alerts", rgbLabel:"Device status", updated:"Updated",
  },
  ms: {
    sub:"Rumah Hijau Pintar", live:"Langsung", espOff:"Penderia luar talian", netOff:"Luar Talian",
    temp:"Suhu", humid:"Kelembapan", optimal:"Dalam julat", low:"Terlalu rendah", high:"Terlalu tinggi",
    fan:"Kipas", pump:"Penjana Kabus", auto:"Auto", running:"Berjalan", misting:"Menyembur 🌫️", idle:"Rehat", manual:"Manual",
    controls:"Kawalan", autoMode:"Automatik", fanCtrl:"Kipas", pumpCtrl:"Penjana Kabus",
    autoHint:"Nyahaktifkan Auto untuk kawal sendiri",
    aiTitle:"AI Pokok", aiBy:"Groq · LLaMA-3.3-70B",
    aiPlaceholder:"Nama pokok — tomato, orkid, selasih…",
    aiBtn:"Tetap & Kawal", aiLoading:"Berfikir…", aiAdviceLabel:"Nota penjagaan",
    aiEmpty:"Masukkan nama pokok dan AI akan tetapkan ambang optimum.",
    aiFail:"AI tidak tersedia. Semak GROQ_API_KEY.",
    activeFor:"Aktif untuk", thriving:"Subur", good:"Baik", fair:"Sederhana", stressed:"Tertekan",
    health:"Kesihatan Pokok", standby:"Sedia", fanAct:"Berjalan", pumpAct:"Menyembur",
    fanPump:"Kipas + Pam", manMode:"Manual", alertOn:"Amaran aktif", alertOff:"Aktifkan amaran",
    alertIOS:"Tambah ke Skrin Utama", rgbLabel:"Status peranti", updated:"Dikemas kini",
  },
};

async function requestNotif() {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  return (await Notification.requestPermission()) === "granted";
}
function notify(title, body) {
  if (Notification.permission === "granted") new Notification(title, { body, icon: "/icon-192.png" });
}

function calcHealth(temp, humid, th) {
  let s = 100;
  if (temp  > th.temp_high)  s -= Math.min(40, (temp  - th.temp_high)  * 9);
  if (temp  < th.temp_low)   s -= Math.min(40, (th.temp_low  - temp)   * 9);
  if (humid > th.humid_high) s -= Math.min(30, (humid - th.humid_high) * 3);
  if (humid < th.humid_low)  s -= Math.min(30, (th.humid_low  - humid) * 3);
  return Math.max(0, Math.round(s));
}
function healthMeta(score, t) {
  if (score >= 85) return { label: t.thriving, color: "#16A34A" };
  if (score >= 65) return { label: t.good,     color: "#65A30D" };
  if (score >= 40) return { label: t.fair,     color: "#D97706" };
  return               { label: t.stressed, color: "#DC2626" };
}
function getRGB(fanOn, pumpOn, auto_, t) {
  if (!auto_)          return { color: "#7C3AED", label: t.manMode };
  if (fanOn && pumpOn) return { color: "#0891B2", label: t.fanPump };
  if (fanOn)           return { color: "#2563EB", label: t.fanAct };
  if (pumpOn)          return { color: "#16A34A", label: t.pumpAct };
  return                      { color: "#9CA3AF", label: t.standby };
}

export default function App() {
  const [lang, setLang] = useState(() => localStorage.getItem("aip_lang") || "en");
  const t = T[lang];
  const [latest, setLatest]     = useState({ temperature:0, humidity:0, fan:false, pump:false, auto:true, ts:"--" });
  const [history, setHistory]   = useState([]);
  const [thresh, setThresh]     = useState({ temp_high:25, temp_low:23, humid_low:40, humid_high:55, plant:"", advice:"" });
  const [autoMode, setAutoMode] = useState(true);
  const [fanOn,    setFanOn]    = useState(false);
  const [pumpOn,   setPumpOn]   = useState(false);
  const [plant,    setPlant]    = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError,   setAiError]   = useState("");
  const [backendOk, setBackendOk] = useState(false);
  const [espOk,     setEspOk]     = useState(false);
  const [notifGranted,   setNotifGranted]   = useState(false);
  const [notifSupported, setNotifSupported] = useState(false);
  const pendingRef = useRef({});
  const prevRef    = useRef({ fan:false, pump:false, health:100 });
  const lastTsRef  = useRef("--");

  useEffect(() => { localStorage.setItem("aip_lang", lang); }, [lang]);

  const score  = calcHealth(latest.temperature, latest.humidity, thresh);
  const health = healthMeta(score, t);
  const rgb    = getRGB(fanOn, pumpOn, autoMode, t);

  useEffect(() => {
    const s = "Notification" in window;
    setNotifSupported(s);
    if (s && Notification.permission === "granted") setNotifGranted(true);
  }, []);

  useEffect(() => {
    const p = prevRef.current;
    if (fanOn  && !p.fan)          notify("AI Planter", `${t.fan} ON`);
    if (!fanOn && p.fan)           notify("AI Planter", `${t.fan} OFF`);
    if (pumpOn && !p.pump)         notify("AI Planter", `${t.pump} ON 🌫️`);
    if (!pumpOn && p.pump)         notify("AI Planter", `${t.pump} OFF`);
    if (score < 40 && p.health >= 40) notify("AI Planter", `${t.stressed} — ${score}/100`);
    prevRef.current = { fan:fanOn, pump:pumpOn, health:score };
  }, [fanOn, pumpOn, score]);

  const poll = useCallback(async () => {
    try {
      const r = await fetch(`${API}/data`, { signal: AbortSignal.timeout(4000) });
      if (!r.ok) throw new Error();
      const d = await r.json();
      setBackendOk(true);
      if (d.thresholds) setThresh(d.thresholds);
      const ts = d.latest?.ts || "--";
      if (ts !== "--" && ts !== lastTsRef.current) {
        setEspOk(true); lastTsRef.current = ts;
        setLatest(d.latest); setHistory(d.history);
        if (pendingRef.current.auto  === undefined) setAutoMode(d.latest.auto);
        if (pendingRef.current.fan   === undefined) setFanOn(d.latest.fan);
        if (pendingRef.current.pump  === undefined) setPumpOn(d.latest.pump);
      } else if (ts === lastTsRef.current && ts !== "--") setEspOk(false);
    } catch { setBackendOk(false); setEspOk(false); }
  }, []);

  useEffect(() => { poll(); const id = setInterval(poll, 5000); return () => clearInterval(id); }, [poll]);

  const clearPend = k => setTimeout(() => { pendingRef.current = { ...pendingRef.current, [k]:undefined }; }, 8000);
  const send = p => fetch(`${API}/control`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(p) });

  const toggleAuto = () => {
    const n = !autoMode; setAutoMode(n); pendingRef.current.auto = n; clearPend("auto"); send({ auto:n });
    if (n) { setFanOn(false); setPumpOn(false); pendingRef.current.fan = undefined; pendingRef.current.pump = undefined; }
  };
  const toggleFan  = () => { if (autoMode) return; const n=!fanOn;  setFanOn(n);  pendingRef.current.fan=n;  clearPend("fan");  send({fan:n}); };
  const togglePump = () => { if (autoMode) return; const n=!pumpOn; setPumpOn(n); pendingRef.current.pump=n; clearPend("pump"); send({pump:n}); };

  const askAI = async () => {
    if (!plant.trim()) return;
    setAiLoading(true); setAiError("");
    try {
      const r = await fetch(`${API}/ai-advice?plant=${encodeURIComponent(plant)}`);
      if (!r.ok) throw new Error(await r.text());
      const d = await r.json();
      if (d.thresholds) { setThresh(d.thresholds); notify("AI Planter", `Set for ${plant}`); }
    } catch { setAiError(t.aiFail); }
    setAiLoading(false);
  };

  const connLabel = !backendOk ? t.netOff : !espOk ? t.espOff : t.live;
  const connColor = espOk ? "#16A34A" : backendOk ? "#D97706" : "#DC2626";

  const R = 40, C2 = 2*Math.PI*R;
  const arc = (score/100)*C2*0.75;

  const barCalc = (val, low, high) => {
    const span = (high+5)-(low-5);
    return {
      pct: Math.min(100, Math.max(0, ((val-(low-5))/span)*100)),
      zl:  ((low-(low-5))/span)*100,
      zw:  ((high-low)/span)*100,
    };
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&family=Montserrat:wght@400;500;600;700&display=swap');

        *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }

        :root {
          --bg:      #F8FAFC;
          --surface: #FFFFFF;
          --surface2:#F1F5F9;
          --border:  #E2E8F0;
          --green:   #16A34A;
          --green-l: #DCFCE7;
          --blue:    #2563EB;
          --blue-l:  #DBEAFE;
          --amber:   #D97706;
          --amber-l: #FEF3C7;
          --red:     #DC2626;
          --red-l:   #FEE2E2;
          --purple:  #7C3AED;
          --cyan:    #0891B2;
          --text:    #0F172A;
          --muted:   #64748B;
          --subtle:  #94A3B8;
          --r:       12px;
          --r-sm:    8px;
        }

        html { -webkit-text-size-adjust:100%; }
        body {
          -webkit-overflow-scrolling: touch;
          background: var(--bg);
          color: var(--text);
          font-family: 'Poppins', sans-serif;
          min-height: 100dvh;
          overscroll-behavior: none;
        }

        .wrap {
          max-width: 430px;
          margin: 0 auto;
          padding: 0 16px 56px;
          padding-top: max(20px, env(safe-area-inset-top, 20px));
        }

        .card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--r);
        }

        /* ── Header ── */
        .hdr { display:flex; align-items:center; justify-content:space-between; padding-bottom:18px; }
        .hdr-brand { display:flex; align-items:center; gap:10px; }
        .brand-mark {
          width:36px; height:36px; border-radius:10px;
          background:#16A34A; display:flex; align-items:center; justify-content:center; font-size:18px;
        }
        .brand-name { font-family:'Montserrat',sans-serif; font-size:15px; font-weight:700; color:var(--text); }
        .brand-sub  { font-size:11px; color:var(--muted); }
        .hdr-right  { display:flex; gap:8px; align-items:center; }
        .status-chip {
          display:flex; align-items:center; gap:5px;
          background:var(--surface); border:1px solid var(--border);
          border-radius:20px; padding:5px 11px;
          font-size:11px; font-weight:500; color:var(--muted);
        }
        .pip { width:7px; height:7px; border-radius:50%; }
        .pip.live { animation:blink 2.5s ease-in-out infinite; }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.4} }
        .lang-btn {
          background:var(--surface); border:1px solid var(--border);
          border-radius:20px; padding:5px 12px;
          font-size:11px; font-weight:600; color:var(--muted);
          cursor:pointer; font-family:'Poppins',sans-serif;
        }
        .lang-btn:active { background:var(--surface2); }

        .gap { margin-bottom:10px; }
        .label { font-size:10px; font-weight:600; letter-spacing:0.08em; text-transform:uppercase; color:var(--muted); }

        /* ── AI Panel ── */
        .ai-card { padding:18px; }
        .ai-head { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:14px; }
        .ai-title { font-family:'Montserrat',sans-serif; font-size:15px; font-weight:700; color:var(--text); }
        .ai-by    { font-size:10px; color:var(--muted); margin-top:2px; }
        .ai-tag {
          font-size:10px; font-weight:600; color:var(--green);
          background:var(--green-l); border-radius:6px; padding:2px 9px;
        }
        .ai-row { display:flex; gap:8px; margin-bottom:12px; }
        .ai-input {
          flex:1; background:var(--surface2); border:1.5px solid var(--border);
          border-radius:var(--r-sm); padding:11px 13px; color:var(--text);
          font-family:'Poppins',sans-serif; font-size:13px; outline:none;
          transition:border-color 0.15s; -webkit-appearance:none;
        }
        .ai-input::placeholder { color:var(--subtle); }
        .ai-input:focus { border-color:var(--green); }
        .ai-btn {
          background:var(--green); color:#fff; border:none;
          border-radius:var(--r-sm); padding:11px 18px;
          font-family:'Poppins',sans-serif; font-size:13px; font-weight:600;
          cursor:pointer; white-space:nowrap; transition:opacity 0.15s;
        }
        .ai-btn:active { opacity:0.85; }
        .ai-btn:disabled { opacity:0.45; cursor:not-allowed; }
        .ai-progress { height:3px; background:var(--border); border-radius:3px; overflow:hidden; margin-bottom:12px; }
        .ai-progress-fill {
          height:100%; background:var(--green); width:40%;
          animation:slide 1.4s ease-in-out infinite;
        }
        @keyframes slide { 0%{transform:translateX(-200%)} 100%{transform:translateX(450%)} }
        .ai-error {
          font-size:12px; color:var(--red); margin-bottom:10px;
          padding:9px 12px; background:var(--red-l);
          border-radius:var(--r-sm);
        }
        .ai-result { display:flex; flex-direction:column; gap:8px; }
        .ai-thresh-row { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
        .ai-thresh-item {
          background:var(--surface2); border:1px solid var(--border);
          border-radius:var(--r-sm); padding:12px 14px;
        }
        .ai-thresh-val { font-family:'Montserrat',sans-serif; font-size:17px; font-weight:700; color:var(--amber); display:block; margin-bottom:3px; }
        .ai-advice-box {
          background:var(--amber-l); border-radius:var(--r-sm); padding:12px 14px;
        }
        .ai-advice-text { font-size:12px; line-height:1.65; color:#92400E; }
        .ai-empty { font-size:12px; color:var(--subtle); text-align:center; padding:6px 0; line-height:1.6; }

        /* ── Sensor hero ── */
        .sensor-hero {
          display:grid; grid-template-columns:1fr 1fr;
          border-radius:var(--r); overflow:hidden;
          border:1px solid var(--border); background:var(--border); gap:1px;
        }
        .sensor-cell { background:var(--surface); padding:20px 18px 16px; }
        .sensor-label { margin-bottom:10px; }
        .sensor-num {
          font-family:'Montserrat',sans-serif; font-weight:700;
          font-size:50px; line-height:1; letter-spacing:-0.03em;
        }
        .sensor-unit { font-size:14px; color:var(--muted); font-weight:400; margin-left:2px; }
        .sensor-status { display:flex; align-items:center; gap:5px; margin-top:8px; margin-bottom:7px; }
        .sensor-status-text { font-size:11px; font-weight:600; }
        .bar-bg { height:3px; background:var(--surface2); border-radius:3px; position:relative; overflow:hidden; }
        .bar-zone { position:absolute; top:0; height:100%; background:rgba(22,163,74,0.12); border-radius:3px; }
        .bar-fill { position:absolute; top:0; left:0; height:100%; border-radius:3px; transition:width 0.6s ease,background 0.3s; }
        .sensor-range { font-size:9px; color:var(--subtle); margin-top:5px; font-weight:500; }

        /* ── Health + Status ── */
        .hs-row { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
        .health-card { padding:16px; text-align:center; }
        .ring-wrap { width:88px; height:88px; position:relative; margin:0 auto 8px; }
        .ring-wrap svg { width:100%; height:100%; overflow:visible; }
        .ring-overlay { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; }
        .ring-num { font-family:'Montserrat',sans-serif; font-size:22px; font-weight:700; line-height:1; }
        .ring-denom { font-size:9px; color:var(--muted); margin-top:1px; }
        .health-status { font-size:13px; font-weight:600; margin-bottom:3px; }
        .health-plant { font-size:10px; color:var(--muted); }

        .status-card { padding:16px; display:flex; flex-direction:column; justify-content:space-between; gap:10px; }
        .rgb-row { display:flex; align-items:center; gap:10px; }
        .rgb-dot { width:34px; height:34px; border-radius:50%; flex-shrink:0; transition:background 0.4s; }
        .rgb-state { font-size:13px; font-weight:600; }
        .notif-btn {
          width:100%; background:var(--surface2); border:1px solid var(--border);
          border-radius:var(--r-sm); padding:8px; font-size:11px; font-weight:500;
          color:var(--muted); cursor:pointer; font-family:'Poppins',sans-serif; transition:all 0.15s;
        }
        .notif-btn.on { background:var(--green-l); color:var(--green); border-color:rgba(22,163,74,0.3); }
        .ios-hint { font-size:10px; color:var(--subtle); text-align:center; line-height:1.4; }

        /* ── Indicators ── */
        .inds { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }
        .ind { padding:14px 8px 12px; text-align:center; border:1px solid var(--border); border-radius:var(--r); background:var(--surface); transition:border-color 0.2s,background 0.2s; }
        .ind.on { border-color:var(--ic); background:color-mix(in srgb, var(--ic) 6%, white); }
        .ind-icon { font-size:22px; margin-bottom:6px; display:block; }
        .ind-name  { font-size:9px; font-weight:600; text-transform:uppercase; letter-spacing:0.08em; color:var(--muted); margin-bottom:2px; }
        .ind-state { font-size:11px; font-weight:500; color:var(--muted); transition:color 0.2s; }
        .ind.on .ind-state { color:var(--ic); }

        /* ── Charts ── */
        .charts { display:flex; flex-direction:column; gap:10px; }
        .chart-card { padding:16px; }
        .chart-hdr { display:flex; align-items:baseline; justify-content:space-between; margin-bottom:12px; }
        .chart-title { font-size:12px; font-weight:600; color:var(--muted); }
        .chart-range { font-size:10px; color:var(--subtle); font-weight:500; }

        /* ── Controls ── */
        .ctrl-card { padding:16px; }
        .ctrl-list { display:flex; flex-direction:column; gap:6px; margin-top:10px; }
        .ctrl-row {
          display:flex; align-items:center; justify-content:space-between;
          padding:13px 14px; border-radius:var(--r-sm);
          background:var(--surface2); border:1px solid var(--border);
          cursor:pointer; transition:all 0.15s; user-select:none;
        }
        .ctrl-row:active:not(.dim) { background:var(--border); }
        .ctrl-row.active { background:color-mix(in srgb, var(--ac) 8%, white); border-color:var(--ac); }
        .ctrl-row.dim { opacity:0.4; cursor:not-allowed; }
        .ctrl-left { display:flex; align-items:center; gap:10px; }
        .ctrl-name { font-size:14px; font-weight:500; color:var(--text); }
        .ctrl-row.active .ctrl-name { color:var(--ac); font-weight:600; }
        .ctrl-row.dim .ctrl-name { color:var(--muted); }

        .toggle { width:44px; height:26px; touch-action:manipulation; border-radius:13px; background:var(--border); position:relative; transition:background 0.2s; flex-shrink:0; }
        .toggle.on { background:var(--ac); }
        .thumb { position:absolute; top:3px; left:3px; width:20px; height:20px; border-radius:10px; background:#fff; transition:transform 0.2s; }
        .toggle.on .thumb { transform:translateX(18px); }

        .ctrl-hint { font-size:11px; color:var(--subtle); text-align:center; margin-top:8px; }
        .footer { text-align:center; font-size:10px; color:var(--subtle); font-weight:500; padding:6px 0; }

        @supports (padding: max(0px)) {
          .wrap { padding-bottom: max(56px, env(safe-area-inset-bottom, 20px)); }
        }
        @media (prefers-reduced-motion:reduce) { *,*::before,*::after { animation:none!important; transition-duration:0.01ms!important; } }
      `}</style>

      <div className="wrap">

        {/* Header */}
        <header className="hdr">
          <div className="hdr-brand">
            <div className="brand-mark">🌱</div>
            <div>
              <div className="brand-name">AI Planter</div>
              <div className="brand-sub">{t.sub}</div>
            </div>
          </div>
          <div className="hdr-right">
            <div className="status-chip">
              <div className={`pip ${espOk ? "live" : ""}`} style={{background:connColor}}/>
              {connLabel}
            </div>
            <button className="lang-btn" onClick={() => setLang(l => l==="en"?"ms":"en")}>
              {lang==="en"?"BM":"EN"}
            </button>
          </div>
        </header>

        {/* AI Panel */}
        <div className="card ai-card gap">
          <div className="ai-head">
            <div>
              <div className="ai-title">{t.aiTitle}</div>
              <div className="ai-by">{t.aiBy}</div>
            </div>
            {thresh.plant && <div className="ai-tag">{thresh.plant}</div>}
          </div>
          <div className="ai-row">
            <input className="ai-input" value={plant}
              onChange={e=>setPlant(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&askAI()}
              placeholder={t.aiPlaceholder}/>
            <button className="ai-btn" onClick={askAI} disabled={aiLoading}>
              {aiLoading?t.aiLoading:t.aiBtn}
            </button>
          </div>
          {aiLoading && <div className="ai-progress"><div className="ai-progress-fill"/></div>}
          {aiError   && <div className="ai-error">⚠ {aiError}</div>}
          {thresh.advice ? (
            <div className="ai-result">
              <div className="ai-thresh-row">
                <div className="ai-thresh-item">
                  <span className="ai-thresh-val">{thresh.temp_low}–{thresh.temp_high}°C</span>
                  <span className="label">{t.temp}</span>
                </div>
                <div className="ai-thresh-item">
                  <span className="ai-thresh-val">{thresh.humid_low}–{thresh.humid_high}%</span>
                  <span className="label">{t.humid}</span>
                </div>
              </div>
              <div className="ai-advice-box">
                <div className="label" style={{marginBottom:5,color:"#92400E"}}>{t.aiAdviceLabel}</div>
                <div className="ai-advice-text">{thresh.advice}</div>
              </div>
            </div>
          ) : !aiLoading && <p className="ai-empty">{t.aiEmpty}</p>}
        </div>

        {/* Sensor Hero */}
        <div className="sensor-hero gap">
          {[
            {key:"temperature",val:latest.temperature,unit:"°C",color:"#DC2626",low:thresh.temp_low,high:thresh.temp_high},
            {key:"humidity",   val:latest.humidity,   unit:"%", color:"#2563EB",low:thresh.humid_low,high:thresh.humid_high},
          ].map(({key,val,unit,color,low,high})=>{
            const ok=val>=low&&val<=high;
            const sc=ok?"#16A34A":val<low?"#2563EB":"#DC2626";
            const st=ok?t.optimal:val<low?t.low:t.high;
            const {pct,zl,zw}=barCalc(val,low,high);
            return (
              <div className="sensor-cell" key={key}>
                <div className="label sensor-label">{t[key]}</div>
                <div>
                  <span className="sensor-num" style={{color}}>{val.toFixed(1)}</span>
                  <span className="sensor-unit">{unit}</span>
                </div>
                <div className="sensor-status">
                  <div className="pip" style={{background:sc}}/>
                  <span className="sensor-status-text" style={{color:sc}}>{st}</span>
                </div>
                <div className="bar-bg">
                  <div className="bar-zone" style={{left:`${zl}%`,width:`${zw}%`}}/>
                  <div className="bar-fill" style={{width:`${pct}%`,background:sc}}/>
                </div>
                <div className="sensor-range">{low}–{high}{unit}</div>
              </div>
            );
          })}
        </div>

        {/* Health + Status */}
        <div className="hs-row gap">
          <div className="card health-card">
            <div className="label" style={{marginBottom:10}}>{t.health}</div>
            <div className="ring-wrap">
              <svg viewBox="0 0 100 100">
                <circle cx="50" cy="50" r={R} fill="none" stroke={`${health.color}20`} strokeWidth="8"
                  strokeDasharray={`${C2*0.75} ${C2}`} strokeDashoffset={C2*0.125} strokeLinecap="round"/>
                <circle cx="50" cy="50" r={R} fill="none" stroke={health.color} strokeWidth="8"
                  strokeDasharray={`${arc} ${C2}`} strokeDashoffset={C2*0.125} strokeLinecap="round"
                  style={{transition:"stroke-dasharray 0.7s ease,stroke 0.3s"}}/>
              </svg>
              <div className="ring-overlay">
                <div className="ring-num" style={{color:health.color}}>{score}</div>
                <div className="ring-denom label">/ 100</div>
              </div>
            </div>
            <div className="health-status" style={{color:health.color}}>{health.label}</div>
            <div className="health-plant">{thresh.plant||"—"}</div>
          </div>

          <div className="card status-card">
            <div>
              <div className="label" style={{marginBottom:10}}>{t.rgbLabel}</div>
              <div className="rgb-row">
                <div className="rgb-dot" style={{background:rgb.color}}/>
                <div>
                  <div className="rgb-state" style={{color:rgb.color}}>{rgb.label}</div>
                  <div className="label" style={{marginTop:2}}>LED</div>
                </div>
              </div>
            </div>
            {notifSupported?(
              <button className={`notif-btn ${notifGranted?"on":""}`}
                onClick={async()=>{const ok=await requestNotif();setNotifGranted(ok);}}>
                {notifGranted?`🔔 ${t.alertOn}`:`🔕 ${t.alertOff}`}
              </button>
            ):<div className="ios-hint">{t.alertIOS}</div>}
          </div>
        </div>

        {/* Indicators */}
        <div className="inds gap">
          {[
            {on:fanOn,   color:"#2563EB",icon:"💨",name:t.fan, stOn:t.running,stOff:t.idle},
            {on:pumpOn,  color:"#0891B2",icon:"🌫️",name:t.pump,stOn:t.misting,stOff:t.idle},
            {on:autoMode,color:"#D97706",icon:"⚡",name:t.auto,stOn:t.auto,   stOff:t.manual},
          ].map(({on,color,icon,name,stOn,stOff})=>(
            <div key={name} className={`ind ${on?"on":""}`} style={{"--ic":color}}>
              <span className="ind-icon">{icon}</span>
              <div className="ind-name">{name}</div>
              <div className="ind-state">{on?stOn:stOff}</div>
            </div>
          ))}
        </div>

        {/* Charts */}
        <div className="charts gap">
          {[
            {dKey:"temperature",color:"#DC2626",name:t.temp,unit:"°C",lo:thresh.temp_low,hi:thresh.temp_high},
            {dKey:"humidity",   color:"#2563EB",name:t.humid,unit:"%",lo:thresh.humid_low,hi:thresh.humid_high},
          ].map(({dKey,color,name,unit,lo,hi})=>(
            <div className="card chart-card" key={dKey}>
              <div className="chart-hdr">
                <span className="chart-title">{name}</span>
                <span className="chart-range">{lo}–{hi} {unit}</span>
              </div>
              <ResponsiveContainer width="100%" height={100}>
                <LineChart data={history.slice(-24)} margin={{top:2,right:2,left:-30,bottom:0}}>
                  <XAxis dataKey="ts" tick={{fill:"#CBD5E1",fontSize:8}} interval="preserveStartEnd" axisLine={false} tickLine={false}/>
                  <YAxis tick={{fill:"#CBD5E1",fontSize:8}} axisLine={false} tickLine={false}/>
                  <Tooltip contentStyle={{background:"#fff",border:"1px solid #E2E8F0",borderRadius:8,fontSize:11}}
                    labelStyle={{color:"#64748B"}} itemStyle={{color}} cursor={{stroke:"#E2E8F0",strokeWidth:1}}/>
                  <ReferenceLine y={hi} stroke={color} strokeDasharray="3 3" strokeOpacity={0.3} strokeWidth={1}/>
                  <ReferenceLine y={lo} stroke={color} strokeDasharray="3 3" strokeOpacity={0.3} strokeWidth={1}/>
                  <Line type="monotone" dataKey={dKey} stroke={color} strokeWidth={2}
                    dot={false} activeDot={{r:4,fill:color,strokeWidth:0}}/>
                </LineChart>
              </ResponsiveContainer>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div className="card ctrl-card gap">
          <div className="label">{t.controls}</div>
          <div className="ctrl-list">
            {[
              {on:autoMode,toggle:toggleAuto,name:t.autoMode,color:"#D97706",disabled:false},
              {on:fanOn,   toggle:toggleFan, name:t.fanCtrl, color:"#2563EB",disabled:autoMode},
              {on:pumpOn,  toggle:togglePump,name:t.pumpCtrl,color:"#16A34A",disabled:autoMode},
            ].map(({on,toggle,name,color,disabled})=>(
              <div key={name}
                className={`ctrl-row ${on&&!disabled?"active":""} ${disabled?"dim":""}`}
                style={{"--ac":color}} onClick={disabled?undefined:toggle}>
                <span className="ctrl-name">{name}</span>
                <div className={`toggle ${on&&!disabled?"on":""}`} style={{"--ac":color}}>
                  <div className="thumb"/>
                </div>
              </div>
            ))}
          </div>
          {autoMode&&<div className="ctrl-hint">{t.autoHint}</div>}
        </div>

        <div className="footer">{t.updated} {latest.ts||"—"}</div>
      </div>
    </>
  );
}
