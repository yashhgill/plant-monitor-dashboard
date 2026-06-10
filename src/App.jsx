import { useState, useEffect, useRef, useCallback } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

// ── Translations ──────────────────────────────
const T = {
  en: {
    appName:        "AI Planter",
    appSub:         "Smart Greenhouse Control",
    live:           "Live",
    espOffline:     "ESP32 Offline",
    backendOffline: "Offline",
    noPlant:        "No plant set",
    askAI:          "Ask AI to set thresholds for your plant.",
    rgbTitle:       "ESP32 RGB Status",
    enableAlerts:   "🔕 Enable alerts",
    alertsOn:       "🔔 Alerts on",
    addToHome:      "Add to Home Screen to enable alerts",
    temperature:    "Temperature",
    humidity:       "Humidity",
    optimal:        "Optimal",
    tooLow:         "Too low",
    tooHigh:        "Too high",
    fan:            "Fan",
    pump:           "Pump",
    auto:           "Auto",
    running:        "Running",
    misting:        "Misting",
    idle:           "Idle",
    manual:         "Manual",
    controls:       "Controls",
    autoMode:       "Auto Mode",
    manualHint:     "Switch to Manual to override",
    aiTitle:        "✦ AI Planter",
    aiActive:       "Active:",
    aiPlaceholder:  "Enter plant name…",
    aiBtn:          "Set & Control",
    aiLoading:      "Thinking…",
    aiEmpty:        "Enter a plant and tap Set & Control — AI will configure optimal thresholds.",
    aiFail:         "AI request failed. Check GROQ_API_KEY on your backend.",
    tempRange:      "Temperature",
    humidRange:     "Humidity",
    updated:        "Updated",
    thriving:       "Thriving",
    good:           "Good",
    fair:           "Fair",
    stressed:       "Stressed",
    standby:        "Standby",
    fanActive:      "Fan active",
    pumpActive:     "Pump active",
    fanPump:        "Fan + Pump",
    manualMode:     "Manual",
    notifFan:       ["🌿 AI Planter", "Fan ON — temperature high"],
    notifFanOff:    ["🌿 AI Planter", "Fan OFF — temperature normal"],
    notifPump:      ["🌿 AI Planter", "Pump ON — humidity low"],
    notifPumpOff:   ["🌿 AI Planter", "Pump OFF — humidity restored"],
    notifStress:    ["⚠️ Plant Alert", (s) => `Plant stressed! Score: ${s}/100`],
    notifAI:        ["🌿 AI Planter", (p) => `Thresholds set for ${p}`],
    notifAlerts:    ["🌿 AI Planter", "Alerts are now enabled!"],
  },
  ms: {
    appName:        "AI Planter",
    appSub:         "Kawalan Rumah Hijau Pintar",
    live:           "Langsung",
    espOffline:     "ESP32 Luar Talian",
    backendOffline: "Luar Talian",
    noPlant:        "Tiada pokok dipilih",
    askAI:          "Tanya AI untuk tetapkan ambang bagi pokok anda.",
    rgbTitle:       "Status RGB ESP32",
    enableAlerts:   "🔕 Aktifkan amaran",
    alertsOn:       "🔔 Amaran aktif",
    addToHome:      "Tambah ke Skrin Utama untuk amaran",
    temperature:    "Suhu",
    humidity:       "Kelembapan",
    optimal:        "Optimum",
    tooLow:         "Terlalu rendah",
    tooHigh:        "Terlalu tinggi",
    fan:            "Kipas",
    pump:           "Pam",
    auto:           "Auto",
    running:        "Berjalan",
    misting:        "Menyembur",
    idle:           "Rehat",
    manual:         "Manual",
    controls:       "Kawalan",
    autoMode:       "Mod Auto",
    manualHint:     "Tukar ke Manual untuk kawal sendiri",
    aiTitle:        "✦ AI Planter",
    aiActive:       "Aktif:",
    aiPlaceholder:  "Masukkan nama pokok…",
    aiBtn:          "Tetap & Kawal",
    aiLoading:      "Sedang berfikir…",
    aiEmpty:        "Masukkan nama pokok dan ketik Tetap & Kawal — AI akan tetapkan ambang optimum.",
    aiFail:         "Permintaan AI gagal. Semak GROQ_API_KEY di backend anda.",
    tempRange:      "Suhu",
    humidRange:     "Kelembapan",
    updated:        "Dikemas kini",
    thriving:       "Subur",
    good:           "Baik",
    fair:           "Sederhana",
    stressed:       "Tertekan",
    standby:        "Sedia",
    fanActive:      "Kipas aktif",
    pumpActive:     "Pam aktif",
    fanPump:        "Kipas + Pam",
    manualMode:     "Manual",
    notifFan:       ["🌿 AI Planter", "Kipas ON — suhu tinggi"],
    notifFanOff:    ["🌿 AI Planter", "Kipas OFF — suhu normal"],
    notifPump:      ["🌿 AI Planter", "Pam ON — kelembapan rendah"],
    notifPumpOff:   ["🌿 AI Planter", "Pam OFF — kelembapan pulih"],
    notifStress:    ["⚠️ Amaran Pokok", (s) => `Pokok tertekan! Skor: ${s}/100`],
    notifAI:        ["🌿 AI Planter", (p) => `Ambang ditetapkan untuk ${p}`],
    notifAlerts:    ["🌿 AI Planter", "Amaran telah diaktifkan!"],
  },
};

