import { useState, useEffect, useRef, useCallback } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

// ── i18n ──────────────────────────────────────
const T = {
  en: {
    appName:"AI Planter", appSub:"Smart Greenhouse Control",
    live:"Live", espOff:"ESP32 Offline", off:"Offline",
    noPlant:"No plant selected",
    temp:"Temperature", humid:"Humidity",
    optimal:"Optimal", low:"Too low", high:"Too high",
    fan:"Fan", pump:"Pump", auto:"Auto",
    running:"Running", misting:"Misting", idle:"Idle", manual:"Manual",
    controls:"Controls", autoMode:"Auto Mode",
    manualHint:"Switch to Manual to override",
    aiHero:"What are you growing today?",
    aiSub:"Type a plant and the AI will set the perfect temperature and humidity thresholds automatically.",
    aiPlaceholder:"e.g. tomato, orchid, chilli, basil…",
    aiBtn:"Set & Control",
    aiLoading:"Thinking…",
    aiEmpty:"Enter a plant name above to get started.",
    aiFail:"AI unavailable. Check GROQ_API_KEY on backend.",
    activeFor:"Active thresholds for",
    tempRange:"Temp range",
    humidRange:"Humidity range",
    updated:"Updated",
    thriving:"Thriving", good:"Good", fair:"Fair", stressed:"Stressed",
    standby:"Standby", fanAct:"Fan active", pumpAct:"Pump active",
    fanPump:"Fan + Pump", manMode:"Manual",
    alertOn:"🔔 Alerts on", alertOff:"🔕 Enable alerts",
    alertIOS:"Add to Home Screen for alerts",
    rgbStatus:"RGB Status",
    health:"Plant Health",
    score:"Score",
    advice:"Care advice",
  },
  ms: {
    appName:"AI Planter", appSub:"Kawalan Rumah Hijau Pintar",
    live:"Langsung", espOff:"ESP32 Luar Talian", off:"Luar Talian",
    noPlant:"Tiada pokok dipilih",
    temp:"Suhu", humid:"Kelembapan",
    optimal:"Optimum", low:"Terlalu rendah", high:"Terlalu tinggi",
    fan:"Kipas", pump:"Pam", auto:"Auto",
    running:"Berjalan", misting:"Menyembur", idle:"Rehat", manual:"Manual",
    controls:"Kawalan", autoMode:"Mod Auto",
    manualHint:"Tukar ke Manual untuk kawal sendiri",
    aiHero:"Apa yang anda tanam hari ini?",
    aiSub:"Taip nama pokok dan AI akan tetapkan ambang suhu dan kelembapan yang sempurna secara automatik.",
    aiPlaceholder:"cth. tomato, orkid, cili, selasih…",
    aiBtn:"Tetap & Kawal",
    aiLoading:"Sedang berfikir…",
    aiEmpty:"Masukkan nama pokok di atas untuk bermula.",
    aiFail:"AI tidak tersedia. Semak GROQ_API_KEY di backend.",
    activeFor:"Ambang aktif untuk",
    tempRange:"Julat suhu",
    humidRange:"Julat kelembapan",
    updated:"Dikemas kini",
    thriving:"Subur", good:"Baik", fair:"Sederhana", stressed:"Tertekan",
    standby:"Sedia", fanAct:"Kipas aktif", pumpAct:"Pam aktif",
    fanPump:"Kipas + Pam", manMode:"Manual",
    alertOn:"🔔 Amaran aktif", alertOff:"🔕 Aktifkan amaran",
    alertIOS:"Tambah ke Skrin Utama untuk amaran",
    rgbStatus:"Status RGB",
    health:"Kesihatan Pokok",
    score:"Skor",
    advice:"Tip penjagaan",
  },
};

// ── Notifications ────────────────────────────
async function requestNotif() {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  return (await Notification.requestPermission()) === "granted";
}
function notify(title, body) {
  if (Notification.permission === "granted")
    new Notification(title, { body, icon: "/icon-192.png" });
}

// ── Health ───────────────────────────────────
function calcHealth(temp, humid, th) {
  let s = 100;
  if (temp  > th.temp_high)  s -= Math.min(40, (temp  - th.temp_high)  * 9);
  if (temp  < th.temp_low)   s -= Math.min(40, (th.temp_low  - temp)   * 9);
  if (humid > th.humid_high) s -= Math.min(30, (humid - th.humid_high) * 3);
  if (humid < th.humid_low)  s -= Math.min(30, (th.humid_low  - humid) * 3);
  return Math.max(0, Math.round(s));
}
function healthMeta(score) {
  if (score >= 85) return { key:"thriving", color:"#4ade80", ring:"#166534" };
  if (score >= 65) return { key:"good",     color:"#a3e635", ring:"#3f6212" };
  if (score >= 40) return { key:"fair",     color:"#fbbf24", ring:"#92400e" };
  return               { key:"stressed", color:"#f87171", ring:"#7f1d1d" };
}

