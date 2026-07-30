import { useState, useEffect, useRef, useCallback } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

// ── i18n ──────────────────────────────────────────────────────
const T = {
  en: {
    sub:"Smart Greenhouse",
    live:"Live", espOff:"Sensor offline", netOff:"Offline",
    temp:"Temperature", humid:"Humidity",
    optimal:"In range", low:"Below range", high:"Above range",
    fan:"Fan", pump:"Pump", auto:"Auto",
    running:"Running", misting:"Misting", idle:"Idle", manual:"Manual",
    controls:"Controls", autoMode:"Automatic",
    fanCtrl:"Fan", pumpCtrl:"Pump",
    autoHint:"Disable Auto to control manually",
    aiTitle:"Plant AI", aiBy:"Groq · LLaMA-3.3-70B",
    aiPlaceholder:"What are you growing? — tomato, orchid, basil…",
    aiBtn:"Set thresholds",
    aiLoading:"Thinking…",
    aiAdviceLabel:"Care notes",
    aiEmpty:"Name a plant above and the AI will set the right conditions.",
    aiFail:"AI unavailable — check GROQ_API_KEY on backend.",
    activeFor:"Tuned for",
    thriving:"Thriving", good:"Good", fair:"Fair", stressed:"Stressed",
    health:"Plant health",
    standby:"Standby", fanAct:"Running", pumpAct:"Misting",
    fanPump:"Fan + Pump", manMode:"Manual",
    alertOn:"Alerts on", alertOff:"Enable alerts",
    alertIOS:"Add to Home Screen for alerts",
    rgbLabel:"Device",
    updated:"Updated",
  },
  ms: {
    sub:"Rumah Hijau Pintar",
    live:"Langsung", espOff:"Penderia luar talian", netOff:"Luar Talian",
    temp:"Suhu", humid:"Kelembapan",
    optimal:"Dalam julat", low:"Terlalu rendah", high:"Terlalu tinggi",
    fan:"Kipas", pump:"Pam", auto:"Auto",
    running:"Berjalan", misting:"Menyembur", idle:"Rehat", manual:"Manual",
    controls:"Kawalan", autoMode:"Automatik",
    fanCtrl:"Kipas", pumpCtrl:"Pam",
    autoHint:"Nyahaktifkan Auto untuk kawal sendiri",
    aiTitle:"AI Pokok", aiBy:"Groq · LLaMA-3.3-70B",
    aiPlaceholder:"Apa yang anda tanam? — tomato, orkid, selasih…",
    aiBtn:"Tetap ambang",
    aiLoading:"Sedang berfikir…",
    aiAdviceLabel:"Nota penjagaan",
    aiEmpty:"Namakan pokok di atas dan AI akan tetapkan keadaan yang betul.",
    aiFail:"AI tidak tersedia — semak GROQ_API_KEY.",
    activeFor:"Diselaraskan untuk",
    thriving:"Subur", good:"Baik", fair:"Sederhana", stressed:"Tertekan",
    health:"Kesihatan pokok",
    standby:"Sedia", fanAct:"Berjalan", pumpAct:"Menyembur",
    fanPump:"Kipas + Pam", manMode:"Manual",
    alertOn:"Amaran aktif", alertOff:"Aktifkan amaran",
    alertIOS:"Tambah ke Skrin Utama",
    rgbLabel:"Peranti",
    updated:"Dikemas kini",
  },
};

// ── Notifications ─────────────────────────────────────────────
async function requestNotif() {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  return (await Notification.requestPermission()) === "granted";
}
function notify(title, body) {
  if (Notification.permission === "granted")
    new Notification(title, { body, icon: "/icon-192.png" });
}

// ── Health ────────────────────────────────────────────────────
function calcHealth(temp, humid, th) {
  let s = 100;
  if (temp  > th.temp_high)  s -= Math.min(40, (temp  - th.temp_high)  * 9);
  if (temp  < th.temp_low)   s -= Math.min(40, (th.temp_low  - temp)   * 9);
  if (humid > th.humid_high) s -= Math.min(30, (humid - th.humid_high) * 3);
  if (humid < th.humid_low)  s -= Math.min(30, (th.humid_low  - humid) * 3);
  return Math.max(0, Math.round(s));
}
function healthMeta(score, t) {
  if (score >= 85) return { label: t.thriving, color: "#8FAF6A" };
  if (score >= 65) return { label: t.good,     color: "#A8C572" };
  if (score >= 40) return { label: t.fair,     color: "#C4956A" };
  return               { label: t.stressed, color: "#C4614A" };
}
function getRGB(fanOn, pumpOn, auto_, t) {
  if (!auto_)           return { color: "#9B8AC4", label: t.manMode };
  if (fanOn && pumpOn)  return { color: "#6AB8C4", label: t.fanPump };
  if (fanOn)            return { color: "#6A94C4", label: t.fanAct };
  if (pumpOn)           return { color: "#8FAF6A", label: t.pumpAct };
  return                       { color: "#6B5A3E", label: t.standby };
}