// ── Push Notifications ────────────────────────
async function requestNotificationPermission() {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  const perm = await Notification.requestPermission();
  return perm === "granted";
}
function sendNotification(title, body) {
  if (Notification.permission !== "granted") return;
  new Notification(title, { body, icon: "/icon-192.png" });
}

// ── Health Score ──────────────────────────────
function calcHealth(temp, humid, t) {
  let score = 100;
  if (temp  > t.temp_high)  score -= Math.min(40, (temp  - t.temp_high)  * 8);
  if (temp  < t.temp_low)   score -= Math.min(40, (t.temp_low  - temp)   * 8);
  if (humid > t.humid_high) score -= Math.min(30, (humid - t.humid_high) * 3);
  if (humid < t.humid_low)  score -= Math.min(30, (t.humid_low  - humid) * 3);
  return Math.max(0, Math.round(score));
}
function healthMeta(score, t) {
  if (score >= 85) return { key: "thriving", color: "#22c55e" };
  if (score >= 60) return { key: "good",     color: "#84cc16" };
  if (score >= 40) return { key: "fair",     color: "#f59e0b" };
  return               { key: "stressed", color: "#ef4444" };
}

// ── RGB Dot ───────────────────────────────────
function RGBDot({ fanOn, pumpOn, autoMode, t }) {
  let color, labelKey;
  if (!autoMode)            { color = "#a855f7"; labelKey = "manualMode"; }
  else if (fanOn && pumpOn) { color = "#06b6d4"; labelKey = "fanPump"; }
  else if (fanOn)           { color = "#3b82f6"; labelKey = "fanActive"; }
  else if (pumpOn)          { color = "#22c55e"; labelKey = "pumpActive"; }
  else                      { color = "#d1d5db"; labelKey = "standby"; }
  return (
    <div className="rgb-wrap">
      <div className="rgb-orb" style={{ background: color, boxShadow: `0 0 18px ${color}99, 0 0 6px ${color}` }} />
      <span className="rgb-label" style={{ color }}>{t[labelKey]}</span>
    </div>
  );
}

// ── Score Ring ────────────────────────────────
function ScoreRing({ score, label, color }) {
  const r = 44, circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  return (
    <div className="score-ring-wrap">
      <svg viewBox="0 0 100 100" width="100" height="100">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#f1f5f9" strokeWidth="8" />
        <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={`${dash} ${circ}`} strokeDashoffset={circ * 0.25}
          strokeLinecap="round" style={{ transition: "stroke-dasharray 0.8s ease, stroke 0.4s" }} />
        <text x="50" y="46" textAnchor="middle" fill="#0f172a" fontSize="22" fontWeight="700" fontFamily="Inter, sans-serif">{score}</text>
        <text x="50" y="60" textAnchor="middle" fill="#94a3b8" fontSize="9" fontFamily="Inter, sans-serif">/ 100</text>
      </svg>
      <p className="score-label" style={{ color }}>{label}</p>
    </div>
  );
}