// ── RGB orb ──────────────────────────────────
function getRGB(fanOn, pumpOn, autoMode) {
  if (!autoMode)            return { color:"#a78bfa", key:"manMode" };
  if (fanOn && pumpOn)      return { color:"#22d3ee", key:"fanPump" };
  if (fanOn)                return { color:"#60a5fa", key:"fanAct" };
  if (pumpOn)               return { color:"#4ade80", key:"pumpAct" };
  return                           { color:"#94a3b8", key:"standby" };
}

export default function App() {
  const [lang, setLang]     = useState(() => localStorage.getItem("aip_lang") || "en");
  const t = T[lang];
  const [latest, setLatest] = useState({ temperature:0, humidity:0, fan:false, pump:false, auto:true, ts:"--" });
  const [history, setHistory] = useState([]);
  const [thresh, setThresh]   = useState({ temp_high:25, temp_low:23, humid_low:40, humid_high:55, plant:"", advice:"" });
  const [autoMode, setAutoMode] = useState(true);
  const [fanOn, setFanOn]     = useState(false);
  const [pumpOn, setPumpOn]   = useState(false);
  const [plant, setPlant]     = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError]     = useState("");
  const [backendOk, setBackendOk] = useState(false);
  const [espOk, setEspOk]         = useState(false);
  const [notifGranted, setNotifGranted]     = useState(false);
  const [notifSupported, setNotifSupported] = useState(false);
  const pendingRef = useRef({});
  const prevRef    = useRef({ fan:false, pump:false, health:100 });
  const lastTsRef  = useRef("--");

  useEffect(() => { localStorage.setItem("aip_lang", lang); }, [lang]);

  const score  = calcHealth(latest.temperature, latest.humidity, thresh);
  const health = healthMeta(score);
  const rgb    = getRGB(fanOn, pumpOn, autoMode);

  // notifications
  useEffect(() => {
    const s = "Notification" in window;
    setNotifSupported(s);
    if (s && Notification.permission === "granted") setNotifGranted(true);
  }, []);

  useEffect(() => {
    const prev = prevRef.current;
    if (fanOn && !prev.fan)   notify("🌱 AI Planter", t.fan + " ON");
    if (!fanOn && prev.fan)   notify("🌱 AI Planter", t.fan + " OFF");
    if (pumpOn && !prev.pump) notify("🌱 AI Planter", t.pump + " ON");
    if (!pumpOn && prev.pump) notify("🌱 AI Planter", t.pump + " OFF");
    if (score < 40 && prev.health >= 40) notify("⚠️ AI Planter", `${t.stressed}! Score: ${score}`);
    prevRef.current = { fan:fanOn, pump:pumpOn, health:score };
  }, [fanOn, pumpOn, score]);

  // poll
  const poll = useCallback(async () => {
    try {
      const r = await fetch(`${API}/data`, { signal: AbortSignal.timeout(4000) });
      if (!r.ok) throw new Error();
      const d = await r.json();
      setBackendOk(true);
      if (d.thresholds) setThresh(d.thresholds);
      const ts = d.latest?.ts || "--";
      if (ts !== "--" && ts !== lastTsRef.current) {
        setEspOk(true);
        lastTsRef.current = ts;
        setLatest(d.latest);
        setHistory(d.history);
        if (pendingRef.current.auto  === undefined) setAutoMode(d.latest.auto);
        if (pendingRef.current.fan   === undefined) setFanOn(d.latest.fan);
        if (pendingRef.current.pump  === undefined) setPumpOn(d.latest.pump);
      } else if (ts === lastTsRef.current && ts !== "--") {
        setEspOk(false);
      }
    } catch { setBackendOk(false); setEspOk(false); }
  }, []);

  useEffect(() => { poll(); const id = setInterval(poll, 5000); return () => clearInterval(id); }, [poll]);

  const clearPend = (k) => setTimeout(() => { pendingRef.current = { ...pendingRef.current, [k]:undefined }; }, 8000);
  const send = (p) => fetch(`${API}/control`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(p) });

  const toggleAuto = () => {
    const n = !autoMode; setAutoMode(n);
    pendingRef.current.auto = n; clearPend("auto");
    send({ auto:n });
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
      if (d.thresholds) { setThresh(d.thresholds); notify("🌱 AI Planter", `Thresholds set for ${plant}`); }
    } catch { setAiError(t.aiFail); }
    setAiLoading(false);
  };

  const connLabel = !backendOk ? t.off : !espOk ? t.espOff : t.live;
  const connColor = espOk ? "#4ade80" : backendOk ? "#fbbf24" : "#f87171";

  // ring arc
  const r = 52, circ = 2 * Math.PI * r;
  const arc = (score / 100) * circ * 0.75;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Inter:wght@400;500&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin:0; padding:0; }

        :root {
          --bg:        #0a1a0f;
          --bg2:       #0f2416;
          --surface:   rgba(15,36,22,0.85);
          --surface2:  rgba(20,46,28,0.9);
          --border:    rgba(74,222,128,0.12);
          --border2:   rgba(74,222,128,0.22);
          --text:      #ecfdf5;
          --muted:     #6ee7b7;
          --subtle:    #34d399;
          --dim:       #4b5563;
          --green:     #4ade80;
          --mint:      #6ee7b7;
          --amber:     #fbbf24;
          --blue:      #60a5fa;
          --red:       #f87171;
          --purple:    #a78bfa;
          --cyan:      #22d3ee;
          --gold:      #f59e0b;
          --r:         18px;
          --r-sm:      12px;
          --shadow:    0 4px 32px rgba(0,0,0,0.5);
          --glow-g:    0 0 20px rgba(74,222,128,0.15);
          --glow-a:    0 0 24px rgba(245,158,11,0.2);
        }

        html { -webkit-text-size-adjust:100%; scroll-behavior:smooth; }

        body {
          background: var(--bg);
          background-image:
            radial-gradient(ellipse 60% 40% at 15% 0%, rgba(74,222,128,0.07) 0%, transparent 60%),
            radial-gradient(ellipse 50% 50% at 85% 100%, rgba(34,211,238,0.05) 0%, transparent 60%);
          background-attachment: fixed;
          color: var(--text);
          font-family: 'Inter', sans-serif;
          min-height: 100dvh;
          padding-bottom: env(safe-area-inset-bottom, 16px);
          overflow-x: hidden;
        }

        .app {
          max-width: 440px;
          margin: 0 auto;
          padding: 0 14px 48px;
          padding-top: max(16px, env(safe-area-inset-top, 16px));
        }

        /* ── Header ───────────────────── */
        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 4px 0 20px;
        }
        .header-brand { display:flex; align-items:center; gap:9px; }
        .brand-leaf {
          width: 34px; height: 34px; border-radius: 10px;
          background: linear-gradient(135deg, #166534, #4ade80);
          display: flex; align-items:center; justify-content:center;
          font-size: 18px; box-shadow: 0 0 16px rgba(74,222,128,0.3);
        }
        .brand-name {
          font-family: 'Space Grotesk', sans-serif;
          font-size: 1.05rem; font-weight: 700; letter-spacing: -0.01em;
          color: var(--text);
        }
        .brand-sub {
          font-size: 0.65rem; color: var(--muted);
          font-family: 'Inter', sans-serif; margin-top: 1px;
        }
        .header-right { display:flex; align-items:center; gap:8px; }
        .pill {
          display: flex; align-items:center; gap:5px;
          background: rgba(0,0,0,0.4); border: 1px solid var(--border2);
          border-radius: 20px; padding: 5px 10px;
          font-size: 0.7rem; font-weight: 500;
        }
        .pip { width:6px; height:6px; border-radius:50%; flex-shrink:0; }
        .lang-btn {
          background: rgba(0,0,0,0.4); border: 1px solid var(--border2);
          border-radius: 20px; padding: 5px 10px;
          font-size: 0.7rem; font-weight: 600; color: var(--muted);
          cursor: pointer; transition: all 0.18s;
        }
        .lang-btn:active { transform: scale(0.93); }

        /* ── AI Command Center ─────────── */
        .ai-hero {
          background: linear-gradient(135deg, rgba(20,46,28,0.95), rgba(30,20,60,0.9));
          border: 1px solid rgba(167,139,250,0.25);
          border-radius: var(--r);
          padding: 20px;
          margin-bottom: 12px;
          box-shadow: var(--shadow), 0 0 32px rgba(167,139,250,0.08);
          position: relative;
          overflow: hidden;
        }
        .ai-hero::before {
          content:"";
          position: absolute; inset:0;
          background: radial-gradient(ellipse 80% 60% at 50% 0%, rgba(167,139,250,0.08), transparent);
          pointer-events: none;
        }
        .ai-top-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 14px;
        }
        .ai-badge {
          display: flex; align-items:center; gap:6px;
          background: linear-gradient(135deg, #7c3aed, #4f46e5);
          border-radius: 8px; padding: 4px 10px;
          font-family: 'Space Grotesk', sans-serif;
          font-size: 0.68rem; font-weight: 600; letter-spacing: 0.05em;
          color: white;
        }
        .ai-active-tag {
          font-size: 0.65rem; color: var(--gold);
          font-family: 'JetBrains Mono', monospace;
          background: rgba(245,158,11,0.1);
          border: 1px solid rgba(245,158,11,0.2);
          border-radius: 6px; padding: 3px 8px;
        }
        .ai-headline {
          font-family: 'Space Grotesk', sans-serif;
          font-size: 1.2rem; font-weight: 700; letter-spacing: -0.02em;
          color: var(--text); margin-bottom: 5px;
        }
        .ai-subline {
          font-size: 0.75rem; color: rgba(110,231,183,0.7);
          line-height: 1.55; margin-bottom: 14px;
        }
        .ai-input-row { display:flex; gap:8px; margin-bottom:12px; }
        .ai-input {
          flex:1; background: rgba(0,0,0,0.4);
          border: 1.5px solid rgba(167,139,250,0.25);
          border-radius: var(--r-sm); padding: 12px 14px;
          color: var(--text); font-family: 'Inter', sans-serif;
          font-size: 0.88rem; outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
          -webkit-appearance: none;
        }
        .ai-input::placeholder { color: rgba(110,231,183,0.35); }
        .ai-input:focus {
          border-color: rgba(167,139,250,0.6);
          box-shadow: 0 0 0 3px rgba(167,139,250,0.1);
        }
        .ai-btn {
          background: linear-gradient(135deg, #7c3aed, #4f46e5);
          color: white; border: none; border-radius: var(--r-sm);
          padding: 12px 16px; font-family: 'Space Grotesk', sans-serif;
          font-size: 0.85rem; font-weight: 700;
          cursor: pointer; white-space: nowrap;
          transition: opacity 0.2s, transform 0.15s;
          box-shadow: 0 0 20px rgba(124,58,237,0.4);
        }
        .ai-btn:active { transform: scale(0.95); }
        .ai-btn:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }
        .ai-progress {
          height: 2px; background: rgba(167,139,250,0.15);
          border-radius: 2px; overflow: hidden; margin-bottom: 12px;
        }
        .ai-progress-fill {
          height: 100%; background: linear-gradient(90deg, #7c3aed, #22d3ee, #7c3aed);
          background-size: 200% 100%;
          animation: aiprog 1.6s ease-in-out infinite;
        }
        @keyframes aiprog { 0%{background-position:100% 0} 100%{background-position:-100% 0} }
        .ai-error {
          font-size: 0.75rem; color: var(--red);
          background: rgba(248,113,113,0.08);
          border: 1px solid rgba(248,113,113,0.2);
          border-radius: var(--r-sm); padding: 10px 12px;
          margin-bottom: 10px;
        }
        .ai-result { display:flex; flex-direction:column; gap:10px; }
        .ai-thresh-row {
          display: grid; grid-template-columns: 1fr 1fr;
          gap: 8px;
        }
        .ai-thresh-card {
          background: rgba(0,0,0,0.3);
          border: 1px solid rgba(245,158,11,0.2);
          border-radius: var(--r-sm); padding: 12px;
          text-align: center;
        }
        .ai-thresh-val {
          font-family: 'JetBrains Mono', monospace;
          font-size: 1.1rem; font-weight: 500; color: var(--gold);
          display: block; margin-bottom: 3px;
        }
        .ai-thresh-key {
          font-size: 0.62rem; color: var(--dim);
          text-transform: uppercase; letter-spacing: 0.08em;
        }
        .ai-advice-box {
          background: rgba(0,0,0,0.25);
          border: 1px solid var(--border);
          border-radius: var(--r-sm); padding: 12px 14px;
          font-size: 0.79rem; line-height: 1.65;
          color: rgba(110,231,183,0.8);
        }
        .ai-advice-label {
          font-size: 0.6rem; text-transform:uppercase; letter-spacing:0.1em;
          color: var(--dim); margin-bottom: 5px; display:block;
        }
        .ai-empty {
          font-size: 0.77rem; color: rgba(110,231,183,0.4);
          text-align: center; padding: 6px 0; line-height: 1.6;
        }

        /* ── Health + Live readings ────── */
        .health-readings {
          display: grid; grid-template-columns: auto 1fr;
          gap: 12px; margin-bottom: 12px; align-items: stretch;
        }
        .health-card {
          background: var(--surface);
          border: 1px solid var(--border2);
          border-radius: var(--r); padding: 16px;
          display: flex; flex-direction:column; align-items:center;
          gap: 8px; min-width: 120px;
          box-shadow: var(--glow-g);
        }
        .health-ring-wrap { position:relative; width:110px; height:110px; }
        .health-ring-wrap svg { width:100%; height:100%; }
        .health-score-text {
          position: absolute; inset:0; display:flex;
          flex-direction:column; align-items:center; justify-content:center;
        }
        .health-num {
          font-family: 'JetBrains Mono', monospace;
          font-size: 1.6rem; font-weight: 500; line-height:1;
        }
        .health-of {
          font-size: 0.6rem; color: var(--dim); margin-top:1px;
        }
        .health-label-text {
          font-family: 'Space Grotesk', sans-serif;
          font-size: 0.72rem; font-weight: 600; letter-spacing:0.04em;
          text-transform: uppercase;
        }
        .health-plant {
          font-size: 0.62rem; color: var(--dim);
          font-family: 'JetBrains Mono', monospace;
          text-align: center; max-width: 100px;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }

        /* ── Reading cards ─────────────── */
        .readings { display:flex; flex-direction:column; gap:10px; }
        .reading-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--r-sm); padding: 14px 16px;
          flex:1; position:relative; overflow:hidden;
        }
        .reading-label {
          font-size: 0.62rem; text-transform:uppercase;
          letter-spacing: 0.1em; color: var(--dim); margin-bottom:4px;
        }
        .reading-value-row { display:flex; align-items:baseline; gap:4px; margin-bottom:8px; }
        .reading-val {
          font-family: 'JetBrains Mono', monospace;
          font-size: 2rem; font-weight: 500; line-height:1;
        }
        .reading-unit { font-size: 0.8rem; color: var(--dim); }
        .reading-status {
          display:flex; align-items:center; gap:5px;
          font-size: 0.68rem; font-weight: 600; margin-bottom:8px;
        }
        .status-pip { width:5px; height:5px; border-radius:50%; flex-shrink:0; }
        .reading-range {
          font-size: 0.6rem; color: var(--dim);
          font-family: 'JetBrains Mono', monospace; margin-left:auto;
        }
        .bar-bg {
          height: 3px; background: rgba(255,255,255,0.06);
          border-radius: 3px; position:relative; overflow:hidden;
        }
        .bar-zone {
          position:absolute; top:0; height:100%;
          background: rgba(74,222,128,0.12); border-radius:3px;
        }
        .bar-fill {
          height:100%; border-radius:3px; position:absolute; top:0; left:0;
          transition: width 0.6s ease, background 0.4s;
        }

        /* ── RGB + Status strip ────────── */
        .status-strip {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--r); padding: 14px 16px;
          margin-bottom: 12px;
          display: flex; align-items:center; gap:12px;
        }
        .rgb-section { display:flex; align-items:center; gap:10px; flex:1; }
        .rgb-orb-wrap { position:relative; }
        .rgb-orb {
          width: 36px; height: 36px; border-radius:50%;
          transition: background 0.4s, box-shadow 0.5s;
          flex-shrink:0;
        }
        .rgb-orb-inner {
          position:absolute; inset:6px; border-radius:50%;
          background: rgba(255,255,255,0.3);
        }
        .rgb-info { display:flex; flex-direction:column; gap:2px; }
        .rgb-title { font-size:0.6rem; text-transform:uppercase; letter-spacing:0.1em; color:var(--dim); }
        .rgb-state { font-size:0.8rem; font-weight:600; font-family:'Space Grotesk',sans-serif; }
        .notif-btn {
          background: rgba(0,0,0,0.3);
          border: 1px solid var(--border);
          border-radius: var(--r-sm); padding: 7px 11px;
          font-size: 0.7rem; font-weight: 500; color: var(--muted);
          cursor: pointer; transition: all 0.2s; flex-shrink:0;
          white-space: nowrap;
        }
        .notif-btn.on { border-color: rgba(74,222,128,0.4); color: var(--green); background: rgba(74,222,128,0.07); }
        .notif-btn:active { transform: scale(0.94); }
        .ios-hint { display:flex; align-items:center; gap:5px; font-size:0.65rem; color:var(--dim); }

        /* ── Indicator row ─────────────── */
        .indicators { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:12px; }
        .ind-card {
          background: var(--surface); border: 1px solid var(--border);
          border-radius: var(--r-sm); padding: 12px 8px 10px;
          text-align:center; transition: border-color 0.3s, box-shadow 0.3s;
          cursor: default;
        }
        .ind-card.active {
          border-color: var(--ic) !important;
          box-shadow: 0 0 18px color-mix(in srgb, var(--ic) 20%, transparent) !important;
        }
        .ind-dot-wrap {
          width:36px; height:36px; border-radius:10px; margin:0 auto 6px;
          display:flex; align-items:center; justify-content:center;
          transition: background 0.3s; background: rgba(255,255,255,0.04);
          position:relative;
        }
        .ind-card.active .ind-dot-wrap {
          background: color-mix(in srgb, var(--ic) 15%, transparent);
        }
        .ind-pulse {
          position:absolute; inset:-3px; border-radius:13px;
          opacity:0.2; animation: ipulse 2s ease-in-out infinite;
        }
        @keyframes ipulse { 0%,100%{transform:scale(1);opacity:0.2} 50%{transform:scale(1.1);opacity:0.07} }
        .ind-icon { font-size:1.1rem; }
        .ind-name {
          font-size: 0.6rem; font-weight:600; text-transform:uppercase;
          letter-spacing:0.09em; color:var(--dim); margin-bottom:2px;
        }
        .ind-state {
          font-size: 0.7rem; font-weight:500; font-family:'Space Grotesk',sans-serif;
          transition: color 0.3s; color: var(--dim);
        }
        .ind-card.active .ind-state { color: var(--ic) !important; }

        /* ── Charts ────────────────────── */
        .charts { display:flex; flex-direction:column; gap:10px; margin-bottom:12px; }
        .chart-card {
          background: var(--surface); border: 1px solid var(--border);
          border-radius: var(--r); padding: 14px 16px;
        }
        .chart-top {
          display:flex; align-items:center; justify-content:space-between;
          margin-bottom: 10px;
        }
        .chart-name {
          font-size: 0.68rem; font-weight:600; text-transform:uppercase;
          letter-spacing:0.09em; color: var(--dim);
        }
        .chart-thresh {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.65rem; color: var(--dim);
        }

        /* ── Controls ──────────────────── */
        .controls-card {
          background: var(--surface); border: 1px solid var(--border);
          border-radius: var(--r); padding: 16px; margin-bottom: 12px;
        }
        .controls-title {
          font-size: 0.62rem; text-transform:uppercase; letter-spacing:0.1em;
          color: var(--dim); margin-bottom: 12px;
        }
        .ctrl-list { display:flex; flex-direction:column; gap:8px; }
        .ctrl-row {
          display:flex; align-items:center; justify-content:space-between;
          background: rgba(0,0,0,0.25); border: 1px solid var(--border);
          border-radius: var(--r-sm); padding: 12px 14px;
          transition: all 0.22s;
        }
        .ctrl-row.active-ctrl { border-color: var(--ac) !important; background: color-mix(in srgb, var(--ac) 8%, rgba(0,0,0,0.3)) !important; }
        .ctrl-row.dim { opacity:0.32; }
        .ctrl-label { font-family:'Space Grotesk',sans-serif; font-size:0.88rem; font-weight:500; }
        .ctrl-row.active-ctrl .ctrl-label { color: var(--ac); }
        .track {
          width:44px; height:26px; border-radius:13px;
          background: rgba(255,255,255,0.08);
          position:relative; transition: background 0.22s; flex-shrink:0;
        }
        .ctrl-row.active-ctrl .track { background: var(--ac) !important; }
        .thumb {
          position:absolute; top:3px; left:3px; width:20px; height:20px;
          border-radius:10px; background:white;
          box-shadow: 0 1px 4px rgba(0,0,0,0.4);
          transition: transform 0.22s;
        }
        .ctrl-row.active-ctrl .thumb { transform: translateX(18px); }
        .ctrl-hint { font-size:0.68rem; color:var(--dim); text-align:center; margin-top:10px; }

        /* ── Footer ────────────────────── */
        .footer {
          text-align:center; font-size:0.65rem; color:var(--dim);
          font-family:'JetBrains Mono',monospace; padding:4px 0;
        }

        /* ── Scrollbar ─────────────────── */
        ::-webkit-scrollbar { width:4px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:rgba(74,222,128,0.2); border-radius:4px; }

        @supports (padding: max(0px)) {
          .app { padding-bottom: max(48px, env(safe-area-inset-bottom)); }
        }
      `}</style>

      <div className="app">

        {/* ── Header ── */}
        <div className="header">
          <div className="header-brand">
            <div className="brand-leaf">🌱</div>
            <div>
              <div className="brand-name">{t.appName}</div>
              <div className="brand-sub">{t.appSub}</div>
            </div>
          </div>
          <div className="header-right">
            <div className="pill">
              <div className="pip" style={{ background: connColor, boxShadow: `0 0 6px ${connColor}` }} />
              {connLabel}
            </div>
            <button className="lang-btn" onClick={() => setLang(l => l === "en" ? "ms" : "en")}>
              {lang === "en" ? "🇲🇾 BM" : "🇬🇧 EN"}
            </button>
          </div>
        </div>

        {/* ── AI Command Center ── */}
        <div className="ai-hero">
          <div className="ai-top-row">
            <div className="ai-badge">✦ Groq AI</div>
            {thresh.plant && <div className="ai-active-tag">{thresh.plant}</div>}
          </div>
          <div className="ai-headline">{t.aiHero}</div>
          <div className="ai-subline">{t.aiSub}</div>
          <div className="ai-input-row">
            <input
              className="ai-input"
              value={plant}
              onChange={e => setPlant(e.target.value)}
              onKeyDown={e => e.key === "Enter" && askAI()}
              placeholder={t.aiPlaceholder}
            />
            <button className="ai-btn" onClick={askAI} disabled={aiLoading}>
              {aiLoading ? t.aiLoading : t.aiBtn}
            </button>
          </div>
          {aiLoading && <div className="ai-progress"><div className="ai-progress-fill"/></div>}
          {aiError && <div className="ai-error">⚠ {aiError}</div>}
          {thresh.advice ? (
            <div className="ai-result">
              <div className="ai-thresh-row">
                <div className="ai-thresh-card">
                  <span className="ai-thresh-val">{thresh.temp_low}–{thresh.temp_high}°C</span>
                  <span className="ai-thresh-key">{t.tempRange}</span>
                </div>
                <div className="ai-thresh-card">
                  <span className="ai-thresh-val">{thresh.humid_low}–{thresh.humid_high}%</span>
                  <span className="ai-thresh-key">{t.humidRange}</span>
                </div>
              </div>
              <div className="ai-advice-box">
                <span className="ai-advice-label">{t.advice}</span>
                {thresh.advice}
              </div>
            </div>
          ) : !aiLoading && (
            <p className="ai-empty">{t.aiEmpty}</p>
          )}
        </div>

        {/* ── Health + Readings ── */}
        <div className="health-readings">
          {/* Health ring */}
          <div className="health-card">
            <div className="health-ring-wrap">
              <svg viewBox="0 0 120 120">
                <circle cx="60" cy="60" r={r} fill="none"
                  stroke="rgba(255,255,255,0.05)" strokeWidth="9"
                  strokeDasharray={`${circ*0.75} ${circ}`}
                  strokeDashoffset={circ*0.125} strokeLinecap="round" />
                <circle cx="60" cy="60" r={r} fill="none"
                  stroke={health.color} strokeWidth="9"
                  strokeDasharray={`${arc} ${circ}`}
                  strokeDashoffset={circ*0.125} strokeLinecap="round"
                  style={{ filter:`drop-shadow(0 0 6px ${health.color})`, transition:"stroke-dasharray 0.8s ease, stroke 0.4s" }} />
              </svg>
              <div className="health-score-text">
                <span className="health-num" style={{color:health.color}}>{score}</span>
                <span className="health-of">/ 100</span>
              </div>
            </div>
            <div className="health-label-text" style={{color:health.color}}>{t[health.key]}</div>
            <div className="health-plant">{thresh.plant || t.noPlant}</div>
          </div>

          {/* Live readings */}
          <div className="readings">
            {[
              { key:"temperature", val:latest.temperature, unit:"°C", color:"#f87171", low:thresh.temp_low, high:thresh.temp_high },
              { key:"humidity",    val:latest.humidity,    unit:"%",  color:"#60a5fa", low:thresh.humid_low, high:thresh.humid_high },
            ].map(({ key, val, unit, color, low, high }) => {
              const ok = val >= low && val <= high;
              const sc = ok ? "#4ade80" : val < low ? "#60a5fa" : "#f87171";
              const st = ok ? t.optimal : val < low ? t.low : t.high;
              const span = (high+5)-(low-5);
              const pct = Math.min(100, Math.max(0, ((val-(low-5))/span)*100));
              const zl  = ((low-(low-5))/span)*100;
              const zw  = ((high-low)/span)*100;
              return (
                <div className="reading-card" key={key}>
                  <div className="reading-label">{t[key]}</div>
                  <div className="reading-value-row">
                    <span className="reading-val" style={{color}}>{val.toFixed(1)}</span>
                    <span className="reading-unit">{unit}</span>
                  </div>
                  <div className="reading-status">
                    <div className="status-pip" style={{background:sc, boxShadow:`0 0 5px ${sc}`}}/>
                    <span style={{color:sc}}>{st}</span>
                    <span className="reading-range">{low}–{high}{unit}</span>
                  </div>
                  <div className="bar-bg">
                    <div className="bar-zone" style={{left:`${zl}%`, width:`${zw}%`}}/>
                    <div className="bar-fill" style={{width:`${pct}%`, background:sc}}/>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Status strip ── */}
        <div className="status-strip">
          <div className="rgb-section">
            <div className="rgb-orb-wrap">
              <div className="rgb-orb" style={{ background:rgb.color, boxShadow:`0 0 18px ${rgb.color}90, 0 0 6px ${rgb.color}` }}>
                <div className="rgb-orb-inner"/>
              </div>
            </div>
            <div className="rgb-info">
              <div className="rgb-title">{t.rgbStatus}</div>
              <div className="rgb-state" style={{color:rgb.color}}>{t[rgb.key]}</div>
            </div>
          </div>
          {notifSupported ? (
            <button className={`notif-btn ${notifGranted ? "on" : ""}`}
              onClick={async () => { const ok = await requestNotif(); setNotifGranted(ok); }}>
              {notifGranted ? t.alertOn : t.alertOff}
            </button>
          ) : (
            <div className="ios-hint">🔔 {t.alertIOS}</div>
          )}
        </div>

        {/* ── Indicator row ── */}
        <div className="indicators">
          {[
            { active:fanOn,    color:"#60a5fa", icon:"💨", key:"fan",  onSub:t.running, offSub:t.idle },
            { active:pumpOn,   color:"#4ade80", icon:"💧", key:"pump", onSub:t.misting, offSub:t.idle },
            { active:autoMode, color:"#fbbf24", icon:"⚡", key:"auto", onSub:t.auto,    offSub:t.manual },
          ].map(({ active, color, icon, key, onSub, offSub }) => (
            <div key={key}
              className={`ind-card ${active?"active":""}`}
              style={{"--ic":color}}>
              <div className="ind-dot-wrap">
                {active && <div className="ind-pulse" style={{background:color}}/>}
                <span className="ind-icon">{icon}</span>
              </div>
              <div className="ind-name">{t[key]}</div>
              <div className="ind-state">{active ? onSub : offSub}</div>
            </div>
          ))}
        </div>

        {/* ── Charts ── */}
        <div className="charts">
          {[
            { dKey:"temperature", color:"#f87171", name:t.temp, unit:"°C", rLow:thresh.temp_low, rHigh:thresh.temp_high },
            { dKey:"humidity",    color:"#60a5fa", name:t.humid, unit:"%",  rLow:thresh.humid_low, rHigh:thresh.humid_high },
          ].map(({ dKey, color, name, unit, rLow, rHigh }) => (
            <div className="chart-card" key={dKey}>
              <div className="chart-top">
                <span className="chart-name">{name}</span>
                <span className="chart-thresh">{rLow}–{rHigh} {unit}</span>
              </div>
              <ResponsiveContainer width="100%" height={120}>
                <LineChart data={history.slice(-24)} margin={{top:4,right:4,left:-26,bottom:0}}>
                  <XAxis dataKey="ts" tick={{fill:"#374151",fontSize:9}} interval="preserveStartEnd"/>
                  <YAxis tick={{fill:"#374151",fontSize:9}}/>
                  <Tooltip
                    contentStyle={{background:"rgba(10,26,15,0.95)",border:"1px solid rgba(74,222,128,0.2)",borderRadius:10,fontSize:12}}
                    labelStyle={{color:"#6ee7b7"}} itemStyle={{color}}/>
                  <ReferenceLine y={rHigh} stroke={color} strokeDasharray="3 3" strokeOpacity={0.4}/>
                  <ReferenceLine y={rLow}  stroke={color} strokeDasharray="3 3" strokeOpacity={0.4}/>
                  <Line type="monotone" dataKey={dKey} stroke={color} strokeWidth={2}
                    dot={false} activeDot={{r:4,fill:color,strokeWidth:0}}/>
                </LineChart>
              </ResponsiveContainer>
            </div>
          ))}
        </div>

        {/* ── Controls ── */}
        <div className="controls-card">
          <div className="controls-title">{t.controls}</div>
          <div className="ctrl-list">
            {[
              { active:autoMode, toggle:toggleAuto, label:t.autoMode, color:"#fbbf24", disabled:false },
              { active:fanOn,    toggle:toggleFan,  label:t.fan,      color:"#60a5fa", disabled:autoMode },
              { active:pumpOn,   toggle:togglePump, label:t.pump,     color:"#4ade80", disabled:autoMode },
            ].map(({ active, toggle, label, color, disabled }) => (
              <div key={label}
                className={`ctrl-row ${active?"active-ctrl":""} ${disabled?"dim":""}`}
                style={{"--ac":color}}
                onClick={disabled ? undefined : toggle}>
                <span className="ctrl-label">{label}</span>
                <div className="track">
                  <div className="thumb"/>
                </div>
              </div>
            ))}
          </div>
          {autoMode && <div className="ctrl-hint">{t.manualHint}</div>}
        </div>

        <div className="footer">{t.updated} {latest.ts || "--"}</div>
      </div>
    </>
  );
}