// ── Main App ──────────────────────────────────────────────────
export default function App() {
  const [lang, setLang]     = useState(() => localStorage.getItem("aip_lang") || "en");
  const t = T[lang];
  const [latest, setLatest] = useState({ temperature:0, humidity:0, fan:false, pump:false, auto:true, ts:"--" });
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
  const prevRef    = useRef({ fan: false, pump: false, health: 100 });
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
    const prev = prevRef.current;
    if (fanOn && !prev.fan)           notify("🌿 AI Planter", `${t.fan} on`);
    if (!fanOn && prev.fan)           notify("🌿 AI Planter", `${t.fan} off`);
    if (pumpOn && !prev.pump)         notify("🌿 AI Planter", `${t.pump} on`);
    if (!pumpOn && prev.pump)         notify("🌿 AI Planter", `${t.pump} off`);
    if (score < 40 && prev.health >= 40) notify("🌿 AI Planter", `${t.stressed} — ${score}/100`);
    prevRef.current = { fan: fanOn, pump: pumpOn, health: score };
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
      } else if (ts === lastTsRef.current && ts !== "--") { setEspOk(false); }
    } catch { setBackendOk(false); setEspOk(false); }
  }, []);

  useEffect(() => { poll(); const id = setInterval(poll, 5000); return () => clearInterval(id); }, [poll]);

  const clearPend = k => setTimeout(() => { pendingRef.current = { ...pendingRef.current, [k]: undefined }; }, 8000);
  const send = p => fetch(`${API}/control`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(p) });

  const toggleAuto = () => {
    const n = !autoMode; setAutoMode(n);
    pendingRef.current.auto = n; clearPend("auto"); send({ auto: n });
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
      if (d.thresholds) { setThresh(d.thresholds); notify("🌿 AI Planter", `Set for ${plant}`); }
    } catch { setAiError(t.aiFail); }
    setAiLoading(false);
  };

  const connLabel = !backendOk ? t.netOff : !espOk ? t.espOff : t.live;
  const connColor = espOk ? "#8FAF6A" : backendOk ? "#C4956A" : "#C4614A";

  // Health ring
  const R = 42, C2 = 2 * Math.PI * R;
  const arc = (score / 100) * C2 * 0.75;

  // Bar helper
  const bar = (val, low, high, color) => {
    const min = low - 4, max = high + 4, span = max - min;
    const pct = Math.min(100, Math.max(0, ((val - min) / span) * 100));
    const zl  = ((low - min) / span) * 100;
    const zw  = ((high - low) / span) * 100;
    return { pct, zl, zw };
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;1,400;1,600&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --soil:      #1C1208;
          --bark:      #2D1E0F;
          --heartwood: #3D2B14;
          --border:    #4A3520;
          --sage:      #8FAF6A;
          --terra:     #C4956A;
          --grass:     #D4C9A8;
          --mulch:     #7A6A4E;
          --moss:      #5A7A3A;
          --dew:       #6AB8A0;
          --sky:       #7AAED4;
          --clay:      #C4614A;

          --depth-1: 0 2px 8px rgba(0,0,0,0.4), 0 1px 3px rgba(0,0,0,0.3);
          --depth-2: 0 8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3), inset 0 1px 0 rgba(212,201,168,0.04);
          --depth-3: 0 16px 48px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(212,201,168,0.06);

          --r:    16px;
          --r-sm: 10px;
          --r-xs: 7px;
        }

        html { -webkit-text-size-adjust: 100%; }

        body {
          background: var(--soil);
          background-image:
            radial-gradient(ellipse 70% 50% at 10% 0%,  rgba(143,175,106,0.06) 0%, transparent 55%),
            radial-gradient(ellipse 50% 60% at 90% 100%, rgba(196,149,106,0.05) 0%, transparent 55%),
            url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E");
          background-attachment: fixed;
          color: var(--grass);
          font-family: 'DM Sans', -apple-system, sans-serif;
          min-height: 100dvh;
          overscroll-behavior: none;
        }

        .wrap {
          max-width: 430px;
          margin: 0 auto;
          padding: 0 14px 56px;
          padding-top: max(18px, env(safe-area-inset-top, 18px));
        }

        /* ── Spatial card ── */
        .card {
          background: var(--bark);
          border: 1px solid var(--border);
          border-radius: var(--r);
          box-shadow: var(--depth-2);
          position: relative;
          overflow: hidden;
        }
        .card::before {
          content: "";
          position: absolute; inset: 0;
          background: linear-gradient(135deg, rgba(212,201,168,0.03) 0%, transparent 60%);
          pointer-events: none;
          border-radius: inherit;
        }
        .card-inner {
          background: var(--heartwood);
          border: 1px solid var(--border);
          border-radius: var(--r-sm);
          box-shadow: var(--depth-1);
          position: relative;
        }

        /* ── Typography ── */
        .display {
          font-family: 'Playfair Display', Georgia, serif;
          font-style: italic;
        }
        .mono { font-family: 'DM Mono', monospace; }
        .label-xs {
          font-size: 10px; font-weight: 500; letter-spacing: 0.1em;
          text-transform: uppercase; color: var(--mulch);
        }

        /* ── Header ── */
        .hdr {
          display: flex; align-items: center;
          justify-content: space-between;
          padding-bottom: 16px;
        }
        .hdr-brand { display: flex; align-items: center; gap: 10px; }
        .brand-mark {
          width: 34px; height: 34px; border-radius: 10px;
          background: linear-gradient(145deg, var(--moss), var(--sage));
          display: flex; align-items: center; justify-content: center;
          font-size: 17px; box-shadow: var(--depth-1), 0 0 12px rgba(143,175,106,0.2);
        }
        .brand-name { font-size: 15px; font-weight: 600; color: var(--grass); }
        .brand-tag  { font-size: 10px; color: var(--mulch); margin-top: 1px; }
        .hdr-right  { display: flex; align-items: center; gap: 7px; }

        .status-pill {
          display: flex; align-items: center; gap: 5px;
          background: var(--bark); border: 1px solid var(--border);
          border-radius: 20px; padding: 5px 11px;
          font-size: 10px; font-weight: 500; color: var(--mulch);
          box-shadow: var(--depth-1);
        }
        .pip { width: 6px; height: 6px; border-radius: 50%; }
        .pip.live { animation: breathe 3s ease-in-out infinite; }
        @keyframes breathe { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.6;transform:scale(0.85)} }

        .lang-pill {
          background: var(--bark); border: 1px solid var(--border);
          border-radius: 20px; padding: 5px 11px;
          font-size: 10px; font-weight: 600; color: var(--mulch);
          cursor: pointer; box-shadow: var(--depth-1); transition: all 0.15s;
        }
        .lang-pill:active { transform: scale(0.93); }

        /* ── Section gap ── */
        .gap { margin-bottom: 10px; }

        /* ── AI Panel ── */
        .ai-panel { padding: 18px; }
        .ai-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 12px; }
        .ai-title { font-size: 16px; font-weight: 600; color: var(--grass); }
        .ai-by    { font-size: 10px; color: var(--mulch); }
        .ai-active {
          font-size: 10px; font-family: 'DM Mono', monospace;
          color: var(--terra); background: rgba(196,149,106,0.1);
          border: 1px solid rgba(196,149,106,0.2);
          border-radius: 6px; padding: 2px 8px;
        }
        .ai-row { display: flex; gap: 8px; margin-bottom: 12px; }
        .ai-input {
          flex: 1; background: var(--heartwood);
          border: 1px solid var(--border); border-radius: var(--r-sm);
          padding: 11px 13px; color: var(--grass);
          font-family: 'DM Sans', sans-serif; font-size: 14px;
          outline: none; transition: border-color 0.2s, box-shadow 0.2s;
          -webkit-appearance: none; box-shadow: var(--depth-1);
        }
        .ai-input::placeholder { color: var(--mulch); }
        .ai-input:focus {
          border-color: rgba(196,149,106,0.5);
          box-shadow: var(--depth-1), 0 0 0 3px rgba(196,149,106,0.1);
        }
        .ai-btn {
          background: linear-gradient(135deg, #5A3A1A, #7A5530);
          color: var(--terra); border: 1px solid rgba(196,149,106,0.3);
          border-radius: var(--r-sm); padding: 11px 16px;
          font-family: 'DM Sans', sans-serif; font-size: 13px;
          font-weight: 600; cursor: pointer; white-space: nowrap;
          transition: opacity 0.18s, transform 0.12s;
          box-shadow: var(--depth-1), 0 0 16px rgba(196,149,106,0.12);
        }
        .ai-btn:active { transform: scale(0.96); }
        .ai-btn:disabled { opacity: 0.45; cursor: not-allowed; transform: none; }

        .ai-prog {
          height: 2px; background: rgba(196,149,106,0.1);
          border-radius: 2px; overflow: hidden; margin-bottom: 12px;
        }
        .ai-prog-fill {
          height: 100%; width: 40%;
          background: linear-gradient(90deg, transparent, var(--terra), transparent);
          animation: sweep 1.6s ease-in-out infinite;
        }
        @keyframes sweep { 0%{transform:translateX(-150%)} 100%{transform:translateX(350%)} }

        .ai-err {
          font-size: 12px; color: var(--clay); margin-bottom: 10px;
          padding: 9px 12px; background: rgba(196,97,74,0.08);
          border: 1px solid rgba(196,97,74,0.2); border-radius: var(--r-xs);
        }
        .ai-result { display: flex; flex-direction: column; gap: 8px; }
        .ai-thresh-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .ai-thresh-item {
          padding: 12px 14px;
          background: var(--heartwood); border: 1px solid var(--border);
          border-radius: var(--r-sm); box-shadow: var(--depth-1);
        }
        .ai-thresh-val {
          font-family: 'Playfair Display', serif;
          font-size: 18px; font-weight: 600; color: var(--terra);
          display: block; margin-bottom: 2px;
        }
        .ai-advice-box {
          padding: 13px 14px;
          background: var(--heartwood); border: 1px solid var(--border);
          border-radius: var(--r-sm); box-shadow: var(--depth-1);
        }
        .ai-advice-text {
          font-size: 12.5px; line-height: 1.68; color: var(--mulch);
          font-style: italic; font-family: 'Playfair Display', serif;
        }
        .ai-empty { font-size: 12.5px; color: var(--mulch); text-align: center; padding: 4px 0; line-height: 1.6; }

        /* ── Sensor hero ── */
        .sensor-hero {
          display: grid; grid-template-columns: 1fr 1fr;
          gap: 1px; background: var(--border);
          border-radius: var(--r); overflow: hidden;
          box-shadow: var(--depth-2);
        }
        .sensor-cell {
          background: var(--bark); padding: 20px 18px 16px;
          position: relative;
        }
        .sensor-cell::after {
          content: "";
          position: absolute; inset: 0;
          background: linear-gradient(160deg, rgba(212,201,168,0.03) 0%, transparent 50%);
          pointer-events: none;
        }
        .sensor-eyebrow { margin-bottom: 10px; }
        .sensor-number {
          font-family: 'Playfair Display', Georgia, serif;
          font-style: italic;
          font-size: 54px; font-weight: 400; line-height: 1;
          letter-spacing: -0.02em; margin-bottom: 0;
        }
        .sensor-unit {
          font-size: 16px; color: var(--mulch);
          font-family: 'DM Mono', monospace; margin-left: 2px;
          vertical-align: super; font-size: 13px;
        }
        .sensor-status {
          display: flex; align-items: center; gap: 5px;
          margin-top: 8px; margin-bottom: 7px;
          font-size: 11px; font-weight: 500;
        }
        .sensor-bar-bg {
          height: 3px; background: rgba(255,255,255,0.05);
          border-radius: 3px; position: relative; overflow: hidden;
        }
        .sensor-bar-zone {
          position: absolute; top: 0; height: 100%;
          background: rgba(143,175,106,0.15); border-radius: 3px;
        }
        .sensor-bar-fill {
          position: absolute; top: 0; left: 0; height: 100%;
          border-radius: 3px; transition: width 0.7s cubic-bezier(0.4,0,0.2,1), background 0.4s;
        }
        .sensor-range {
          font-size: 9px; font-family: 'DM Mono', monospace;
          color: var(--border); margin-top: 5px;
        }

        /* ── Health + Status row ── */
        .health-status-row {
          display: grid; grid-template-columns: 1fr 1fr;
          gap: 10px;
        }
        /* Health card */
        .health-card { padding: 16px 14px; }
        .health-ring-wrap { position: relative; width: 90px; height: 90px; margin: 0 auto 8px; }
        .health-ring-wrap svg { width: 100%; height: 100%; overflow: visible; }
        .health-overlay {
          position: absolute; inset: 0;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
        }
        .health-num {
          font-family: 'Playfair Display', serif; font-style: italic;
          font-size: 24px; font-weight: 600; line-height: 1;
        }
        .health-denom { font-size: 9px; color: var(--mulch); margin-top: 1px; }
        .health-label { font-size: 12px; font-weight: 600; text-align: center; margin-bottom: 3px; }
        .health-plant { font-size: 10px; color: var(--mulch); text-align: center; font-family: 'DM Mono', monospace; }

        /* Status card */
        .status-card { padding: 16px 14px; display: flex; flex-direction: column; justify-content: space-between; }
        .rgb-wrap { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
        .rgb-sphere {
          width: 38px; height: 38px; border-radius: 50%; flex-shrink: 0;
          transition: background 0.5s, box-shadow 0.5s;
          position: relative;
        }
        .rgb-sphere::after {
          content: "";
          position: absolute; top: 18%; left: 22%; width: 30%; height: 25%;
          background: rgba(255,255,255,0.25);
          border-radius: 50%; filter: blur(2px);
        }
        .rgb-state { font-size: 13px; font-weight: 500; }
        .notif-btn {
          width: 100%; background: var(--heartwood);
          border: 1px solid var(--border); border-radius: var(--r-xs);
          padding: 8px; font-size: 11px; font-weight: 500;
          color: var(--mulch); cursor: pointer; text-align: center;
          transition: all 0.18s; font-family: 'DM Sans', sans-serif;
          box-shadow: var(--depth-1);
        }
        .notif-btn.on { color: var(--sage); border-color: rgba(143,175,106,0.35); }
        .notif-btn:active { transform: scale(0.97); }
        .ios-hint { font-size: 10px; color: var(--mulch); text-align: center; line-height: 1.4; }

        /* ── Indicators ── */
        .inds { display: grid; grid-template-columns: repeat(3,1fr); gap: 8px; }
        .ind {
          padding: 12px 8px 10px; text-align: center;
          transition: border-color 0.3s, box-shadow 0.3s;
        }
        .ind.on {
          border-color: var(--ic) !important;
          box-shadow: var(--depth-1), 0 0 20px color-mix(in srgb, var(--ic) 20%, transparent) !important;
        }
        .ind-orb-wrap {
          width: 38px; height: 38px; border-radius: 50%;
          margin: 0 auto 7px; display: flex; align-items: center; justify-content: center;
          background: rgba(255,255,255,0.03);
          transition: background 0.3s, box-shadow 0.3s;
          font-size: 16px; position: relative;
        }
        .ind.on .ind-orb-wrap {
          background: color-mix(in srgb, var(--ic) 15%, transparent);
          box-shadow: 0 0 16px color-mix(in srgb, var(--ic) 30%, transparent);
        }
        .ind-glow {
          position: absolute; inset: -4px; border-radius: 50%;
          opacity: 0; transition: opacity 0.3s;
          animation: none;
        }
        .ind.on .ind-glow { opacity: 1; animation: orglow 2.5s ease-in-out infinite; }
        @keyframes orglow { 0%,100%{opacity:0.3;transform:scale(1)} 50%{opacity:0.1;transform:scale(1.15)} }
        .ind-name  { font-size: 9px; color: var(--mulch); text-transform: uppercase; letter-spacing: 0.09em; margin-bottom: 2px; }
        .ind-state { font-size: 11px; font-weight: 500; color: var(--mulch); transition: color 0.3s; }
        .ind.on .ind-state { color: var(--ic); }

        /* ── Charts ── */
        .charts { display: flex; flex-direction: column; gap: 10px; }
        .chart-card { padding: 16px 14px; }
        .chart-hdr { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 12px; }
        .chart-name { font-size: 12px; font-weight: 500; color: var(--mulch); }
        .chart-range { font-size: 10px; font-family: 'DM Mono', monospace; color: var(--border); }

        /* ── Controls ── */
        .ctrl-card { padding: 16px 14px; }
        .ctrl-list { display: flex; flex-direction: column; gap: 6px; margin-top: 12px; }
        .ctrl-row {
          display: flex; align-items: center; justify-content: space-between;
          padding: 12px 14px; border-radius: var(--r-sm);
          background: var(--heartwood); border: 1px solid var(--border);
          cursor: pointer; transition: all 0.2s; box-shadow: var(--depth-1);
          user-select: none;
        }
        .ctrl-row:active:not(.ctrl-dim) { transform: scale(0.985); }
        .ctrl-row.ctrl-dim { cursor: default; opacity: 0.38; }
        .ctrl-row.ctrl-on { border-color: var(--ac) !important; background: color-mix(in srgb, var(--ac) 8%, var(--heartwood)) !important; }
        .ctrl-left { display: flex; align-items: center; gap: 10px; }
        .ctrl-pip {
          width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
          transition: background 0.25s, box-shadow 0.25s;
        }
        .ctrl-row.ctrl-on .ctrl-pip { box-shadow: 0 0 8px var(--ac); }
        .ctrl-name { font-size: 14px; color: var(--grass); }
        .ctrl-row.ctrl-on .ctrl-name { color: var(--ac); font-weight: 500; }
        .ctrl-row.ctrl-dim .ctrl-name { color: var(--mulch); }

        /* iOS-style toggle */
        .toggle {
          width: 44px; height: 26px; border-radius: 13px;
          background: var(--border); flex-shrink: 0;
          position: relative; transition: background 0.22s;
        }
        .toggle.on { background: var(--ac); box-shadow: 0 0 10px color-mix(in srgb, var(--ac) 40%, transparent); }
        .toggle-thumb {
          position: absolute; top: 3px; left: 3px;
          width: 20px; height: 20px; border-radius: 10px;
          background: var(--grass); box-shadow: 0 1px 4px rgba(0,0,0,0.4);
          transition: transform 0.22s;
        }
        .toggle.on .toggle-thumb { transform: translateX(18px); }

        .ctrl-hint { font-size: 11px; color: var(--mulch); text-align: center; margin-top: 8px; }

        /* ── Footer ── */
        .footer {
          text-align: center; font-size: 10px; color: var(--border);
          font-family: 'DM Mono', monospace; padding: 6px 0 2px;
        }

        /* ── Divider ── */
        hr { border: none; border-top: 1px solid var(--border); margin: 0; }

        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }

        @supports (padding: max(0px)) {
          .wrap { padding-bottom: max(56px, env(safe-area-inset-bottom, 20px)); }
        }

        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after { animation: none !important; transition-duration: 0.01ms !important; }
        }
      `}</style>

      <div className="wrap">

        {/* Header */}
        <header className="hdr">
          <div className="hdr-brand">
            <div className="brand-mark">🌿</div>
            <div>
              <div className="brand-name">AI Planter</div>
              <div className="brand-tag">{t.sub}</div>
            </div>
          </div>
          <div className="hdr-right">
            <div className="status-pill">
              <div className={`pip ${espOk ? "live" : ""}`} style={{ background: connColor, boxShadow: espOk ? `0 0 5px ${connColor}` : "none" }}/>
              {connLabel}
            </div>
            <button className="lang-pill" onClick={() => setLang(l => l === "en" ? "ms" : "en")}>
              {lang === "en" ? "BM" : "EN"}
            </button>
          </div>
        </header>

        {/* AI Panel */}
        <div className="card gap">
          <div className="ai-panel">
            <div className="ai-head">
              <div>
                <div className="ai-title">{t.aiTitle}</div>
                <div className="ai-by">{t.aiBy}</div>
              </div>
              {thresh.plant && <div className="ai-active">{thresh.plant}</div>}
            </div>
            <div className="ai-row">
              <input className="ai-input" value={plant}
                onChange={e => setPlant(e.target.value)}
                onKeyDown={e => e.key === "Enter" && askAI()}
                placeholder={t.aiPlaceholder}/>
              <button className="ai-btn" onClick={askAI} disabled={aiLoading}>
                {aiLoading ? t.aiLoading : t.aiBtn}
              </button>
            </div>
            {aiLoading && <div className="ai-prog"><div className="ai-prog-fill"/></div>}
            {aiError && <div className="ai-err">⚠ {aiError}</div>}
            {thresh.advice ? (
              <div className="ai-result">
                <div className="ai-thresh-row">
                  <div className="ai-thresh-item">
                    <span className="ai-thresh-val">{thresh.temp_low}–{thresh.temp_high}°C</span>
                    <span className="label-xs">{t.temp}</span>
                  </div>
                  <div className="ai-thresh-item">
                    <span className="ai-thresh-val">{thresh.humid_low}–{thresh.humid_high}%</span>
                    <span className="label-xs">{t.humid}</span>
                  </div>
                </div>
                <div className="ai-advice-box">
                  <div className="label-xs" style={{marginBottom:6}}>{t.aiAdviceLabel}</div>
                  <div className="ai-advice-text">{thresh.advice}</div>
                </div>
              </div>
            ) : !aiLoading && <p className="ai-empty">{t.aiEmpty}</p>}
          </div>
        </div>

        {/* Sensor Hero */}
        <div className="sensor-hero gap">
          {[
            { key:"temperature", val:latest.temperature, unit:"°C", color:"#C4956A", low:thresh.temp_low, high:thresh.temp_high },
            { key:"humidity",    val:latest.humidity,    unit:"%",  color:"#7AAED4", low:thresh.humid_low, high:thresh.humid_high },
          ].map(({ key, val, unit, color, low, high }) => {
            const ok = val >= low && val <= high;
            const sc = ok ? "#8FAF6A" : val < low ? "#7AAED4" : "#C4614A";
            const st = ok ? t.optimal : val < low ? t.low : t.high;
            const { pct, zl, zw } = bar(val, low, high, sc);
            return (
              <div className="sensor-cell" key={key}>
                <div className="label-xs sensor-eyebrow">{t[key]}</div>
                <div>
                  <span className="sensor-number" style={{ color }}>{val.toFixed(1)}</span>
                  <span className="sensor-unit">{unit}</span>
                </div>
                <div className="sensor-status">
                  <div className="pip" style={{ background: sc }}/>
                  <span style={{ color: sc }}>{st}</span>
                </div>
                <div className="sensor-bar-bg">
                  <div className="sensor-bar-zone" style={{ left:`${zl}%`, width:`${zw}%` }}/>
                  <div className="sensor-bar-fill" style={{ width:`${pct}%`, background: sc }}/>
                </div>
                <div className="sensor-range mono">{low}–{high}{unit}</div>
              </div>
            );
          })}
        </div>

        {/* Health + Status */}
        <div className="health-status-row gap">
          {/* Health ring */}
          <div className="card health-card">
            <div className="label-xs" style={{marginBottom:10}}>{t.health}</div>
            <div className="health-ring-wrap">
              <svg viewBox="0 0 100 100">
                <circle cx="50" cy="50" r={R} fill="none"
                  stroke="rgba(255,255,255,0.04)" strokeWidth="7"
                  strokeDasharray={`${C2*0.75} ${C2}`}
                  strokeDashoffset={C2*0.125} strokeLinecap="round"/>
                <circle cx="50" cy="50" r={R} fill="none"
                  stroke={health.color} strokeWidth="7"
                  strokeDasharray={`${arc} ${C2}`}
                  strokeDashoffset={C2*0.125} strokeLinecap="round"
                  style={{ filter:`drop-shadow(0 0 4px ${health.color}80)`, transition:"stroke-dasharray 0.8s cubic-bezier(0.4,0,0.2,1), stroke 0.4s" }}/>
              </svg>
              <div className="health-overlay">
                <div className="health-num" style={{color:health.color}}>{score}</div>
                <div className="health-denom label-xs">/ 100</div>
              </div>
            </div>
            <div className="health-label" style={{color:health.color}}>{health.label}</div>
            <div className="health-plant">{thresh.plant || "—"}</div>
          </div>

          {/* Status / RGB / Notifications */}
          <div className="card status-card">
            <div>
              <div className="label-xs" style={{marginBottom:10}}>{t.rgbLabel}</div>
              <div className="rgb-wrap">
                <div className="rgb-sphere" style={{
                  background: `radial-gradient(circle at 35% 35%, color-mix(in srgb, ${rgb.color} 70%, white), ${rgb.color})`,
                  boxShadow: rgb.color !== "#6B5A3E"
                    ? `0 0 20px ${rgb.color}60, 0 0 6px ${rgb.color}40, inset 0 1px 2px rgba(255,255,255,0.15)`
                    : `var(--depth-1), inset 0 1px 2px rgba(255,255,255,0.05)`,
                }}/>
                <div>
                  <div className="rgb-state" style={{color: rgb.color !== "#6B5A3E" ? rgb.color : "var(--mulch)"}}>{rgb.label}</div>
                  <div className="label-xs" style={{marginTop:2}}>{t.rgbLabel}</div>
                </div>
              </div>
            </div>
            {notifSupported ? (
              <button className={`notif-btn ${notifGranted ? "on" : ""}`}
                onClick={async () => { const ok = await requestNotif(); setNotifGranted(ok); }}>
                {notifGranted ? `🔔 ${t.alertOn}` : `🔕 ${t.alertOff}`}
              </button>
            ) : <div className="ios-hint">{t.alertIOS}</div>}
          </div>
        </div>

        {/* Indicators */}
        <div className="inds gap">
          {[
            { on:fanOn,    color:"#7AAED4", icon:"🍃", name:t.fan,  stOn:t.running, stOff:t.idle },
            { on:pumpOn,   color:"#6AB8A0", icon:"💧", name:t.pump, stOn:t.misting, stOff:t.idle },
            { on:autoMode, color:"#C4956A", icon:"✦",  name:t.auto, stOn:t.auto,    stOff:t.manual },
          ].map(({ on, color, icon, name, stOn, stOff }) => (
            <div key={name} className={`card ind ${on ? "on" : ""}`} style={{"--ic": color}}>
              <div className="ind-orb-wrap">
                {on && <div className="ind-glow" style={{background: color}}/>}
                <span>{icon}</span>
              </div>
              <div className="ind-name">{name}</div>
              <div className="ind-state">{on ? stOn : stOff}</div>
            </div>
          ))}
        </div>

        {/* Charts */}
        <div className="charts gap">
          {[
            { dKey:"temperature", color:"#C4956A", name:t.temp, unit:"°C", lo:thresh.temp_low, hi:thresh.temp_high },
            { dKey:"humidity",    color:"#7AAED4", name:t.humid, unit:"%",  lo:thresh.humid_low, hi:thresh.humid_high },
          ].map(({ dKey, color, name, unit, lo, hi }) => (
            <div className="card chart-card" key={dKey}>
              <div className="chart-hdr">
                <span className="chart-name">{name}</span>
                <span className="chart-range">{lo}–{hi} {unit}</span>
              </div>
              <ResponsiveContainer width="100%" height={100}>
                <LineChart data={history.slice(-24)} margin={{top:2,right:2,left:-30,bottom:0}}>
                  <XAxis dataKey="ts" tick={{fill:"#4A3520",fontSize:8}} interval="preserveStartEnd" axisLine={false} tickLine={false}/>
                  <YAxis tick={{fill:"#4A3520",fontSize:8}} axisLine={false} tickLine={false}/>
                  <Tooltip
                    contentStyle={{background:"#2D1E0F",border:"1px solid #4A3520",borderRadius:8,fontSize:11,boxShadow:"0 8px 24px rgba(0,0,0,0.4)"}}
                    labelStyle={{color:"#7A6A4E"}} itemStyle={{color}}
                    cursor={{stroke:"#4A3520",strokeWidth:1}}/>
                  <ReferenceLine y={hi} stroke={color} strokeDasharray="3 3" strokeOpacity={0.3} strokeWidth={1}/>
                  <ReferenceLine y={lo} stroke={color} strokeDasharray="3 3" strokeOpacity={0.3} strokeWidth={1}/>
                  <Line type="monotone" dataKey={dKey} stroke={color} strokeWidth={1.8}
                    dot={false} activeDot={{r:4, fill:color, strokeWidth:0}}/>
                </LineChart>
              </ResponsiveContainer>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div className="card ctrl-card gap">
          <div className="label-xs">{t.controls}</div>
          <div className="ctrl-list">
            {[
              { on:autoMode, toggle:toggleAuto, name:t.autoMode, color:"#C4956A", disabled:false },
              { on:fanOn,    toggle:toggleFan,  name:t.fanCtrl,  color:"#7AAED4", disabled:autoMode },
              { on:pumpOn,   toggle:togglePump, name:t.pumpCtrl, color:"#6AB8A0", disabled:autoMode },
            ].map(({ on, toggle, name, color, disabled }) => (
              <div key={name}
                className={`ctrl-row ${on && !disabled ? "ctrl-on" : ""} ${disabled ? "ctrl-dim" : ""}`}
                style={{"--ac": color}}
                onClick={disabled ? undefined : toggle}>
                <div className="ctrl-left">
                  <div className="ctrl-pip" style={{
                    background: on && !disabled ? color : "var(--border)",
                    boxShadow: on && !disabled ? `0 0 7px ${color}` : "none"
                  }}/>
                  <span className="ctrl-name">{name}</span>
                </div>
                <div className={`toggle ${on && !disabled ? "on" : ""}`} style={{"--ac": color}}>
                  <div className="toggle-thumb"/>
                </div>
              </div>
            ))}
          </div>
          {autoMode && <div className="ctrl-hint">{t.autoHint}</div>}
        </div>

        <div className="footer">{t.updated} {latest.ts || "—"}</div>
      </div>
    </>
  );
}