// ── Metric Card ───────────────────────────────
function Metric({ value, unit, label, lowThresh, highThresh, color, t }) {
  const ok = value >= lowThresh && value <= highThresh;
  const statusKey = ok ? "optimal" : value < lowThresh ? "tooLow" : "tooHigh";
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
        <span className="metric-status-text" style={{ color: statusColor }}>{t[statusKey]}</span>
        <span className="metric-range">{lowThresh}–{highThresh}{unit}</span>
      </div>
      <div className="metric-bar-bg">
        <div className="metric-bar-fill" style={{
          width: `${Math.min(100, Math.max(0, ((value - (lowThresh - 5)) / ((highThresh + 5) - (lowThresh - 5))) * 100))}%`,
          background: statusColor, transition: "width 0.6s ease, background 0.4s"
        }} />
        <div className="metric-bar-zone" style={{
          left:  `${((lowThresh - (lowThresh - 5)) / ((highThresh + 5) - (lowThresh - 5))) * 100}%`,
          width: `${((highThresh - lowThresh)      / ((highThresh + 5) - (lowThresh - 5))) * 100}%`,
        }} />
      </div>
    </div>
  );
}

// ── Indicator Card ────────────────────────────
function IndicatorCard({ active, color, icon, label, subOn, subOff }) {
  return (
    <div className={`indicator-card glass ${active ? "active" : ""}`} style={{ "--ic": color }}>
      <div className="ind-icon-wrap" style={{ background: active ? `${color}18` : "#f8fafc" }}>
        <span className="ind-icon">{icon}</span>
        {active && <span className="ind-pulse" style={{ background: color }} />}
      </div>
      <p className="ind-label">{label}</p>
      <p className="ind-sub" style={{ color: active ? color : "#94a3b8" }}>{active ? subOn : subOff}</p>
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

// ── Toggle Button ─────────────────────────────
function Toggle({ active, onToggle, label, disabled, color = "#22c55e" }) {
  return (
    <button className={`ctrl-toggle ${active ? "on" : "off"} ${disabled ? "dim" : ""}`}
      onClick={onToggle} disabled={disabled}
      style={active ? { borderColor: color, background: `${color}12`, color } : {}}>
      <div className="track" style={active ? { background: color } : {}}>
        <div className="thumb" />
      </div>
      <span>{label}</span>
    </button>
  );
}

// ── Lang Toggle ───────────────────────────────
function LangToggle({ lang, setLang }) {
  return (
    <button className="lang-btn" onClick={() => setLang(l => l === "en" ? "ms" : "en")}>
      {lang === "en" ? "🇲🇾 BM" : "🇬🇧 EN"}
    </button>
  );
}

// ── Main App ──────────────────────────────────
export default function App() {
  const [lang, setLang]           = useState(() => localStorage.getItem("aiplanter_lang") || "en");
  const t = T[lang];

  const [latest, setLatest]       = useState({ temperature: 0, humidity: 0, fan: false, pump: false, auto: true, ts: "--" });
  const [history, setHistory]     = useState([]);
  const [thresh, setThresh]       = useState({ temp_high: 25, temp_low: 23, humid_low: 40, humid_high: 55, plant: "", advice: "" });
  const [autoMode, setAutoMode]   = useState(true);
  const [fanOn, setFanOn]         = useState(false);
  const [pumpOn, setPumpOn]       = useState(false);
  const [plant, setPlant]         = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError]     = useState("");
  const [backendOk, setBackendOk] = useState(false);
  const [espOk, setEspOk]         = useState(false);
  const [notifGranted, setNotifGranted]   = useState(false);
  const [notifSupported, setNotifSupported] = useState(false);

  const pendingRef = useRef({});
  const prevStates = useRef({ fan: false, pump: false, health: 100 });
  const lastEspTs  = useRef("--");

  // Persist language choice
  useEffect(() => { localStorage.setItem("aiplanter_lang", lang); }, [lang]);

  const score  = calcHealth(latest.temperature, latest.humidity, thresh);
  const health = healthMeta(score);

  // ── Notifications setup ──────────────────────
  useEffect(() => {
    const supported = "Notification" in window;
    setNotifSupported(supported);
    if (supported && Notification.permission === "granted") setNotifGranted(true);
  }, []);

  const handleNotifBtn = async () => {
    const ok = await requestNotificationPermission();
    setNotifGranted(ok);
    if (ok) sendNotification(...t.notifAlerts);
  };

  // Watch ESP state changes → notify
  useEffect(() => {
    const prev = prevStates.current;
    if (fanOn  && !prev.fan)          sendNotification(...t.notifFan);
    if (!fanOn && prev.fan)           sendNotification(...t.notifFanOff);
    if (pumpOn && !prev.pump)         sendNotification(...t.notifPump);
    if (!pumpOn && prev.pump)         sendNotification(...t.notifPumpOff);
    if (score < 40 && prev.health >= 40) sendNotification(t.notifStress[0], t.notifStress[1](score));
    prevStates.current = { fan: fanOn, pump: pumpOn, health: score };
  }, [fanOn, pumpOn, score]);

  // ── Poll backend ─────────────────────────────
  const poll = useCallback(async () => {
    try {
      const r = await fetch(`${API}/data`, { signal: AbortSignal.timeout(4000) });
      if (!r.ok) throw new Error();
      const d = await r.json();
      setBackendOk(true);
      if (d.thresholds) setThresh(d.thresholds);

      const newTs = d.latest?.ts || "--";
      if (newTs !== "--" && newTs !== lastEspTs.current) {
        setEspOk(true);
        lastEspTs.current = newTs;
        setLatest(d.latest);
        setHistory(d.history);
        if (pendingRef.current.auto  === undefined) setAutoMode(d.latest.auto);
        if (pendingRef.current.fan   === undefined) setFanOn(d.latest.fan);
        if (pendingRef.current.pump  === undefined) setPumpOn(d.latest.pump);
      } else if (newTs === lastEspTs.current && newTs !== "--") {
        setEspOk(false);
      }
    } catch {
      setBackendOk(false);
      setEspOk(false);
    }
  }, []);

  useEffect(() => {
    poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, [poll]);

  const clearPending = (key) => setTimeout(() => {
    pendingRef.current = { ...pendingRef.current, [key]: undefined };
  }, 8000);

  // ── Commands ─────────────────────────────────
  const send = (payload) => fetch(`${API}/control`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
  });

  const toggleAuto = () => {
    const n = !autoMode;
    setAutoMode(n);
    pendingRef.current.auto = n;
    clearPending("auto");
    send({ auto: n });
    if (n) {
      setFanOn(false); setPumpOn(false);
      pendingRef.current.fan = undefined;
      pendingRef.current.pump = undefined;
    }
  };
  const toggleFan = () => {
    if (autoMode) return;
    const n = !fanOn; setFanOn(n);
    pendingRef.current.fan = n; clearPending("fan");
    send({ fan: n });
  };
  const togglePump = () => {
    if (autoMode) return;
    const n = !pumpOn; setPumpOn(n);
    pendingRef.current.pump = n; clearPending("pump");
    send({ pump: n });
  };

  // ── AI ────────────────────────────────────────
  const askAI = async () => {
    if (!plant.trim()) return;
    setAiLoading(true); setAiError("");
    try {
      const r = await fetch(`${API}/ai-advice?plant=${encodeURIComponent(plant)}`);
      if (!r.ok) throw new Error(await r.text());
      const d = await r.json();
      if (d.thresholds) {
        setThresh(d.thresholds);
        sendNotification(t.notifAI[0], t.notifAI[1](plant));
      }
    } catch { setAiError(t.aiFail); }
    setAiLoading(false);
  };

  // ── Connection label ─────────────────────────
  const connStatus = !backendOk ? t.backendOffline : !espOk ? t.espOffline : t.live;
  const connDot    = espOk ? "on" : backendOk ? "warn" : "";

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
          --bg:      #f0f4f8;
          --surface: rgba(255,255,255,0.75);
          --border:  rgba(0,0,0,0.07);
          --shadow:  0 2px 20px rgba(0,0,0,0.07), 0 1px 4px rgba(0,0,0,0.04);
          --text:    #0f172a;
          --muted:   #64748b;
          --subtle:  #94a3b8;
          --green:   #22c55e;
          --blue:    #3b82f6;
          --amber:   #f59e0b;
          --red:     #ef4444;
          --purple:  #8b5cf6;
          --radius:  20px;
        }
        html { -webkit-text-size-adjust: 100%; }
        body {
          background: var(--bg);
          background-image:
            radial-gradient(ellipse at 20% 0%, #dcfce7 0%, transparent 50%),
            radial-gradient(ellipse at 80% 0%, #dbeafe 0%, transparent 50%);
          background-attachment: fixed;
          color: var(--text);
          font-family: 'Inter', -apple-system, sans-serif;
          min-height: 100dvh;
          padding-bottom: env(safe-area-inset-bottom);
        }
        .app {
          max-width: 430px; margin: 0 auto;
          padding: 0 16px 48px;
          padding-top: env(safe-area-inset-top, 0px);
        }
        .glass {
          background: var(--surface);
          backdrop-filter: blur(20px) saturate(180%);
          -webkit-backdrop-filter: blur(20px) saturate(180%);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          box-shadow: var(--shadow);
        }

        /* ── Header ── */
        .header { padding: 20px 0 16px; display: flex; align-items: flex-start; justify-content: space-between; }
        .header-left { flex: 1; }
        .header-title { font-size: 1.3rem; font-weight: 700; letter-spacing: -0.03em; line-height: 1.2; }
        .header-sub { font-size: 0.75rem; color: var(--muted); margin-top: 3px; }
        .header-right { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
        .live-badge {
          display: flex; align-items: center; gap: 5px;
          background: white; border: 1px solid var(--border);
          border-radius: 20px; padding: 5px 10px;
          font-size: 0.72rem; font-weight: 500; color: var(--muted);
          box-shadow: var(--shadow);
        }
        .live-dot { width: 7px; height: 7px; border-radius: 50%; background: #d1d5db; }
        .live-dot.on   { background: var(--green); box-shadow: 0 0 0 3px #dcfce7; animation: livepulse 2s infinite; }
        .live-dot.warn { background: var(--amber); box-shadow: 0 0 0 3px #fef3c7; }
        @keyframes livepulse { 0%,100%{opacity:1} 50%{opacity:0.5} }

        /* Language toggle */
        .lang-btn {
          background: white; border: 1px solid var(--border);
          border-radius: 20px; padding: 5px 12px;
          font-size: 0.72rem; font-weight: 600; color: var(--muted);
          cursor: pointer; box-shadow: var(--shadow);
          transition: all 0.18s;
        }
        .lang-btn:active { transform: scale(0.94); }

        /* ── Health card ── */
        .health-card { padding: 20px; margin-bottom: 14px; display: flex; align-items: center; gap: 16px; }
        .health-right { flex: 1; }
        .health-plant-name { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); margin-bottom: 4px; }
        .health-headline { font-size: 1.5rem; font-weight: 700; letter-spacing: -0.02em; line-height: 1.1; }
        .health-advice { font-size: 0.75rem; color: var(--muted); margin-top: 6px; line-height: 1.5;
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .score-ring-wrap { display: flex; flex-direction: column; align-items: center; gap: 4px; flex-shrink: 0; }
        .score-label { font-size: 0.72rem; font-weight: 600; letter-spacing: 0.02em; }

        /* ── RGB card ── */
        .rgb-card { padding: 14px 20px; margin-bottom: 14px; display: flex; align-items: center; justify-content: space-between; }
        .rgb-label-row { display: flex; flex-direction: column; gap: 6px; }
        .rgb-title { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); }
        .rgb-wrap { display: flex; align-items: center; gap: 10px; }
        .rgb-orb { width: 28px; height: 28px; border-radius: 50%; transition: background 0.4s, box-shadow 0.4s; }
        .rgb-label { font-size: 0.8rem; font-weight: 600; transition: color 0.4s; }
        .notif-btn {
          background: #f8fafc; border: 1px solid var(--border); border-radius: 12px;
          padding: 7px 13px; font-size: 0.75rem; font-weight: 500; color: var(--muted);
          cursor: pointer; transition: all 0.2s;
        }
        .notif-btn.granted { background: #f0fdf4; border-color: #bbf7d0; color: var(--green); }
        .notif-btn:active { transform: scale(0.96); }
        .notif-ios-hint { display: flex; align-items: center; gap: 6px; font-size: 0.68rem; color: var(--muted); line-height: 1.3; }

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
        .ind-pulse { position: absolute; inset: -3px; border-radius: 16px; opacity: 0.25; animation: indpulse 2s infinite; }
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
          color: var(--muted); cursor: pointer; transition: all 0.22s; text-align: left;
        }
        .ctrl-toggle.on { font-weight: 600; }
        .ctrl-toggle.dim { opacity: 0.38; cursor: not-allowed; }
        .ctrl-toggle:active:not(.dim) { transform: scale(0.98); }
        .track { width: 40px; height: 24px; border-radius: 12px; background: #e2e8f0; position: relative; transition: background 0.22s; flex-shrink: 0; }
        .thumb { position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 9px; background: white; box-shadow: 0 1px 4px rgba(0,0,0,0.18); transition: transform 0.22s; }
        .ctrl-toggle.on .thumb { transform: translateX(16px); }
        .ctrl-hint { font-size: 0.7rem; color: var(--subtle); text-align: center; margin-top: 8px; }

        /* ── AI Panel ── */
        .ai-card { padding: 20px; margin-bottom: 14px; }
        .ai-header-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
        .ai-badge { background: linear-gradient(135deg, #22c55e, #16a34a); color: white; border-radius: 8px; padding: 3px 9px; font-size: 0.68rem; font-weight: 600; letter-spacing: 0.04em; }
        .ai-active { font-size: 0.72rem; color: var(--muted); font-family: 'DM Mono', monospace; }
        .ai-active strong { color: var(--amber); }
        .ai-input-row { display: flex; gap: 8px; margin-bottom: 12px; }
        .ai-input {
          flex: 1; background: #f8fafc; border: 1.5px solid var(--border);
          border-radius: 14px; padding: 11px 14px; color: var(--text);
          font-family: 'Inter', sans-serif; font-size: 0.88rem; outline: none;
          transition: border-color 0.2s, box-shadow 0.2s; -webkit-appearance: none;
        }
        .ai-input:focus { border-color: var(--green); box-shadow: 0 0 0 3px #22c55e20; }
        .ai-btn { background: linear-gradient(135deg, #22c55e, #16a34a); color: white; border: none; border-radius: 14px; padding: 11px 16px; font-family: 'Inter', sans-serif; font-size: 0.85rem; font-weight: 600; cursor: pointer; transition: opacity 0.2s, transform 0.15s; white-space: nowrap; }
        .ai-btn:active { transform: scale(0.96); }
        .ai-btn:disabled { opacity: 0.45; cursor: not-allowed; }
        .ai-progress { height: 3px; background: #f1f5f9; border-radius: 3px; overflow: hidden; margin-bottom: 12px; }
        .ai-progress-fill { height: 100%; background: linear-gradient(90deg, #22c55e, #16a34a); border-radius: 3px; animation: aiprog 1.4s ease-in-out infinite; }
        @keyframes aiprog { 0%{width:0%;margin-left:0} 50%{width:55%;margin-left:22%} 100%{width:0%;margin-left:100%} }
        .ai-error { font-size: 0.75rem; color: var(--red); margin-bottom: 10px; padding: 10px 12px; background: #fef2f2; border-radius: 10px; }
        .ai-result { display: flex; flex-direction: column; gap: 10px; }
        .ai-thresh-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; background: #f8fafc; border-radius: 14px; padding: 14px; }
        .ai-thresh-item { text-align: center; }
        .ai-thresh-val { font-family: 'DM Mono', monospace; font-size: 1.05rem; font-weight: 600; color: var(--amber); }
        .ai-thresh-key { font-size: 0.65rem; color: var(--muted); margin-top: 2px; text-transform: uppercase; letter-spacing: 0.05em; }
        .ai-advice-text { font-size: 0.8rem; line-height: 1.65; color: var(--muted); padding: 12px 14px; background: #f8fafc; border-radius: 14px; }
        .ai-empty { font-size: 0.78rem; color: var(--subtle); line-height: 1.6; text-align: center; padding: 8px 0; }

        .footer { text-align: center; font-size: 0.68rem; color: var(--subtle); font-family: 'DM Mono', monospace; padding: 8px 0 4px; }

        @supports (padding: max(0px)) {
          .app { padding-bottom: max(48px, env(safe-area-inset-bottom)); }
        }
      `}</style>

      <div className="app">

        {/* Header */}
        <div className="header">
          <div className="header-left">
            <div className="header-title">🌱 {t.appName}</div>
            <div className="header-sub">{t.appSub}</div>
          </div>
          <div className="header-right">
            <div className="live-badge">
              <span className={`live-dot ${connDot}`} />
              {connStatus}
            </div>
            <LangToggle lang={lang} setLang={setLang} />
          </div>
        </div>

        {/* Health Hero */}
        <div className="health-card glass">
          <ScoreRing score={score} label={t[health.key]} color={health.color} />
          <div className="health-right">
            <p className="health-plant-name">{thresh.plant || t.noPlant}</p>
            <p className="health-headline" style={{ color: health.color }}>{t[health.key]}</p>
            <p className="health-advice">{thresh.advice || t.askAI}</p>
          </div>
        </div>

        {/* RGB + Notifications */}
        <div className="rgb-card glass">
          <div className="rgb-label-row">
            <span className="rgb-title">{t.rgbTitle}</span>
            <RGBDot fanOn={fanOn} pumpOn={pumpOn} autoMode={autoMode} t={t} />
          </div>
          {notifSupported ? (
            <button className={`notif-btn ${notifGranted ? "granted" : ""}`} onClick={handleNotifBtn}>
              {notifGranted ? t.alertsOn : t.enableAlerts}
            </button>
          ) : (
            <div className="notif-ios-hint">
              <span>🔔</span><span>{t.addToHome}</span>
            </div>
          )}
        </div>

        {/* Metrics */}
        <div className="metrics">
          <Metric value={latest.temperature} unit="°C" label={t.temperature}
            lowThresh={thresh.temp_low} highThresh={thresh.temp_high} color="#ef4444" t={t} />
          <Metric value={latest.humidity} unit="%" label={t.humidity}
            lowThresh={thresh.humid_low} highThresh={thresh.humid_high} color="#3b82f6" t={t} />
        </div>

        {/* Indicators */}
        <div className="indicators">
          <IndicatorCard active={fanOn}    color="#3b82f6" icon="💨"
            label={t.fan}  subOn={t.running} subOff={t.idle} />
          <IndicatorCard active={pumpOn}   color="#22c55e" icon="💧"
            label={t.pump} subOn={t.misting} subOff={t.idle} />
          <IndicatorCard active={autoMode} color="#f59e0b" icon="⚡"
            label={t.auto} subOn={t.auto}    subOff={t.manual} />
        </div>

        {/* Charts */}
        <div className="charts">
          <Chart data={history} dataKey="temperature" color="#ef4444"
            label={t.temperature} unit="°C" refLow={thresh.temp_low} refHigh={thresh.temp_high} />
          <Chart data={history} dataKey="humidity" color="#3b82f6"
            label={t.humidity} unit="%" refLow={thresh.humid_low} refHigh={thresh.humid_high} />
        </div>

        {/* Controls */}
        <div className="controls-card glass">
          <p className="section-title">{t.controls}</p>
          <div className="controls-grid">
            <Toggle active={autoMode} onToggle={toggleAuto} label={t.autoMode} color="#f59e0b" />
            <Toggle active={fanOn}    onToggle={toggleFan}  label={t.fan}      color="#3b82f6" disabled={autoMode} />
            <Toggle active={pumpOn}   onToggle={togglePump} label={t.pump}     color="#22c55e" disabled={autoMode} />
          </div>
          {autoMode && <p className="ctrl-hint">{t.manualHint}</p>}
        </div>

        {/* AI Panel */}
        <div className="ai-card glass">
          <div className="ai-header-row">
            <span className="ai-badge">{t.aiTitle}</span>
            {thresh.plant && <span className="ai-active">{t.aiActive} <strong>{thresh.plant}</strong></span>}
          </div>
          <div className="ai-input-row">
            <input className="ai-input" value={plant}
              onChange={e => setPlant(e.target.value)}
              onKeyDown={e => e.key === "Enter" && askAI()}
              placeholder={t.aiPlaceholder} />
            <button className="ai-btn" onClick={askAI} disabled={aiLoading}>
              {aiLoading ? t.aiLoading : t.aiBtn}
            </button>
          </div>
          {aiLoading && <div className="ai-progress"><div className="ai-progress-fill" /></div>}
          {aiError && <div className="ai-error">⚠ {aiError}</div>}
          {thresh.advice ? (
            <div className="ai-result">
              <div className="ai-thresh-grid">
                <div className="ai-thresh-item">
                  <div className="ai-thresh-val">{thresh.temp_low}–{thresh.temp_high}°C</div>
                  <div className="ai-thresh-key">{t.tempRange}</div>
                </div>
                <div className="ai-thresh-item">
                  <div className="ai-thresh-val">{thresh.humid_low}–{thresh.humid_high}%</div>
                  <div className="ai-thresh-key">{t.humidRange}</div>
                </div>
              </div>
              <div className="ai-advice-text">{thresh.advice}</div>
            </div>
          ) : !aiLoading && (
            <p className="ai-empty">{t.aiEmpty}</p>
          )}
        </div>

        <p className="footer">{t.updated} {latest.ts || "--"}</p>
      </div>
    </>
  );
}
