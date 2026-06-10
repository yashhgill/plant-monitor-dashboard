import { useState, useEffect, useRef, useCallback } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

// ── Push Notifications ────────────────────────
async function requestNotificationPermission() {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  const perm = await Notification.requestPermission();
  return perm === "granted";
}

function sendNotification(title, body, icon = "🌿") {
  if (Notification.permission !== "granted") return;
  new Notification(title, { body, icon: "/icon.png" });
}

// ── Health Score ──────────────────────────────
function calcHealth(temp, humid, t) {
  let score = 100;
  if (temp > t.temp_high)  score -= Math.min(40, (temp - t.temp_high) * 8);
  if (temp < t.temp_low)   score -= Math.min(40, (t.temp_low - temp)  * 8);
  if (humid > t.humid_high) score -= Math.min(30, (humid - t.humid_high) * 3);
  if (humid < t.humid_low)  score -= Math.min(30, (t.humid_low - humid)  * 3);
  return Math.max(0, Math.round(score));
}

function healthLabel(score) {
  if (score >= 85) return { label: "Thriving",  color: "#22c55e", bg: "#f0fdf4", border: "#bbf7d0" };
  if (score >= 60) return { label: "Good",      color: "#84cc16", bg: "#f7fee7", border: "#d9f99d" };
  if (score >= 40) return { label: "Fair",      color: "#f59e0b", bg: "#fffbeb", border: "#fde68a" };
  return             { label: "Stressed",  color: "#ef4444", bg: "#fef2f2", border: "#fecaca" };
}

// ── RGB Preview Dot ───────────────────────────
function RGBDot({ fanOn, pumpOn, autoMode }) {
  // fan=blue, pump=green, both=cyan, auto amber, idle=white
  let color, label;
  if (!autoMode)            { color = "#a855f7"; label = "Manual"; }
  else if (fanOn && pumpOn) { color = "#06b6d4"; label = "Fan + Pump"; }
  else if (fanOn)           { color = "#3b82f6"; label = "Fan active"; }
  else if (pumpOn)          { color = "#22c55e"; label = "Pump active"; }
  else                      { color = "#d1d5db"; label = "Standby"; }
  return (
    <div className="rgb-wrap">
      <div className="rgb-orb" style={{ background: color, boxShadow: `0 0 18px ${color}99, 0 0 6px ${color}` }} />
      <span className="rgb-label" style={{ color }}>{label}</span>
    </div>
  );
}

// ── Score Ring ────────────────────────────────
function ScoreRing({ score }) {
  const h = healthLabel(score);
  const r = 44, circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  return (
    <div className="score-ring-wrap">
      <svg viewBox="0 0 100 100" width="100" height="100">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#f1f5f9" strokeWidth="8" />
        <circle cx="50" cy="50" r={r} fill="none" stroke={h.color} strokeWidth="8"
          strokeDasharray={`${dash} ${circ}`} strokeDashoffset={circ * 0.25}
          strokeLinecap="round" style={{ transition: "stroke-dasharray 0.8s ease, stroke 0.4s" }} />
        <text x="50" y="46" textAnchor="middle" fill="#0f172a" fontSize="22" fontWeight="700" fontFamily="Inter, sans-serif">{score}</text>
        <text x="50" y="60" textAnchor="middle" fill="#94a3b8" fontSize="9" fontFamily="Inter, sans-serif">/ 100</text>
      </svg>
      <p className="score-label" style={{ color: h.color }}>{h.label}</p>
    </div>
  );
}

