import { useState, useEffect, useRef, useCallback } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

// ── i18n ─────────────────────────────────────
const T = {
  en: {
    sub:"Smart Greenhouse",
    live:"Live", espOff:"Sensor offline", netOff:"Offline",
    temp:"Temperature", humid:"Humidity",
    optimal:"Within range", low:"Below range", high:"Above range",
    fan:"Fan", pump:"Pump", auto:"Auto",
    running:"Running", misting:"Misting", idle:"Idle", manual:"Manual",
    controls:"Controls",
    autoMode:"Automatic", fanCtrl:"Fan", pumpCtrl:"Pump",
    autoHint:"Disable Auto to control manually",
    aiTitle:"Plant AI", aiBy:"Powered by Groq",
    aiPlaceholder:"Enter plant name — tomato, orchid, basil…",
    aiBtn:"Optimise",
    aiLoading:"Thinking…",
    aiAdvice:"Recommendations",
    aiEmpty:"Enter a plant name to receive AI-optimised thresholds.",
    aiFail:"AI unavailable — check GROQ_API_KEY on backend.",
    activeFor:"Optimised for",
    thriving:"Thriving", good:"Good", fair:"Fair", stressed:"Stressed",
    health:"Plant Health",
    standby:"Standby", fanAct:"Fan on", pumpAct:"Pump on",
    fanPump:"Fan + Pump", manMode:"Manual",
    alertOn:"Alerts on", alertOff:"Enable alerts",
    alertIOS:"Add to Home Screen for alerts",
    rgbLabel:"Device status",
    updated:"Last updated",
    setFor:"Thresholds set for",
  },
  ms: {
    sub:"Rumah Hijau Pintar",
    live:"Langsung", espOff:"Penderia luar talian", netOff:"Luar Talian",
    temp:"Suhu", humid:"Kelembapan",
    optimal:"Dalam julat", low:"Di bawah julat", high:"Melebihi julat",
    fan:"Kipas", pump:"Pam", auto:"Auto",
    running:"Berjalan", misting:"Menyembur", idle:"Rehat", manual:"Manual",
    controls:"Kawalan",
    autoMode:"Automatik", fanCtrl:"Kipas", pumpCtrl:"Pam",
    autoHint:"Nyahaktifkan Auto untuk kawal sendiri",
    aiTitle:"AI Pokok", aiBy:"Dikuasakan oleh Groq",
    aiPlaceholder:"Nama pokok — tomato, orkid, selasih…",
    aiBtn:"Optimumkan",
    aiLoading:"Sedang berfikir…",
    aiAdvice:"Cadangan",
    aiEmpty:"Masukkan nama pokok untuk ambang yang dioptimumkan oleh AI.",
    aiFail:"AI tidak tersedia — semak GROQ_API_KEY.",
    activeFor:"Dioptimumkan untuk",
    thriving:"Subur", good:"Baik", fair:"Sederhana", stressed:"Tertekan",
    health:"Kesihatan Pokok",
    standby:"Sedia", fanAct:"Kipas hidup", pumpAct:"Pam hidup",
    fanPump:"Kipas + Pam", manMode:"Manual",
    alertOn:"Amaran hidup", alertOff:"Aktifkan amaran",
    alertIOS:"Tambah ke Skrin Utama",
    rgbLabel:"Status peranti",
    updated:"Dikemas kini",
    setFor:"Ambang untuk",
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

// ── Health score ─────────────────────────────
function calcHealth(temp, humid, th) {
  let s = 100;
  if (temp  > th.temp_high)  s -= Math.min(40, (temp  - th.temp_high)  * 9);
  if (temp  < th.temp_low)   s -= Math.min(40, (th.temp_low  - temp)   * 9);
  if (humid > th.humid_high) s -= Math.min(30, (humid - th.humid_high) * 3);
  if (humid < th.humid_low)  s -= Math.min(30, (th.humid_low  - humid) * 3);
  return Math.max(0, Math.round(s));
}
function healthMeta(score, t) {
  if (score >= 85) return { label: t.thriving, color: "#2ECC71" };
  if (score >= 65) return { label: t.good,     color: "#84CC16" };
  if (score >= 40) return { label: t.fair,     color: "#F0B429" };
  return               { label: t.stressed, color: "#F87171" };
}

// ── RGB state ────────────────────────────────
function getRGB(fanOn, pumpOn, auto, t) {
  if (!auto)          return { color: "#A78BFA", label: t.manMode };
  if (fanOn && pumpOn) return { color: "#22D3EE", label: t.fanPump };
  if (fanOn)           return { color: "#3B82F6", label: t.fanAct };
  if (pumpOn)          return { color: "#2ECC71", label: t.pumpAct };
  return                      { color: "#374151", label: t.standby };
}

// ── Threshold bar ─────────────────────────────
function ThreshBar({ value, low, high, color }) {
  const min = low - 4, max = high + 4, span = max - min;
  const pct = Math.min(100, Math.max(0, ((value - min) / span) * 100));
  const zl  = ((low  - min) / span) * 100;
  const zw  = ((high - low) / span) * 100;
  return (
    <div style={{ height: 3, background: "#1E2025", borderRadius: 3, position: "relative", overflow: "hidden" }}>
      <div style={{ position:"absolute", top:0, left:`${zl}%`, width:`${zw}%`, height:"100%", background: "rgba(255,255,255,0.06)", borderRadius: 3 }}/>
      <div style={{ position:"absolute", top:0, left:0, width:`${pct}%`, height:"100%", background: color, borderRadius: 3, transition: "width 0.6s ease, background 0.4s" }}/>
    </div>
  );
}

// ── Toggle switch ────────────────────────────
function Toggle({ on, onChange, disabled }) {
  return (
    <div onClick={disabled ? undefined : onChange}
      style={{
        width: 46, height: 26, borderRadius: 13, cursor: disabled ? "default" : "pointer",
        background: on ? "#2ECC71" : "#2A2D33",
        position: "relative", transition: "background 0.22s",
        opacity: disabled ? 0.35 : 1, flexShrink: 0,
        boxShadow: on ? "0 0 12px rgba(46,204,113,0.4)" : "none",
      }}>
      <div style={{
        position: "absolute", top: 3, left: on ? 23 : 3,
        width: 20, height: 20, borderRadius: 10, background: "white",
        boxShadow: "0 1px 4px rgba(0,0,0,0.5)",
        transition: "left 0.22s",
      }}/>
    </div>
  );
}

// ── Main App ─────────────────────────────────
export default function App() {
  const [lang, setLang]     = useState(() => localStorage.getItem("aip_lang") || "en");
  const t = T[lang];

  const [latest, setLatest] = useState({ temperature: 0, humidity: 0, fan: false, pump: false, auto: true, ts: "--" });
  const [history, setHistory]   = useState([]);
  const [thresh, setThresh]     = useState({ temp_high:25, temp_low:23, humid_low:40, humid_high:55, plant:"", advice:"" });
  const [autoMode, setAutoMode] = useState(true);
  const [fanOn, setFanOn]       = useState(false);
  const [pumpOn, setPumpOn]     = useState(false);
  const [plant, setPlant]       = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError]     = useState("");
  const [backendOk, setBackendOk] = useState(false);
  const [espOk, setEspOk]         = useState(false);
  const [notifGranted, setNotifGranted]     = useState(false);
  const [notifSupported, setNotifSupported] = useState(false);

  const pendingRef = useRef({});
  const prevRef    = useRef({ fan: false, pump: false, health: 100 });
  const lastTsRef  = useRef("--");

  useEffect(() => { localStorage.setItem("aip_lang", lang); }, [lang]);

  const score  = calcHealth(latest.temperature, latest.humidity, thresh);
  const health = healthMeta(score, t);
  const rgb    = getRGB(fanOn, pumpOn, autoMode, t);

  // notifications setup
  useEffect(() => {
    const s = "Notification" in window;
    setNotifSupported(s);
    if (s && Notification.permission === "granted") setNotifGranted(true);
  }, []);

  useEffect(() => {
    const prev = prevRef.current;
    if (fanOn && !prev.fan)           notify("AI Planter", `${t.fan} ON`);
    if (!fanOn && prev.fan)           notify("AI Planter", `${t.fan} OFF`);
    if (pumpOn && !prev.pump)         notify("AI Planter", `${t.pump} ON`);
    if (!pumpOn && prev.pump)         notify("AI Planter", `${t.pump} OFF`);
    if (score < 40 && prev.health >= 40) notify("AI Planter", `${t.stressed} — score: ${score}`);
    prevRef.current = { fan: fanOn, pump: pumpOn, health: score };
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

  useEffect(() => {
    poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, [poll]);

  const clearPend = (k) => setTimeout(() => {
    pendingRef.current = { ...pendingRef.current, [k]: undefined };
  }, 8000);

  const send = (p) => fetch(`${API}/control`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p),
  });

  const toggleAuto = () => {
    const n = !autoMode; setAutoMode(n);
    pendingRef.current.auto = n; clearPend("auto");
    send({ auto: n });
    if (n) { setFanOn(false); setPumpOn(false); pendingRef.current.fan = undefined; pendingRef.current.pump = undefined; }
  };
  const toggleFan  = () => { if (autoMode) return; const n = !fanOn;  setFanOn(n);  pendingRef.current.fan  = n; clearPend("fan");  send({ fan: n }); };
  const togglePump = () => { if (autoMode) return; const n = !pumpOn; setPumpOn(n); pendingRef.current.pump = n; clearPend("pump"); send({ pump: n }); };

  const askAI = async () => {
    if (!plant.trim()) return;
    setAiLoading(true); setAiError("");
    try {
      const r = await fetch(`${API}/ai-advice?plant=${encodeURIComponent(plant)}`);
      if (!r.ok) throw new Error(await r.text());
      const d = await r.json();
      if (d.thresholds) { setThresh(d.thresholds); notify("AI Planter", `${t.setFor} ${plant}`); }
    } catch { setAiError(t.aiFail); }
    setAiLoading(false);
  };

  const connLabel = !backendOk ? t.netOff : !espOk ? t.espOff : t.live;
  const connColor = espOk ? "#2ECC71" : backendOk ? "#F0B429" : "#F87171";

  // health ring
  const R = 40, C = 2 * Math.PI * R;
  const arc = (score / 100) * C * 0.75;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,300&family=DM+Mono:wght@400;500&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --bg:       #0E0F11;
          --s1:       #16181C;
          --s2:       #1C1E23;
          --s3:       #242629;
          --border:   #2A2D33;
          --border2:  #32363E;
          --text:     #E2E8F0;
          --muted:    #94A3B8;
          --dim:      #4B5563;
          --green:    #2ECC71;
          --amber:    #F0B429;
          --blue:     #3B82F6;
          --red:      #F87171;
          --purple:   #A78BFA;
          --r:        16px;
          --r-sm:     10px;
        }

        html { -webkit-text-size-adjust: 100%; }

        body {
          background: var(--bg);
          color: var(--text);
          font-family: 'DM Sans', -apple-system, sans-serif;
          min-height: 100dvh;
          overscroll-behavior: none;
        }

        .wrap {
          max-width: 420px;
          margin: 0 auto;
          padding: 0 16px 56px;
          padding-top: max(20px, env(safe-area-inset-top, 20px));
        }

        /* ── Typography scale ── */
        .label {
          font-size: 11px; font-weight: 500; letter-spacing: 0.08em;
          text-transform: uppercase; color: var(--dim);
        }
        .mono { font-family: 'DM Mono', monospace; }

        /* ── Header ── */
        .hdr {
          display: flex; align-items: center;
          justify-content: space-between;
          padding-bottom: 20px;
        }
        .hdr-brand {
          display: flex; align-items: center; gap: 10px;
        }
        .brand-mark {
          width: 32px; height: 32px; border-radius: 9px;
          background: linear-gradient(145deg, #166534 0%, #2ECC71 100%);
          display: flex; align-items: center; justify-content: center;
          font-size: 16px;
          box-shadow: 0 2px 8px rgba(46,204,113,0.25);
        }
        .brand-name {
          font-size: 15px; font-weight: 600; letter-spacing: -0.01em;
        }
        .brand-tag {
          font-size: 11px; color: var(--dim); margin-top: 1px;
          letter-spacing: 0.01em;
        }
        .hdr-right { display: flex; align-items: center; gap: 7px; }
        .status-pill {
          display: flex; align-items: center; gap: 5px;
          background: var(--s1); border: 1px solid var(--border);
          border-radius: 20px; padding: 5px 10px;
          font-size: 11px; font-weight: 500; color: var(--muted);
        }
        .pip {
          width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0;
        }
        .lang-pill {
          background: var(--s1); border: 1px solid var(--border);
          border-radius: 20px; padding: 5px 10px;
          font-size: 11px; font-weight: 600; color: var(--muted);
          cursor: pointer; transition: border-color 0.15s;
        }
        .lang-pill:active { transform: scale(0.93); }

        /* ── Section spacing ── */
        .section { margin-bottom: 10px; }

        /* ── Card ── */
        .card {
          background: var(--s1);
          border: 1px solid var(--border);
          border-radius: var(--r);
        }

        /* ── SENSOR HERO ── */
        .sensor-hero {
          display: grid; grid-template-columns: 1fr 1fr;
          gap: 1px; background: var(--border);
          border-radius: var(--r); overflow: hidden;
        }
        .sensor-cell {
          background: var(--s1); padding: 20px 18px 18px;
          position: relative;
        }
        .sensor-label { margin-bottom: 12px; }
        .sensor-big {
          font-family: 'DM Mono', monospace;
          font-size: 52px; font-weight: 400; line-height: 1;
          letter-spacing: -0.03em; margin-bottom: 2px;
        }
        .sensor-unit {
          font-family: 'DM Mono', monospace;
          font-size: 18px; color: var(--muted); margin-left: 2px;
        }
        .sensor-status {
          display: flex; align-items: center; gap: 5px;
          font-size: 12px; font-weight: 500; margin-top: 10px;
          margin-bottom: 8px;
        }
        .sensor-range {
          font-size: 10px; font-family: 'DM Mono', monospace;
          color: var(--dim); margin-top: 4px;
        }
        .sensor-divider {
          position: absolute; right: 0; top: 20px; bottom: 20px;
          width: 1px; background: var(--border);
        }

        /* ── AI Panel ── */
        .ai-card {
          background: var(--s1); border: 1px solid var(--border2);
          border-radius: var(--r); overflow: hidden;
        }
        .ai-card-top {
          padding: 16px 18px 14px;
          border-bottom: 1px solid var(--border);
        }
        .ai-top-row {
          display: flex; align-items: center;
          justify-content: space-between; margin-bottom: 12px;
        }
        .ai-title-group { display: flex; align-items: baseline; gap: 8px; }
        .ai-title {
          font-size: 15px; font-weight: 600; letter-spacing: -0.01em;
        }
        .ai-by {
          font-size: 11px; color: var(--dim);
        }
        .ai-active {
          font-size: 11px; font-family: 'DM Mono', monospace;
          color: var(--amber);
          background: rgba(240,180,41,0.08);
          border: 1px solid rgba(240,180,41,0.2);
          border-radius: 6px; padding: 3px 8px;
        }
        .ai-input-row { display: flex; gap: 8px; }
        .ai-input {
          flex: 1; background: var(--s3); border: 1px solid var(--border2);
          border-radius: var(--r-sm); padding: 11px 13px;
          color: var(--text); font-family: 'DM Sans', sans-serif;
          font-size: 14px; outline: none;
          transition: border-color 0.18s, box-shadow 0.18s;
          -webkit-appearance: none;
        }
        .ai-input::placeholder { color: var(--dim); }
        .ai-input:focus {
          border-color: var(--amber);
          box-shadow: 0 0 0 3px rgba(240,180,41,0.1);
        }
        .ai-btn {
          background: var(--amber); color: #0E0F11;
          border: none; border-radius: var(--r-sm);
          padding: 11px 18px; font-family: 'DM Sans', sans-serif;
          font-size: 14px; font-weight: 600; cursor: pointer;
          white-space: nowrap; transition: opacity 0.18s, transform 0.12s;
          letter-spacing: -0.01em;
        }
        .ai-btn:active { transform: scale(0.96); }
        .ai-btn:disabled { opacity: 0.45; cursor: not-allowed; transform: none; }
        .ai-prog-bar {
          height: 2px; background: rgba(240,180,41,0.1);
          overflow: hidden; margin-top: 10px;
        }
        .ai-prog-fill {
          height: 100%; background: var(--amber);
          animation: aprog 1.4s ease-in-out infinite;
        }
        @keyframes aprog {
          0%   { transform: translateX(-100%) scaleX(0.4); }
          50%  { transform: translateX(60%)   scaleX(0.6); }
          100% { transform: translateX(200%)  scaleX(0.4); }
        }
        .ai-err {
          margin-top: 10px; padding: 9px 12px;
          background: rgba(248,113,113,0.07);
          border: 1px solid rgba(248,113,113,0.15);
          border-radius: 8px; font-size: 13px; color: var(--red);
        }
        .ai-body { padding: 16px 18px; }
        .ai-thresh-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px; }
        .ai-thresh-item {
          background: var(--s2); border: 1px solid var(--border);
          border-radius: var(--r-sm); padding: 12px 14px;
        }
        .ai-thresh-val {
          font-family: 'DM Mono', monospace; font-size: 17px;
          font-weight: 500; color: var(--amber); display: block; margin-bottom: 3px;
        }
        .ai-thresh-key { font-size: 11px; color: var(--dim); }
        .ai-advice-block {
          background: var(--s2); border: 1px solid var(--border);
          border-radius: var(--r-sm); padding: 13px 14px;
        }
        .ai-advice-title { margin-bottom: 6px; }
        .ai-advice-text {
          font-size: 13px; line-height: 1.65; color: var(--muted);
          font-style: italic;
        }
        .ai-empty {
          font-size: 13px; color: var(--dim);
          text-align: center; padding: 4px 0; line-height: 1.6;
        }

        /* ── Status row ── */
        .status-row {
          display: grid; grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        /* ── Health card ── */
        .health-card {
          background: var(--s1); border: 1px solid var(--border);
          border-radius: var(--r); padding: 16px;
          display: flex; align-items: center; gap: 14px;
        }
        .health-ring { position: relative; width: 88px; height: 88px; flex-shrink: 0; }
        .health-ring svg { width: 100%; height: 100%; overflow: visible; }
        .health-overlay {
          position: absolute; inset: 0;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
        }
        .health-num {
          font-family: 'DM Mono', monospace;
          font-size: 22px; font-weight: 500; line-height: 1;
        }
        .health-denom { font-size: 9px; color: var(--dim); margin-top: 1px; }
        .health-info { flex: 1; min-width: 0; }
        .health-status {
          font-size: 14px; font-weight: 600; letter-spacing: -0.01em;
          margin-bottom: 3px;
        }
        .health-plant { font-size: 11px; color: var(--dim); font-family: 'DM Mono', monospace; }

        /* ── RGB status card ── */
        .rgb-card {
          background: var(--s1); border: 1px solid var(--border);
          border-radius: var(--r); padding: 16px;
          display: flex; flex-direction: column; justify-content: space-between;
          gap: 12px;
        }
        .rgb-indicator { display: flex; align-items: center; gap: 10px; }
        .rgb-dot {
          width: 32px; height: 32px; border-radius: 50%;
          flex-shrink: 0; transition: background 0.4s, box-shadow 0.5s;
        }
        .rgb-dot-inner { width: 100%; height: 100%; border-radius: 50%; background: rgba(255,255,255,0.2); }
        .rgb-name { font-size: 13px; font-weight: 500; }
        .rgb-label-text { font-size: 11px; color: var(--dim); margin-top: 1px; }
        .notif-btn {
          width: 100%; background: var(--s2); border: 1px solid var(--border2);
          border-radius: 8px; padding: 8px 12px;
          font-size: 12px; font-weight: 500; color: var(--muted);
          cursor: pointer; text-align: center; transition: all 0.18s;
          font-family: 'DM Sans', sans-serif;
        }
        .notif-btn.on { color: var(--green); border-color: rgba(46,204,113,0.3); background: rgba(46,204,113,0.05); }
        .notif-btn:active { transform: scale(0.97); }
        .ios-hint { font-size: 11px; color: var(--dim); text-align: center; line-height: 1.4; }

        /* ── Charts ── */
        .charts { display: flex; flex-direction: column; gap: 10px; }
        .chart-card {
          background: var(--s1); border: 1px solid var(--border);
          border-radius: var(--r); padding: 16px;
        }
        .chart-hdr {
          display: flex; align-items: baseline;
          justify-content: space-between; margin-bottom: 12px;
        }
        .chart-title { font-size: 13px; font-weight: 500; color: var(--muted); }
        .chart-range { font-size: 11px; font-family: 'DM Mono', monospace; color: var(--dim); }

        /* ── Indicators ── */
        .indicators {
          display: grid; grid-template-columns: repeat(3, 1fr);
          gap: 8px;
        }
        .ind {
          background: var(--s1); border: 1px solid var(--border);
          border-radius: var(--r-sm); padding: 12px 10px;
          text-align: center; transition: border-color 0.25s;
        }
        .ind.on { border-color: var(--ic); box-shadow: 0 0 14px color-mix(in srgb, var(--ic) 18%, transparent); }
        .ind-icon-wrap {
          width: 34px; height: 34px; border-radius: 9px;
          margin: 0 auto 7px; display: flex; align-items: center;
          justify-content: center; font-size: 16px;
          background: rgba(255,255,255,0.04);
          transition: background 0.25s; position: relative;
        }
        .ind.on .ind-icon-wrap { background: color-mix(in srgb, var(--ic) 14%, transparent); }
        .ind-glow {
          position: absolute; inset: -2px; border-radius: 11px;
          animation: iglow 2s ease-in-out infinite;
        }
        @keyframes iglow { 0%,100%{opacity:0.18} 50%{opacity:0.06} }
        .ind-name { font-size: 10px; color: var(--dim); text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 2px; }
        .ind-state { font-size: 11px; font-weight: 500; color: var(--dim); transition: color 0.25s; }
        .ind.on .ind-state { color: var(--ic); }

        /* ── Controls ── */
        .controls-card {
          background: var(--s1); border: 1px solid var(--border);
          border-radius: var(--r); overflow: hidden;
        }
        .ctrl-hdr {
          padding: 14px 18px 0; margin-bottom: 8px;
        }
        .ctrl-list { padding: 0 10px 12px; display: flex; flex-direction: column; gap: 2px; }
        .ctrl-item {
          display: flex; align-items: center; justify-content: space-between;
          padding: 13px 8px; border-radius: var(--r-sm);
          cursor: pointer; transition: background 0.15s;
          user-select: none;
        }
        .ctrl-item:active:not(.ctrl-disabled) { background: rgba(255,255,255,0.03); }
        .ctrl-item.ctrl-disabled { cursor: default; }
        .ctrl-left { display: flex; align-items: center; gap: 10px; }
        .ctrl-dot {
          width: 8px; height: 8px; border-radius: 50%;
          transition: background 0.22s, box-shadow 0.22s;
        }
        .ctrl-item-name { font-size: 15px; font-weight: 400; letter-spacing: -0.01em; }
        .ctrl-item-name.on { font-weight: 500; }
        .ctrl-item.ctrl-disabled .ctrl-item-name { color: var(--dim); }
        .ctrl-hint { padding: 0 18px 14px; font-size: 12px; color: var(--dim); }

        /* ── Footer ── */
        .footer {
          padding: 8px 0 2px; text-align: center;
          font-size: 11px; color: var(--dim);
          font-family: 'DM Mono', monospace;
        }

        /* ── Divider ── */
        .divider { height: 1px; background: var(--border); margin: 0 -18px; }

        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: var(--border2); border-radius: 4px; }

        @supports (padding: max(0px)) {
          .wrap { padding-bottom: max(56px, env(safe-area-inset-bottom, 20px)); }
        }
      `}</style>

      <div className="wrap">

        {/* Header */}
        <header className="hdr">
          <div className="hdr-brand">
            <div className="brand-mark">🌱</div>
            <div>
              <div className="brand-name">AI Planter</div>
              <div className="brand-tag">{t.sub}</div>
            </div>
          </div>
          <div className="hdr-right">
            <div className="status-pill">
              <div className="pip" style={{ background: connColor, boxShadow: espOk ? `0 0 5px ${connColor}` : "none" }}/>
              {connLabel}
            </div>
            <button className="lang-pill" onClick={() => setLang(l => l === "en" ? "ms" : "en")}>
              {lang === "en" ? "BM" : "EN"}
            </button>
          </div>
        </header>

        {/* Sensor hero */}
        <div className="section">
          <div className="sensor-hero">
            {[
              { key:"temperature", val:latest.temperature, unit:"°C", color:"#F87171", low:thresh.temp_low, high:thresh.temp_high },
              { key:"humidity",    val:latest.humidity,    unit:"%",  color:"#60A5FA", low:thresh.humid_low, high:thresh.humid_high },
            ].map(({ key, val, unit, color, low, high }, i) => {
              const ok = val >= low && val <= high;
              const sc = ok ? "#2ECC71" : val < low ? "#60A5FA" : "#F87171";
              const st = ok ? t.optimal : val < low ? t.low : t.high;
              return (
                <div className="sensor-cell" key={key}>
                  {i === 0 && <div className="sensor-divider"/>}
                  <div className="label sensor-label">{t[key]}</div>
                  <div>
                    <span className="sensor-big" style={{ color }}>{val.toFixed(1)}</span>
                    <span className="sensor-unit">{unit}</span>
                  </div>
                  <div className="sensor-status">
                    <div className="pip" style={{ background: sc }}/>
                    <span style={{ color: sc, fontSize: 12 }}>{st}</span>
                  </div>
                  <ThreshBar value={val} low={low} high={high} color={sc}/>
                  <div className="sensor-range mono">{low}–{high}{unit}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* AI Panel */}
        <div className="section">
          <div className="ai-card">
            <div className="ai-card-top">
              <div className="ai-top-row">
                <div className="ai-title-group">
                  <span className="ai-title">{t.aiTitle}</span>
                  <span className="ai-by">{t.aiBy}</span>
                </div>
                {thresh.plant && <div className="ai-active">{thresh.plant}</div>}
              </div>
              <div className="ai-input-row">
                <input className="ai-input" value={plant}
                  onChange={e => setPlant(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && askAI()}
                  placeholder={t.aiPlaceholder}/>
                <button className="ai-btn" onClick={askAI} disabled={aiLoading}>
                  {aiLoading ? t.aiLoading : t.aiBtn}
                </button>
              </div>
              {aiLoading && <div className="ai-prog-bar"><div className="ai-prog-fill"/></div>}
              {aiError && <div className="ai-err">⚠ {aiError}</div>}
            </div>
            <div className="ai-body">
              {thresh.advice ? (
                <>
                  <div className="ai-thresh-row">
                    <div className="ai-thresh-item">
                      <span className="ai-thresh-val">{thresh.temp_low}–{thresh.temp_high}°C</span>
                      <span className="ai-thresh-key label">{t.temp}</span>
                    </div>
                    <div className="ai-thresh-item">
                      <span className="ai-thresh-val">{thresh.humid_low}–{thresh.humid_high}%</span>
                      <span className="ai-thresh-key label">{t.humid}</span>
                    </div>
                  </div>
                  <div className="ai-advice-block">
                    <div className="label ai-advice-title">{t.aiAdvice}</div>
                    <div className="ai-advice-text">{thresh.advice}</div>
                  </div>
                </>
              ) : !aiLoading && <p className="ai-empty">{t.aiEmpty}</p>}
            </div>
          </div>
        </div>

        {/* Status row: Health + RGB */}
        <div className="section">
          <div className="status-row">
            {/* Health */}
            <div className="health-card">
              <div className="health-ring">
                <svg viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r={R} fill="none"
                    stroke="#1C1E23" strokeWidth="8"
                    strokeDasharray={`${C*0.75} ${C}`}
                    strokeDashoffset={C*0.125} strokeLinecap="round"/>
                  <circle cx="50" cy="50" r={R} fill="none"
                    stroke={health.color} strokeWidth="8"
                    strokeDasharray={`${arc} ${C}`}
                    strokeDashoffset={C*0.125} strokeLinecap="round"
                    style={{ transition:"stroke-dasharray 0.8s ease, stroke 0.4s" }}/>
                </svg>
                <div className="health-overlay">
                  <div className="health-num mono" style={{color:health.color}}>{score}</div>
                  <div className="health-denom label">/ 100</div>
                </div>
              </div>
              <div className="health-info">
                <div className="label" style={{marginBottom:4}}>{t.health}</div>
                <div className="health-status" style={{color:health.color}}>{health.label}</div>
                <div className="health-plant">{thresh.plant || "—"}</div>
              </div>
            </div>

            {/* RGB */}
            <div className="rgb-card">
              <div>
                <div className="label" style={{marginBottom:10}}>{t.rgbLabel}</div>
                <div className="rgb-indicator">
                  <div className="rgb-dot" style={{
                    background: rgb.color,
                    boxShadow: rgb.color !== "#374151" ? `0 0 14px ${rgb.color}80, 0 0 4px ${rgb.color}` : "none"
                  }}>
                    <div className="rgb-dot-inner"/>
                  </div>
                  <div>
                    <div className="rgb-name" style={{color:rgb.color}}>{rgb.label}</div>
                  </div>
                </div>
              </div>
              {notifSupported ? (
                <button className={`notif-btn ${notifGranted?"on":""}`}
                  onClick={async () => { const ok = await requestNotif(); setNotifGranted(ok); }}>
                  {notifGranted ? `🔔 ${t.alertOn}` : `🔕 ${t.alertOff}`}
                </button>
              ) : <div className="ios-hint">{t.alertIOS}</div>}
            </div>
          </div>
        </div>

        {/* Indicators */}
        <div className="section">
          <div className="indicators">
            {[
              {on:fanOn,    color:"#3B82F6", icon:"💨", name:t.fan,  stOn:t.running, stOff:t.idle},
              {on:pumpOn,   color:"#2ECC71", icon:"💧", name:t.pump, stOn:t.misting, stOff:t.idle},
              {on:autoMode, color:"#F0B429", icon:"⚡", name:t.auto, stOn:t.auto,    stOff:t.manual},
            ].map(({on, color, icon, name, stOn, stOff}) => (
              <div key={name} className={`ind ${on?"on":""}`} style={{"--ic":color}}>
                <div className="ind-icon-wrap">
                  {on && <div className="ind-glow" style={{background:color}}/>}
                  <span>{icon}</span>
                </div>
                <div className="ind-name">{name}</div>
                <div className="ind-state">{on ? stOn : stOff}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Charts */}
        <div className="section charts">
          {[
            {dKey:"temperature", color:"#F87171", name:t.temp, unit:"°C", lo:thresh.temp_low, hi:thresh.temp_high},
            {dKey:"humidity",    color:"#60A5FA", name:t.humid, unit:"%",  lo:thresh.humid_low, hi:thresh.humid_high},
          ].map(({dKey, color, name, unit, lo, hi}) => (
            <div className="chart-card" key={dKey}>
              <div className="chart-hdr">
                <span className="chart-title">{name}</span>
                <span className="chart-range">{lo}–{hi} {unit}</span>
              </div>
              <ResponsiveContainer width="100%" height={110}>
                <LineChart data={history.slice(-24)} margin={{top:2,right:2,left:-28,bottom:0}}>
                  <XAxis dataKey="ts" tick={{fill:"#374151",fontSize:9}} interval="preserveStartEnd" axisLine={false} tickLine={false}/>
                  <YAxis tick={{fill:"#374151",fontSize:9}} axisLine={false} tickLine={false}/>
                  <Tooltip
                    contentStyle={{background:"#16181C",border:"1px solid #2A2D33",borderRadius:8,fontSize:12}}
                    labelStyle={{color:"#64748B"}} itemStyle={{color}}
                    cursor={{stroke:"#2A2D33",strokeWidth:1}}/>
                  <ReferenceLine y={hi} stroke={color} strokeDasharray="4 3" strokeOpacity={0.35} strokeWidth={1}/>
                  <ReferenceLine y={lo} stroke={color} strokeDasharray="4 3" strokeOpacity={0.35} strokeWidth={1}/>
                  <Line type="monotone" dataKey={dKey} stroke={color} strokeWidth={1.75}
                    dot={false} activeDot={{r:4,fill:color,strokeWidth:0}}/>
                </LineChart>
              </ResponsiveContainer>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div className="section">
          <div className="controls-card">
            <div className="ctrl-hdr">
              <div className="label">{t.controls}</div>
            </div>
            <div className="ctrl-list">
              {[
                {on:autoMode, toggle:toggleAuto, name:t.autoMode, color:"#F0B429", disabled:false},
                {on:fanOn,    toggle:toggleFan,  name:t.fanCtrl,  color:"#3B82F6", disabled:autoMode},
                {on:pumpOn,   toggle:togglePump, name:t.pumpCtrl, color:"#2ECC71", disabled:autoMode},
              ].map(({on, toggle, name, color, disabled}) => (
                <div key={name}
                  className={`ctrl-item ${disabled?"ctrl-disabled":""}`}
                  onClick={disabled ? undefined : toggle}>
                  <div className="ctrl-left">
                    <div className="ctrl-dot" style={{
                      background: on && !disabled ? color : "#2A2D33",
                      boxShadow: on && !disabled ? `0 0 6px ${color}` : "none"
                    }}/>
                    <span className={`ctrl-item-name ${on&&!disabled?"on":""}`}
                      style={{color: on&&!disabled ? color : disabled ? "var(--dim)" : "var(--text)"}}>
                      {name}
                    </span>
                  </div>
                  <Toggle on={on && !disabled} onChange={toggle} disabled={disabled}/>
                </div>
              ))}
            </div>
            {autoMode && <div className="ctrl-hint">{t.autoHint}</div>}
          </div>
        </div>

        <div className="footer">{t.updated} {latest.ts || "--"}</div>
      </div>
    </>
  );
}