// ── Big Metric ────────────────────────────────
function Metric({ value, unit, label, lowThresh, highThresh, color }) {
  const ok = value >= lowThresh && value <= highThresh;
  const status = ok ? "Optimal" : value < lowThresh ? "Too low" : "Too high";
  const statusColor = ok ? "#22c55e" : value < lowThresh ? "#3b82f6" : "#ef4444";
  return (
    <div className="metric-card glass">
      <p className="metric-label">{label}</p>
      <div className="metric-value-row">
        <span className="metric-value" style={{ color }}>{value.toFixed(1)}</span>
        <span className="metric-unit">{unit}</span>
      </div>
      <div className="metric-status-row">
        <span className="metric-status-dot" style={{ background: statusColor }} />
        <span className="metric-status-text" style={{ color: statusColor }}>{status}</span>
        <span className="metric-range">{lowThresh}–{highThresh}{unit}</span>
      </div>
      <div className="metric-bar-bg">
        <div className="metric-bar-fill" style={{
          width: `${Math.min(100, Math.max(0, ((value - (lowThresh - 5)) / ((highThresh + 5) - (lowThresh - 5))) * 100))}%`,
          background: statusColor,
          transition: "width 0.6s ease, background 0.4s"
        }} />
        <div className="metric-bar-zone" style={{
          left: `${((lowThresh - (lowThresh - 5)) / ((highThresh + 5) - (lowThresh - 5))) * 100}%`,
          width: `${((highThresh - lowThresh) / ((highThresh + 5) - (lowThresh - 5))) * 100}%`,
        }} />
      </div>
    </div>
  );
}

// ── Indicator Card ────────────────────────────
function IndicatorCard({ active, color, icon, label, sub }) {
  return (
    <div className={`indicator-card glass ${active ? "active" : ""}`} style={{ "--ic": color }}>
      <div className="ind-icon-wrap" style={{ background: active ? `${color}18` : "#f8fafc" }}>
        <span className="ind-icon">{icon}</span>
        {active && <span className="ind-pulse" style={{ background: color }} />}
      </div>
      <p className="ind-label">{label}</p>
      <p className="ind-sub" style={{ color: active ? color : "#94a3b8" }}>{active ? sub.on : sub.off}</p>
    </div>
  );
}

// ── Chart ─────────────────────────────────────
function Chart({ data, dataKey, color, label, unit, refLow, refHigh }) {
  return (
    <div className="chart-card glass">
      <div className="chart-head">
        <span className="chart-title">{label}</span>
        <span className="chart-unit" style={{ color }}>{refLow}–{refHigh} {unit}</span>
      </div>
      <ResponsiveContainer width="100%" height={130}>
        <LineChart data={data.slice(-20)} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
          <XAxis dataKey="ts" tick={{ fill: "#94a3b8", fontSize: 9 }} interval="preserveStartEnd" />
          <YAxis tick={{ fill: "#94a3b8", fontSize: 9 }} />
          <Tooltip contentStyle={{ background: "rgba(255,255,255,0.95)", border: "none",
            borderRadius: 12, boxShadow: "0 4px 24px #0002", fontSize: 12 }}
            labelStyle={{ color: "#64748b" }} itemStyle={{ color }} />
          <ReferenceLine y={refHigh} stroke={color} strokeDasharray="3 3" strokeOpacity={0.35} />
          <ReferenceLine y={refLow}  stroke={color} strokeDasharray="3 3" strokeOpacity={0.35} />
          <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2.5}
            dot={false} activeDot={{ r: 5, fill: color, strokeWidth: 0 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Toggle ────────────────────────────────────
function Toggle({ active, onToggle, label, disabled, color = "#22c55e" }) {
  return (
    <button className={`ctrl-toggle ${active ? "on" : "off"} ${disabled ? "dim" : ""}`}
      onClick={onToggle} disabled={disabled}
      style={active ? { "--tc": color, borderColor: color, background: `${color}12`, color } : {}}>
      <div className="track" style={active ? { background: color } : {}}>
        <div className="thumb" />
      </div>
      <span>{label}</span>
    </button>
  );
}

// ── Main ──────────────────────────────────────
export default function App() {
  const [latest, setLatest]     = useState({ temperature: 0, humidity: 0, fan: false, pump: false, auto: true, ts: "--" });
  const [history, setHistory]   = useState([]);
  const [thresh, setThresh]     = useState({ temp_high: 25, temp_low: 23, humid_low: 40, humid_high: 55, plant: "", advice: "" });
  const [autoMode, setAutoMode] = useState(true);
  const [fanOn, setFanOn]       = useState(false);
  const [pumpOn, setPumpOn]     = useState(false);
  const [plant, setPlant]       = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError]   = useState("");
  const [connected, setConnected] = useState(false);
  const [notifGranted, setNotifGranted] = useState(false);
  const prevStates = useRef({ fan: false, pump: false, health: 100 });

  const score = calcHealth(latest.temperature, latest.humidity, thresh);
  const health = healthLabel(score);

  // ── Notifications ───────────────────────────
  useEffect(() => {
    requestNotificationPermission().then(setNotifGranted);
  }, []);

  // Watch for state changes and notify
  useEffect(() => {
    const prev = prevStates.current;
    if (fanOn && !prev.fan)   sendNotification("🌿 Greenhouse", "Fan turned ON — temperature high");
    if (!fanOn && prev.fan)   sendNotification("🌿 Greenhouse", "Fan turned OFF — temperature normal");
    if (pumpOn && !prev.pump) sendNotification("🌿 Greenhouse", "Pump turned ON — humidity low");
    if (!pumpOn && prev.pump) sendNotification("🌿 Greenhouse", "Pump turned OFF — humidity restored");
    if (score < 40 && prev.health >= 40) sendNotification("⚠️ Plant Alert", `Your plant is stressed! Score: ${score}/100`);
    prevStates.current = { fan: fanOn, pump: pumpOn, health: score };
  }, [fanOn, pumpOn, score]);

  // ── Poll ────────────────────────────────────
  const poll = useCallback(async () => {
    try {
      const r = await fetch(`${API}/data`);
      if (!r.ok) throw new Error();
      const d = await r.json();
      setLatest(d.latest);
      setHistory(d.history);
      if (d.thresholds) setThresh(d.thresholds);
      setAutoMode(d.latest.auto);
      setFanOn(d.latest.fan);
      setPumpOn(d.latest.pump);
      setConnected(true);
    } catch { setConnected(false); }
  }, []);

  useEffect(() => {
    poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, [poll]);

  // ── Commands ────────────────────────────────
  const send = (payload) => fetch(`${API}/control`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
  });

  const toggleAuto = () => { const n = !autoMode; setAutoMode(n); send({ auto: n }); };
  const toggleFan  = () => { if (autoMode) return; const n = !fanOn;  setFanOn(n);  send({ fan: n }); };
  const togglePump = () => { if (autoMode) return; const n = !pumpOn; setPumpOn(n); send({ pump: n }); };

  // ── AI ───────────────────────────────────────
  const askAI = async () => {
    if (!plant.trim()) return;
    setAiLoading(true); setAiError("");
    try {
      const r = await fetch(`${API}/ai-advice?plant=${encodeURIComponent(plant)}`);
      if (!r.ok) throw new Error(await r.text());
      const d = await r.json();
      if (d.thresholds) {
        setThresh(d.thresholds);
        sendNotification("🌿 AI Updated", `Thresholds set for ${plant}`);
      }
    } catch { setAiError("Couldn't reach AI. Check GEMINI_API_KEY on your backend."); }
    setAiLoading(false);
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --bg:       #f0f4f8;
          --surface:  rgba(255,255,255,0.75);
          --border:   rgba(0,0,0,0.07);
          --shadow:   0 2px 20px rgba(0,0,0,0.07), 0 1px 4px rgba(0,0,0,0.04);
          --text:     #0f172a;
          --muted:    #64748b;
          --subtle:   #94a3b8;
          --green:    #22c55e;
          --blue:     #3b82f6;
          --amber:    #f59e0b;
          --red:      #ef4444;
          --purple:   #8b5cf6;
          --radius:   20px;
        }

        html { -webkit-text-size-adjust: 100%; }

        body {
          background: var(--bg);
          background-image: radial-gradient(ellipse at 20% 0%, #dcfce7 0%, transparent 50%),
                            radial-gradient(ellipse at 80% 0%, #dbeafe 0%, transparent 50%);
          background-attachment: fixed;
          color: var(--text);
          font-family: 'Inter', -apple-system, sans-serif;
          min-height: 100vh;
          min-height: 100dvh;
          padding-bottom: env(safe-area-inset-bottom);
        }

        .app {
          max-width: 430px;
          margin: 0 auto;
          padding: 0 16px 40px;
          padding-top: env(safe-area-inset-top, 0px);
        }

        /* Glass cards */
        .glass {
          background: var(--surface);
          backdrop-filter: blur(20px) saturate(180%);
          -webkit-backdrop-filter: blur(20px) saturate(180%);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          box-shadow: var(--shadow);
        }

        /* ── Header ── */
        .header {
          padding: 20px 0 16px;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
        }
        .header-title {
          font-size: 1.3rem;
          font-weight: 700;
          letter-spacing: -0.03em;
          line-height: 1.2;
          color: var(--text);
        }
        .header-sub {
          font-size: 0.75rem;
          color: var(--muted);
          margin-top: 3px;
        }
        .live-badge {
          display: flex;
          align-items: center;
          gap: 5px;
          background: white;
          border: 1px solid var(--border);
          border-radius: 20px;
          padding: 5px 10px;
          font-size: 0.72rem;
          font-weight: 500;
          color: var(--muted);
          margin-top: 4px;
          box-shadow: var(--shadow);
        }
        .live-dot {
          width: 7px; height: 7px; border-radius: 50%;
          background: #d1d5db;
        }
        .live-dot.on {
          background: var(--green);
          box-shadow: 0 0 0 3px #dcfce7;
          animation: livepulse 2s infinite;
        }
        @keyframes livepulse { 0%,100%{opacity:1} 50%{opacity:0.5} }

        /* ── Health Hero ── */
        .health-card {
          padding: 20px;
          margin-bottom: 14px;
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .health-right { flex: 1; }
        .health-plant-name {
          font-size: 0.7rem;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--muted);
          margin-bottom: 4px;
        }
        .health-headline {
          font-size: 1.5rem;
          font-weight: 700;
          letter-spacing: -0.02em;
          line-height: 1.1;
          color: var(--text);
        }
        .health-advice {
          font-size: 0.75rem;
          color: var(--muted);
          margin-top: 6px;
          line-height: 1.5;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .score-ring-wrap {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          flex-shrink: 0;
        }
        .score-label {
          font-size: 0.72rem;
          font-weight: 600;
          letter-spacing: 0.02em;
        }

        /* ── RGB strip ── */
        .rgb-card {
          padding: 14px 20px;
          margin-bottom: 14px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .rgb-label-row { display: flex; flex-direction: column; gap: 2px; }
        .rgb-title { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); }
        .rgb-wrap { display: flex; align-items: center; gap: 10px; }
        .rgb-orb {
          width: 28px; height: 28px; border-radius: 50%;
          transition: background 0.4s, box-shadow 0.4s;
        }
        .rgb-label { font-size: 0.8rem; font-weight: 600; transition: color 0.4s; }
        .notif-btn {
          background: #f8fafc; border: 1px solid var(--border); border-radius: 12px;
          padding: 7px 13px; font-size: 0.75rem; font-weight: 500; color: var(--muted);
          cursor: pointer; transition: all 0.2s;
        }
        .notif-btn.granted { background: #f0fdf4; border-color: #bbf7d0; color: var(--green); }
        .notif-btn:active { transform: scale(0.96); }

        /* ── Metrics ── */
        .metrics { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px; }
        .metric-card { padding: 16px; }
        .metric-label { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); margin-bottom: 6px; }
        .metric-value-row { display: flex; align-items: baseline; gap: 3px; margin-bottom: 8px; }
        .metric-value { font-size: 2.4rem; font-weight: 700; letter-spacing: -0.04em; line-height: 1; font-family: 'DM Mono', monospace; }
        .metric-unit { font-size: 0.85rem; color: var(--muted); font-weight: 500; }
        .metric-status-row { display: flex; align-items: center; gap: 5px; margin-bottom: 10px; }
        .metric-status-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
        .metric-status-text { font-size: 0.72rem; font-weight: 600; }
        .metric-range { font-size: 0.65rem; color: var(--subtle); margin-left: auto; font-family: 'DM Mono', monospace; }
        .metric-bar-bg { height: 4px; background: #f1f5f9; border-radius: 4px; position: relative; overflow: hidden; }
        .metric-bar-fill { height: 100%; border-radius: 4px; position: absolute; top: 0; left: 0; }
        .metric-bar-zone { position: absolute; top: 0; height: 100%; background: rgba(34,197,94,0.15); border-radius: 4px; }

        /* ── Indicators ── */
        .indicators { display: grid; grid-template-columns: repeat(3,1fr); gap: 10px; margin-bottom: 14px; }
        .indicator-card { padding: 14px 10px 12px; text-align: center; position: relative; transition: border-color 0.3s, box-shadow 0.3s; overflow: hidden; }
        .indicator-card.active { border-color: var(--ic) !important; box-shadow: 0 4px 20px color-mix(in srgb, var(--ic) 15%, transparent) !important; }
        .ind-icon-wrap { width: 42px; height: 42px; border-radius: 13px; margin: 0 auto 8px; display: flex; align-items: center; justify-content: center; position: relative; transition: background 0.3s; }
        .ind-icon { font-size: 1.25rem; }
        .ind-pulse {
          position: absolute; inset: -3px; border-radius: 16px; opacity: 0.25;
          animation: indpulse 2s infinite;
        }
        @keyframes indpulse { 0%,100%{transform:scale(1);opacity:0.25} 50%{transform:scale(1.12);opacity:0.1} }
        .ind-label { font-size: 0.68rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
        .ind-sub { font-size: 0.72rem; margin-top: 2px; font-weight: 500; transition: color 0.3s; }

        /* ── Charts ── */
        .charts { display: flex; flex-direction: column; gap: 12px; margin-bottom: 14px; }
        .chart-card { padding: 16px; }
        .chart-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
        .chart-title { font-size: 0.72rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
        .chart-unit { font-size: 0.7rem; font-family: 'DM Mono', monospace; }

        /* ── Controls ── */
        .controls-card { padding: 20px; margin-bottom: 14px; }
        .section-title { font-size: 0.7rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); margin-bottom: 14px; }
        .controls-grid { display: flex; flex-direction: column; gap: 10px; }
        .ctrl-toggle {
          width: 100%; display: flex; align-items: center; gap: 12px;
          background: #f8fafc; border: 1.5px solid var(--border);
          border-radius: 14px; padding: 13px 16px;
          font-family: 'Inter', sans-serif; font-size: 0.88rem; font-weight: 500;
          color: var(--muted); cursor: pointer; transition: all 0.22s;
          text-align: left;
        }
        .ctrl-toggle.on { font-weight: 600; }
        .ctrl-toggle.dim { opacity: 0.38; cursor: not-allowed; }
        .ctrl-toggle:active:not(.dim) { transform: scale(0.98); }
        .track {
          width: 40px; height: 24px; border-radius: 12px; background: #e2e8f0;
          position: relative; transition: background 0.22s; flex-shrink: 0;
        }
        .thumb {
          position: absolute; top: 3px; left: 3px;
          width: 18px; height: 18px; border-radius: 9px; background: white;
          box-shadow: 0 1px 4px rgba(0,0,0,0.18);
          transition: transform 0.22s;
        }
        .ctrl-toggle.on .thumb { transform: translateX(16px); }
        .ctrl-hint { font-size: 0.7rem; color: var(--subtle); text-align: center; margin-top: 8px; }

        /* ── AI Panel ── */
        .ai-card { padding: 20px; margin-bottom: 14px; }
        .ai-header-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
        .ai-badge {
          background: linear-gradient(135deg, #8b5cf6, #6366f1);
          color: white; border-radius: 8px; padding: 3px 9px;
          font-size: 0.68rem; font-weight: 600; letter-spacing: 0.04em;
        }
        .ai-active { font-size: 0.72rem; color: var(--muted); font-family: 'DM Mono', monospace; }
        .ai-active strong { color: var(--amber); }
        .ai-input-row { display: flex; gap: 8px; margin-bottom: 12px; }
        .ai-input {
          flex: 1; background: #f8fafc; border: 1.5px solid var(--border);
          border-radius: 14px; padding: 11px 14px;
          color: var(--text); font-family: 'Inter', sans-serif; font-size: 0.88rem;
          outline: none; transition: border-color 0.2s, box-shadow 0.2s;
          -webkit-appearance: none;
        }
        .ai-input:focus { border-color: var(--purple); box-shadow: 0 0 0 3px #8b5cf620; }
        .ai-btn {
          background: linear-gradient(135deg, #8b5cf6, #6366f1);
          color: white; border: none; border-radius: 14px;
          padding: 11px 16px; font-family: 'Inter', sans-serif;
          font-size: 0.85rem; font-weight: 600; cursor: pointer;
          transition: opacity 0.2s, transform 0.15s;
          white-space: nowrap;
        }
        .ai-btn:active { transform: scale(0.96); }
        .ai-btn:disabled { opacity: 0.45; cursor: not-allowed; }
        .ai-progress {
          height: 3px; background: #f1f5f9; border-radius: 3px; overflow: hidden; margin-bottom: 12px;
        }
        .ai-progress-fill {
          height: 100%; background: linear-gradient(90deg, #8b5cf6, #6366f1);
          border-radius: 3px; animation: aiprog 1.4s ease-in-out infinite;
        }
        @keyframes aiprog { 0%{width:0%;margin-left:0} 50%{width:55%;margin-left:22%} 100%{width:0%;margin-left:100%} }
        .ai-error { font-size: 0.75rem; color: var(--red); margin-bottom: 10px; padding: 10px 12px; background: #fef2f2; border-radius: 10px; }
        .ai-result { display: flex; flex-direction: column; gap: 10px; }
        .ai-thresh-grid {
          display: grid; grid-template-columns: 1fr 1fr;
          gap: 8px; background: #f8fafc; border-radius: 14px; padding: 14px;
        }
        .ai-thresh-item { text-align: center; }
        .ai-thresh-val { font-family: 'DM Mono', monospace; font-size: 1.05rem; font-weight: 600; color: var(--amber); }
        .ai-thresh-key { font-size: 0.65rem; color: var(--muted); margin-top: 2px; text-transform: uppercase; letter-spacing: 0.05em; }
        .ai-advice-text { font-size: 0.8rem; line-height: 1.65; color: var(--muted); padding: 12px 14px; background: #f8fafc; border-radius: 14px; }
        .ai-empty { font-size: 0.78rem; color: var(--subtle); line-height: 1.6; text-align: center; padding: 8px 0; }

        /* ── Footer ── */
        .footer { text-align: center; font-size: 0.68rem; color: var(--subtle); font-family: 'DM Mono', monospace; padding: 8px 0 4px; }

        /* ── PWA safe area ── */
        @supports (padding: max(0px)) {
          .app { padding-bottom: max(40px, env(safe-area-inset-bottom)); }
        }
      `}</style>

      <div className="app">
        {/* Header */}
        <div className="header">
          <div>
            <div className="header-title">🌱 Greenhouse<br/>Monitor</div>
            <div className="header-sub">Temperature &amp; Humidity Control</div>
          </div>
          <div className="live-badge">
            <span className={`live-dot ${connected ? "on" : ""}`} />
            {connected ? "Live" : "Offline"}
          </div>
        </div>

        {/* Health Hero */}
        <div className="health-card glass">
          <ScoreRing score={score} />
          <div className="health-right">
            <p className="health-plant-name">{thresh.plant || "No plant set"}</p>
            <p className="health-headline" style={{ color: health.color }}>{health.label}</p>
            <p className="health-advice">
              {thresh.advice || "Ask the AI to set optimal thresholds for your plant."}
            </p>
          </div>
        </div>

        {/* RGB LED + Notification */}
        <div className="rgb-card glass">
          <div className="rgb-label-row">
            <span className="rgb-title">ESP32 RGB Status</span>
            <RGBDot fanOn={fanOn} pumpOn={pumpOn} autoMode={autoMode} />
          </div>
          <button className={`notif-btn ${notifGranted ? "granted" : ""}`}
            onClick={() => requestNotificationPermission().then(setNotifGranted)}>
            {notifGranted ? "🔔 Alerts on" : "🔕 Enable alerts"}
          </button>
        </div>

        {/* Metrics */}
        <div className="metrics">
          <Metric value={latest.temperature} unit="°C" label="Temperature"
            lowThresh={thresh.temp_low} highThresh={thresh.temp_high} color="#ef4444" />
          <Metric value={latest.humidity} unit="%" label="Humidity"
            lowThresh={thresh.humid_low} highThresh={thresh.humid_high} color="#3b82f6" />
        </div>

        {/* Indicators */}
        <div className="indicators">
          <IndicatorCard active={fanOn}    color="#3b82f6" icon="💨" label="Fan"
            sub={{ on: "Running", off: "Idle" }} />
          <IndicatorCard active={pumpOn}   color="#22c55e" icon="💧" label="Pump"
            sub={{ on: "Misting", off: "Idle" }} />
          <IndicatorCard active={autoMode} color="#f59e0b" icon="⚡" label="Auto"
            sub={{ on: "Auto", off: "Manual" }} />
        </div>

        {/* Charts */}
        <div className="charts">
          <Chart data={history} dataKey="temperature" color="#ef4444"
            label="Temperature" unit="°C" refLow={thresh.temp_low} refHigh={thresh.temp_high} />
          <Chart data={history} dataKey="humidity" color="#3b82f6"
            label="Humidity" unit="%" refLow={thresh.humid_low} refHigh={thresh.humid_high} />
        </div>

        {/* Controls */}
        <div className="controls-card glass">
          <p className="section-title">Controls</p>
          <div className="controls-grid">
            <Toggle active={autoMode} onToggle={toggleAuto} label="Auto Mode" color="#f59e0b" />
            <Toggle active={fanOn}    onToggle={toggleFan}  label="Fan"        color="#3b82f6" disabled={autoMode} />
            <Toggle active={pumpOn}   onToggle={togglePump} label="Pump"       color="#22c55e" disabled={autoMode} />
          </div>
          {autoMode && <p className="ctrl-hint">Switch to Manual to override controls</p>}
        </div>

        {/* AI Panel */}
        <div className="ai-card glass">
          <div className="ai-header-row">
            <span className="ai-badge">✦ Gemini AI</span>
            {thresh.plant && <span className="ai-active">Active: <strong>{thresh.plant}</strong></span>}
          </div>
          <div className="ai-input-row">
            <input className="ai-input" value={plant}
              onChange={e => setPlant(e.target.value)}
              onKeyDown={e => e.key === "Enter" && askAI()}
              placeholder="Enter plant name…" />
            <button className="ai-btn" onClick={askAI} disabled={aiLoading}>
              {aiLoading ? "…" : "Set & Control"}
            </button>
          </div>
          {aiLoading && <div className="ai-progress"><div className="ai-progress-fill" /></div>}
          {aiError && <div className="ai-error">⚠ {aiError}</div>}
          {thresh.advice ? (
            <div className="ai-result">
              <div className="ai-thresh-grid">
                <div className="ai-thresh-item">
                  <div className="ai-thresh-val">{thresh.temp_low}–{thresh.temp_high}°C</div>
                  <div className="ai-thresh-key">Temperature</div>
                </div>
                <div className="ai-thresh-item">
                  <div className="ai-thresh-val">{thresh.humid_low}–{thresh.humid_high}%</div>
                  <div className="ai-thresh-key">Humidity</div>
                </div>
              </div>
              <div className="ai-advice-text">{thresh.advice}</div>
            </div>
          ) : !aiLoading && (
            <p className="ai-empty">Type a plant and tap Set &amp; Control — AI will configure optimal thresholds automatically.</p>
          )}
        </div>

        <p className="footer">Updated {latest.ts || "--"}</p>
      </div>
    </>
  );
}
