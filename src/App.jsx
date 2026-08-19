import { useState, useEffect, useRef, useCallback } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

const T = {
  en: {
    sub:"Smart Greenhouse Control", live:"Live", espOff:"Sensor offline", netOff:"Offline",
    temp:"Temperature", humid:"Humidity", optimal:"In range", low:"Below range", high:"Above range",
    fan:"Fan", mist:"Mist Maker", auto:"Auto",
    running:"Running", misting:"Active", idle:"Idle", manual:"Manual",
    controls:"Controls", autoMode:"Auto Mode", fanCtrl:"Fan", mistCtrl:"Mist Maker",
    autoHint:"Turn off Auto to override",
    aiTitle:"What are you growing?",
    aiPlaceholder:"Type a plant — tomato, orchid, basil…",
    aiBtn:"Set", aiLoading:"Thinking…",
    aiAdvice:"Care notes",
    aiEmpty:"Type a plant name and tap Set — the AI will configure optimal temperature and humidity thresholds automatically.",
    aiFail:"AI unavailable — GROQ_API_KEY not set on backend.",
    thriving:"Thriving", good:"Good", fair:"Fair", stressed:"Stressed",
    health:"Health", score:"Score",
    standby:"Standby", fanAct:"Running", mistAct:"Active",
    fanMist:"Fan + Mist", manMode:"Manual",
    alertOn:"Alerts on", alertOff:"Enable alerts",
    alertIOS:"Add to Home Screen for alerts",
    updated:"Updated",
    idealTemp:"Ideal temp", idealHumid:"Ideal humidity",
    currentCond:"Current conditions",
    monitorTitle:"Monitoring",
  },
  ms: {
    sub:"Kawalan Rumah Hijau Pintar", live:"Langsung", espOff:"Penderia luar talian", netOff:"Luar Talian",
    temp:"Suhu", humid:"Kelembapan", optimal:"Dalam julat", low:"Terlalu rendah", high:"Terlalu tinggi",
    fan:"Kipas", mist:"Penjana Kabus", auto:"Auto",
    running:"Berjalan", misting:"Aktif", idle:"Rehat", manual:"Manual",
    controls:"Kawalan", autoMode:"Mod Auto", fanCtrl:"Kipas", mistCtrl:"Penjana Kabus",
    autoHint:"Matikan Auto untuk kawal sendiri",
    aiTitle:"Apa yang anda tanam?",
    aiPlaceholder:"Nama pokok — tomato, orkid, selasih…",
    aiBtn:"Tetap", aiLoading:"Berfikir…",
    aiAdvice:"Nota penjagaan",
    aiEmpty:"Taip nama pokok dan tekan Tetap — AI akan konfigurasi ambang suhu dan kelembapan optimum secara automatik.",
    aiFail:"AI tidak tersedia — GROQ_API_KEY belum ditetapkan.",
    thriving:"Subur", good:"Baik", fair:"Sederhana", stressed:"Tertekan",
    health:"Kesihatan", score:"Skor",
    standby:"Sedia", fanAct:"Berjalan", mistAct:"Aktif",
    fanMist:"Kipas + Kabus", manMode:"Manual",
    alertOn:"Amaran aktif", alertOff:"Aktifkan amaran",
    alertIOS:"Tambah ke Skrin Utama",
    updated:"Dikemas kini",
    idealTemp:"Suhu ideal", idealHumid:"Kelembapan ideal",
    currentCond:"Keadaan semasa",
    monitorTitle:"Pemantauan",
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
function healthMeta(score) {
  if (score >= 85) return { label:"Thriving", color:"#22C55E", bg:"rgba(34,197,94,0.12)" };
  if (score >= 65) return { label:"Good",     color:"#84CC16", bg:"rgba(132,204,22,0.12)" };
  if (score >= 40) return { label:"Fair",     color:"#F59E0B", bg:"rgba(245,158,11,0.12)" };
  return               { label:"Stressed", color:"#EF4444", bg:"rgba(239,68,68,0.12)" };
}
function getLED(fanOn, mistOn, auto_, t) {
  if (!auto_)          return { color:"#A78BFA", label:t.manMode };
  if (fanOn && mistOn) return { color:"#22D3EE", label:t.fanMist };
  if (fanOn)           return { color:"#60A5FA", label:t.fanAct };
  if (mistOn)          return { color:"#34D399", label:t.mistAct };
  return                      { color:"#374151", label:t.standby };
}

function Toggle({ on, color, disabled }) {
  return (
    <div style={{
      width:48, height:28, borderRadius:14, flexShrink:0,
      background: on && !disabled ? color : "#1F2937",
      position:"relative", transition:"background 0.25s",
      opacity: disabled ? 0.35 : 1,
      boxShadow: on && !disabled ? `0 0 12px ${color}60` : "none",
    }}>
      <div style={{
        position:"absolute", top:3, left: on ? 23 : 3,
        width:22, height:22, borderRadius:11,
        background:"white", transition:"left 0.22s",
        boxShadow:"0 1px 4px rgba(0,0,0,0.5)",
      }}/>
    </div>
  );
}

// Plant emoji map
function getPlantEmoji(name) {
  if (!name) return "🌱";
  const n = name.toLowerCase();
  if (n.includes("tomato") || n.includes("tomato")) return "🍅";
  if (n.includes("orchid") || n.includes("orkid"))  return "🌸";
  if (n.includes("basil")  || n.includes("selasih"))return "🌿";
  if (n.includes("chilli") || n.includes("cili"))   return "🌶️";
  if (n.includes("lettuce")|| n.includes("salad"))  return "🥬";
  if (n.includes("mint"))                            return "🌿";
  if (n.includes("rose"))                            return "🌹";
  if (n.includes("sunflower"))                       return "🌻";
  if (n.includes("herb"))                            return "🌿";
  return "🌱";
}

export default function App() {
  const [lang, setLang] = useState(() => localStorage.getItem("aip_lang") || "en");
  const t = T[lang];
  const [latest, setLatest]   = useState({ temperature:0, humidity:0, fan:false, pump:false, auto:true, ts:"--" });
  const [history, setHistory] = useState([]);
  const [thresh, setThresh]   = useState({ temp_high:25, temp_low:23, humid_low:40, humid_high:55, plant:"", advice:"" });
  const [autoMode, setAutoMode] = useState(true);
  const [fanOn,    setFanOn]    = useState(false);
  const [mistOn,   setMistOn]   = useState(false);
  const [plant,    setPlant]    = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError,   setAiError]   = useState("");
  const [backendOk, setBackendOk] = useState(false);
  const [espOk,     setEspOk]     = useState(false);
  const [notifOk,   setNotifOk]   = useState(false);
  const [changingPlant, setChangingPlant] = useState(false);
  const [notifSup,  setNotifSup]  = useState(false);
  const pendingRef = useRef({});
  const threshLockRef = useRef(false);
  const prevRef    = useRef({ fan:false, mist:false, health:100 });
  const lastTsRef  = useRef("--");

  useEffect(() => { localStorage.setItem("aip_lang", lang); }, [lang]);

  const score = calcHealth(latest.temperature, latest.humidity, thresh);
  const hm    = healthMeta(score);
  const led   = getLED(fanOn, mistOn, autoMode, t);
  const emoji = getPlantEmoji(thresh.plant);

  useEffect(() => {
    const s = "Notification" in window; setNotifSup(s);
    if (s && Notification.permission === "granted") setNotifOk(true);
  }, []);

  useEffect(() => {
    const p = prevRef.current;
    if (fanOn  && !p.fan)  notify("🌱 AI Planter", "Fan ON");
    if (!fanOn && p.fan)   notify("🌱 AI Planter", "Fan OFF");
    if (mistOn && !p.mist) notify("🌱 AI Planter", "Mist maker ON");
    if (!mistOn && p.mist) notify("🌱 AI Planter", "Mist maker OFF");
    if (score < 40 && p.health >= 40) notify("⚠️ AI Planter", `Plant stressed — ${score}/100`);
    prevRef.current = { fan:fanOn, mist:mistOn, health:score };
  }, [fanOn, mistOn, score]);

  const poll = useCallback(async () => {
    try {
      const r = await fetch(`${API}/data`, { signal: AbortSignal.timeout(4000) });
      if (!r.ok) throw new Error();
      const d = await r.json();
      setBackendOk(true);
      if (d.thresholds && !threshLockRef.current) setThresh(d.thresholds);
      const ts = d.latest?.ts || "--";
      if (ts !== "--" && ts !== lastTsRef.current) {
        setEspOk(true); lastTsRef.current = ts;
        setLatest(d.latest); setHistory(d.history);
        if (pendingRef.current.auto === undefined) setAutoMode(d.latest.auto);
        if (pendingRef.current.fan  === undefined) setFanOn(d.latest.fan);
        if (pendingRef.current.mist === undefined) setMistOn(d.latest.pump);
      } else if (ts === lastTsRef.current && ts !== "--") setEspOk(false);
    } catch { setBackendOk(false); setEspOk(false); }
  }, []);

  useEffect(() => { poll(); const id = setInterval(poll, 5000); return () => clearInterval(id); }, [poll]);

  const clearPend = k => setTimeout(() => { pendingRef.current = {...pendingRef.current, [k]:undefined}; }, 8000);
  const send = p => fetch(`${API}/control`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(p) });

  const toggleAuto = () => {
    const n = !autoMode; setAutoMode(n); pendingRef.current.auto = n; clearPend("auto"); send({ auto:n });
    if (n) { setFanOn(false); setMistOn(false); pendingRef.current.fan = undefined; pendingRef.current.mist = undefined; }
  };
  const toggleFan  = () => { if (autoMode) return; const n=!fanOn;  setFanOn(n);  pendingRef.current.fan=n;  clearPend("fan");  send({fan:n}); };
  const toggleMist = () => { if (autoMode) return; const n=!mistOn; setMistOn(n); pendingRef.current.mist=n; clearPend("mist"); send({pump:n}); };

  const askAI = async () => {
    if (!plant.trim()) return;
    setAiLoading(true); setAiError("");
    try {
      const r = await fetch(`${API}/ai-advice?plant=${encodeURIComponent(plant)}`);
      if (!r.ok) throw new Error(await r.text());
      const d = await r.json();
      if (d.thresholds) { setThresh({ ...d.thresholds, plant }); setChangingPlant(false); threshLockRef.current = true; setTimeout(()=>{ threshLockRef.current = false; }, 15000); notify("🌱 AI Planter", `Thresholds set for ${plant}`); }
    } catch (e) { setAiError(t.aiFail); }
    setAiLoading(false);
  };

  const connColor = espOk ? "#22C55E" : backendOk ? "#F59E0B" : "#EF4444";
  const connLabel = !backendOk ? t.netOff : !espOk ? t.espOff : t.live;

  // Health ring
  const R = 44, C2 = 2*Math.PI*R;
  const arc = (score/100)*C2*0.75;

  // Bar
  const barCalc = (val, low, high) => {
    const span = (high+6)-(low-6);
    return {
      pct: Math.min(100, Math.max(0, ((val-(low-6))/span)*100)),
      zl:  ((low-(low-6))/span)*100,
      zw:  ((high-low)/span)*100,
    };
  };

  const tempBar = barCalc(latest.temperature, thresh.temp_low, thresh.temp_high);
  const humBar  = barCalc(latest.humidity,    thresh.humid_low, thresh.humid_high);
  const tempOk  = latest.temperature >= thresh.temp_low && latest.temperature <= thresh.temp_high;
  const humOk   = latest.humidity    >= thresh.humid_low && latest.humidity   <= thresh.humid_high;
  const tempColor = tempOk ? "#22C55E" : latest.temperature < thresh.temp_low ? "#60A5FA" : "#EF4444";
  const humColor  = humOk  ? "#22C55E" : latest.humidity    < thresh.humid_low ? "#60A5FA" : "#EF4444";

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');

        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}

        :root {
          --bg:    #F6F8FA;
          --s1:    #FFFFFF;
          --s2:    #F1F5F9;
          --s3:    #E2E8F0;
          --bd:    #D0D7DE;
          --bd2:   #E2E8F0;
          --text:  #1A1A2E;
          --muted: #57606A;
          --dim:   #8C959F;
          --green: #22C55E;
          --blue:  #60A5FA;
          --amber: #F59E0B;
          --red:   #EF4444;
          --cyan:  #22D3EE;
          --purple:#A78BFA;
        }

        html{-webkit-text-size-adjust:100%;scroll-behavior:smooth;}
        body{
          background:var(--bg);
          color:var(--text);
          font-family:'Inter',sans-serif;
          min-height:100dvh;
          overscroll-behavior:none;
          -webkit-overflow-scrolling:touch;
        }

        .app{
          max-width:430px;
          margin:0 auto;
          padding:0 14px 80px;
          padding-top:max(52px, env(safe-area-inset-top, 52px));
        }

        /* ── Header ── */
        .hdr{
          position:fixed;top:0;left:50%;transform:translateX(-50%);
          width:100%;max-width:430px;
          background:rgba(246,248,250,0.92);
          backdrop-filter:blur(20px);
          -webkit-backdrop-filter:blur(20px);
          padding:0 14px;
          padding-top:max(14px,env(safe-area-inset-top,14px));
          padding-bottom:10px;
          border-bottom:1px solid var(--bd2);
          display:flex;align-items:center;justify-content:space-between;
          z-index:100;
        }
        .hdr-brand{display:flex;align-items:center;gap:9px;}
        .brand-icon{
          width:32px;height:32px;border-radius:9px;
          background:linear-gradient(135deg,#166534,#22C55E);
          display:flex;align-items:center;justify-content:center;
          font-size:16px;flex-shrink:0;
        }
        .brand-name{font-size:15px;font-weight:700;letter-spacing:-0.02em;}
        .brand-sub{font-size:10px;color:var(--muted);margin-top:1px;}
        .hdr-right{display:flex;align-items:center;gap:7px;}
        .conn-pill{
          display:flex;align-items:center;gap:5px;
          background:var(--s2);border:1px solid var(--bd);
          border-radius:20px;padding:5px 10px;
          font-size:10px;font-weight:500;color:var(--muted);
        }
        .pip{width:6px;height:6px;border-radius:50%;flex-shrink:0;}
        .pip.pulse{animation:pip 2s ease-in-out infinite;}
        @keyframes pip{0%,100%{opacity:1}50%{opacity:0.4}}
        .lang-btn{
          background:var(--s2);border:1px solid var(--bd);
          border-radius:20px;padding:5px 10px;
          font-size:10px;font-weight:600;color:var(--muted);
          cursor:pointer;-webkit-tap-highlight-color:transparent;
          transition:background 0.15s;
        }
        .lang-btn:active{background:var(--s3);}

        .gap{margin-bottom:10px;}

        /* ── Plant Hero Card ── */
        .plant-hero{
          background:var(--s1);
          border:1px solid var(--bd2);
          border-radius:20px;
          overflow:hidden;
          position:relative;
        }

        /* Active plant state */
        .plant-active-banner{
          padding:16px 18px 14px;
          background:linear-gradient(135deg, rgba(34,197,94,0.08), rgba(34,197,94,0.03));
          border-bottom:1px solid rgba(34,197,94,0.12);
          display:flex;align-items:center;gap:14px;
        }
        .plant-emoji-big{
          width:56px;height:56px;border-radius:16px;
          background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.2);
          display:flex;align-items:center;justify-content:center;
          font-size:28px;flex-shrink:0;
        }
        .plant-info-main{flex:1;min-width:0;}
        .plant-name-display{
          font-size:20px;font-weight:700;letter-spacing:-0.02em;
          color:var(--text);margin-bottom:2px;
          text-transform:capitalize;
        }
        .plant-monitoring-line{font-size:11px;color:var(--green);font-weight:500;}

        .plant-conditions{
          display:grid;grid-template-columns:1fr 1fr;
          gap:1px;background:var(--bd2);
        }
        .cond-cell{
          background:var(--s1);padding:12px 14px;
        }
        .cond-label{font-size:10px;color:var(--dim);font-weight:500;letter-spacing:0.06em;text-transform:uppercase;margin-bottom:4px;}
        .cond-value{font-family:'JetBrains Mono',monospace;font-size:15px;font-weight:600;color:var(--text);}
        .cond-sublabel{font-size:10px;color:var(--muted);margin-top:2px;}

        .plant-advice{
          padding:12px 18px;
          border-top:1px solid var(--bd2);
        }
        .advice-label{font-size:10px;color:var(--dim);font-weight:600;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:5px;}
        .advice-text{font-size:12px;line-height:1.65;color:var(--muted);font-style:italic;}

        /* Input state */
        .plant-input-area{padding:16px 18px;}
        .ai-question{font-size:17px;font-weight:700;letter-spacing:-0.02em;margin-bottom:4px;}
        .ai-sub{font-size:12px;color:var(--muted);margin-bottom:14px;line-height:1.5;}
        .ai-row{display:flex;gap:8px;margin-bottom:10px;}
        .ai-input{
          flex:1;background:var(--s2);
          border:1.5px solid var(--bd);border-radius:12px;
          padding:12px 14px;color:var(--text);
          font-family:'Inter',sans-serif;font-size:15px;
          outline:none;-webkit-appearance:none;
          transition:border-color 0.15s;
        }
        .ai-input::placeholder{color:var(--dim);}
        .ai-input:focus{border-color:var(--green);}
        .ai-btn{
          background:var(--green);color:#0D1117;
          border:none;border-radius:12px;padding:12px 20px;
          font-family:'Inter',sans-serif;font-size:14px;font-weight:700;
          cursor:pointer;white-space:nowrap;
          -webkit-tap-highlight-color:transparent;
          transition:opacity 0.15s,transform 0.1s;
        }
        .ai-btn:active{opacity:0.8;transform:scale(0.97);}
        .ai-btn:disabled{opacity:0.4;cursor:not-allowed;transform:none;}
        .ai-prog{height:2px;background:rgba(34,197,94,0.1);border-radius:2px;overflow:hidden;margin-bottom:10px;}
        .ai-prog-fill{height:100%;background:var(--green);animation:aprog 1.4s ease-in-out infinite;}
        @keyframes aprog{0%{transform:translateX(-100%)scaleX(0.4)}100%{transform:translateX(300%)scaleX(0.4)}}
        .ai-err{font-size:12px;color:var(--red);background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:10px;padding:10px 12px;margin-bottom:10px;}
        .ai-empty{font-size:12px;color:var(--dim);line-height:1.65;text-align:center;padding:4px 0;}

        .change-plant-btn{
          display:block;width:100%;
          background:transparent;border:1px solid var(--bd);
          border-radius:0 0 20px 20px;
          padding:10px;font-size:12px;color:var(--muted);
          cursor:pointer;text-align:center;
          -webkit-tap-highlight-color:transparent;
          transition:background 0.15s;
          font-family:'Inter',sans-serif;
        }
        .change-plant-btn:active{background:var(--s2);}

        /* ── Sensor readings ── */
        .sensors{
          display:grid;grid-template-columns:1fr 1fr;
          background:var(--bd2);border-radius:20px;
          overflow:hidden;border:1px solid var(--bd2);
          gap:1px;
        }
        .sensor-cell{background:var(--s1);padding:18px 16px 14px;}
        .sensor-eyebrow{font-size:10px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:var(--dim);margin-bottom:10px;}
        .sensor-num{
          font-family:'JetBrains Mono',monospace;
          font-size:48px;font-weight:600;line-height:1;
          letter-spacing:-0.04em;margin-bottom:2px;
        }
        .sensor-unit{font-size:14px;color:var(--muted);font-family:'JetBrains Mono',monospace;vertical-align:super;font-size:13px;}
        .sensor-status{display:flex;align-items:center;gap:5px;margin:8px 0 7px;font-size:11px;font-weight:600;}
        .sensor-bar{height:3px;background:var(--s3);border-radius:3px;position:relative;overflow:hidden;}
        .sensor-bar-zone{position:absolute;top:0;height:100%;background:rgba(34,197,94,0.12);border-radius:3px;}
        .sensor-bar-fill{position:absolute;top:0;left:0;height:100%;border-radius:3px;transition:width 0.7s ease,background 0.3s;}
        .sensor-range{font-size:9px;color:var(--dim);margin-top:5px;font-family:'JetBrains Mono',monospace;}

        /* ── Status row ── */
        .status-row{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
        .health-card{background:var(--s1);border:1px solid var(--bd2);border-radius:18px;padding:16px;text-align:center;}
        .ring-wrap{width:96px;height:96px;position:relative;margin:0 auto 10px;}
        .ring-wrap svg{width:100%;height:100%;overflow:visible;}
        .ring-overlay{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;}
        .ring-score{font-family:'JetBrains Mono',monospace;font-size:26px;font-weight:600;line-height:1;}
        .ring-label{font-size:9px;color:var(--dim);margin-top:2px;letter-spacing:0.06em;text-transform:uppercase;}
        .health-status{font-size:14px;font-weight:700;margin-bottom:3px;}
        .health-plant{font-size:10px;color:var(--dim);text-transform:capitalize;}

        .led-card{background:var(--s1);border:1px solid var(--bd2);border-radius:18px;padding:16px;display:flex;flex-direction:column;justify-content:space-between;}
        .led-orb-wrap{display:flex;align-items:center;gap:10px;margin-bottom:12px;}
        .led-orb{width:38px;height:38px;border-radius:50%;flex-shrink:0;transition:background 0.5s,box-shadow 0.5s;}
        .led-state{font-size:13px;font-weight:600;}
        .led-label{font-size:10px;color:var(--dim);margin-top:2px;}
        .notif-btn{
          width:100%;background:var(--s2);border:1px solid var(--bd);
          border-radius:10px;padding:9px;
          font-size:11px;font-weight:500;color:var(--muted);
          cursor:pointer;text-align:center;
          font-family:'Inter',sans-serif;
          -webkit-tap-highlight-color:transparent;
          transition:background 0.15s;
        }
        .notif-btn.on{color:var(--green);border-color:rgba(34,197,94,0.3);background:rgba(34,197,94,0.06);}
        .notif-btn:active{background:var(--s3);}
        .ios-hint{font-size:10px;color:var(--dim);text-align:center;line-height:1.5;}

        /* ── Indicators ── */
        .inds{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;}
        .ind{
          background:var(--s1);border:1px solid var(--bd2);
          border-radius:14px;padding:14px 8px 12px;
          text-align:center;transition:border-color 0.25s,background 0.25s;
          -webkit-tap-highlight-color:transparent;
        }
        .ind.on{border-color:var(--ic);background:color-mix(in srgb,var(--ic) 8%,var(--s1));}
        .ind-icon{font-size:20px;margin-bottom:7px;display:block;line-height:1;}
        .ind-name{font-size:9px;font-weight:600;letter-spacing:0.07em;text-transform:uppercase;color:var(--dim);margin-bottom:2px;}
        .ind-state{font-size:11px;font-weight:500;color:var(--dim);transition:color 0.25s;}
        .ind.on .ind-state{color:var(--ic);}

        /* ── Charts ── */
        .charts{display:flex;flex-direction:column;gap:10px;}
        .chart-card{background:var(--s1);border:1px solid var(--bd2);border-radius:18px;padding:16px;}
        .chart-hdr{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:12px;}
        .chart-name{font-size:12px;font-weight:600;color:var(--muted);}
        .chart-range{font-size:10px;color:var(--dim);font-family:'JetBrains Mono',monospace;}

        /* ── Controls ── */
        .ctrl-card{background:var(--s1);border:1px solid var(--bd2);border-radius:18px;padding:16px;}
        .ctrl-title{font-size:10px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:var(--dim);margin-bottom:12px;}
        .ctrl-list{display:flex;flex-direction:column;gap:6px;}
        .ctrl-row{
          display:flex;align-items:center;justify-content:space-between;
          padding:14px 14px;border-radius:12px;
          background:var(--s2);border:1px solid var(--bd2);
          cursor:pointer;
          -webkit-tap-highlight-color:transparent;
          user-select:none;transition:all 0.18s;
        }
        .ctrl-row:active:not(.ctrl-dim){background:var(--s3);}
        .ctrl-row.ctrl-on{border-color:var(--ac);background:color-mix(in srgb,var(--ac) 8%,var(--s2));}
        .ctrl-row.ctrl-dim{opacity:0.35;cursor:not-allowed;}
        .ctrl-left{display:flex;align-items:center;gap:10px;}
        .ctrl-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;transition:background 0.2s,box-shadow 0.2s;}
        .ctrl-name{font-size:15px;font-weight:500;color:var(--text);}
        .ctrl-row.ctrl-on .ctrl-name{color:var(--ac);}
        .ctrl-row.ctrl-dim .ctrl-name{color:var(--dim);}
        .ctrl-hint{font-size:11px;color:var(--dim);text-align:center;margin-top:10px;}

        .footer{text-align:center;font-size:10px;color:var(--dim);padding:6px 0;font-family:'JetBrains Mono',monospace;}

        @supports(padding:max(0px)){
          .app{padding-bottom:max(80px,env(safe-area-inset-bottom,20px));}
        }
        @media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition-duration:0.01ms!important;}}
      `}</style>

      <div className="app">

        {/* Fixed header */}
        <header className="hdr">
          <div className="hdr-brand">
            <div className="brand-icon">🌱</div>
            <div>
              <div className="brand-name">AI Planter</div>
              <div className="brand-sub">{t.sub}</div>
            </div>
          </div>
          <div className="hdr-right">
            <div className="conn-pill">
              <div className={`pip ${espOk?"pulse":""}`} style={{background:connColor,boxShadow:espOk?`0 0 5px ${connColor}`:""}}/>
              {connLabel}
            </div>
            <button className="lang-btn" onClick={()=>setLang(l=>l==="en"?"ms":"en")}>
              {lang==="en"?"BM":"EN"}
            </button>
          </div>
        </header>

        {/* ── Plant Hero ── */}
        <div className="plant-hero gap">
          {thresh.plant && thresh.advice && !changingPlant ? (
            <>
              {/* Active plant banner */}
              <div className="plant-active-banner">
                <div className="plant-emoji-big">{emoji}</div>
                <div className="plant-info-main">
                  <div className="plant-name-display">{thresh.plant}</div>
                  <div className="plant-monitoring-line">🟢 Now monitoring · AI thresholds active</div>
                </div>
              </div>

              {/* Ideal conditions grid */}
              <div className="plant-conditions">
                <div className="cond-cell">
                  <div className="cond-label">{t.idealTemp}</div>
                  <div className="cond-value">{thresh.temp_low}–{thresh.temp_high}°C</div>
                  <div className="cond-sublabel" style={{color: tempOk ? "#22C55E" : "#F59E0B"}}>
                    {tempOk ? "✓ Current reading in range" : `Current: ${latest.temperature.toFixed(1)}°C`}
                  </div>
                </div>
                <div className="cond-cell">
                  <div className="cond-label">{t.idealHumid}</div>
                  <div className="cond-value">{thresh.humid_low}–{thresh.humid_high}%</div>
                  <div className="cond-sublabel" style={{color: humOk ? "#22C55E" : "#F59E0B"}}>
                    {humOk ? "✓ Current reading in range" : `Current: ${latest.humidity.toFixed(1)}%`}
                  </div>
                </div>
              </div>

              {/* AI advice */}
              <div className="plant-advice">
                <div className="advice-label">{t.aiAdvice}</div>
                <div className="advice-text">{thresh.advice}</div>
              </div>

              {/* Change plant button */}
              <button className="change-plant-btn" onClick={()=>{setChangingPlant(true);setPlant("");}}>
                ↩ Change plant
              </button>
            </>
          ) : (
            /* Input state */
            <div className="plant-input-area">
              <div className="ai-question">{t.aiTitle}</div>
              <div className="ai-sub">Groq AI · LLaMA-3.3-70B sets the perfect conditions for your plant automatically.</div>
              <div className="ai-row">
                <input className="ai-input" value={plant}
                  onChange={e=>setPlant(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&askAI()}
                  placeholder={t.aiPlaceholder}
                  autoCorrect="off" autoCapitalize="words"/>
                <button className="ai-btn" onClick={askAI} disabled={aiLoading}>
                  {aiLoading?t.aiLoading:t.aiBtn}
                </button>
              </div>
              {aiLoading&&<div className="ai-prog"><div className="ai-prog-fill"/></div>}
              {aiError&&<div className="ai-err">⚠ {aiError}</div>}
              {!aiLoading&&!aiError&&<p className="ai-empty">{t.aiEmpty}</p>}
            </div>
          )}
        </div>

        {/* ── Sensor readings ── */}
        <div className="sensors gap">
          {[
            {key:"temperature",val:latest.temperature,unit:"°C",color:"#F87171",status:tempOk?t.optimal:latest.temperature<thresh.temp_low?t.low:t.high,sc:tempColor,bar:tempBar},
            {key:"humidity",   val:latest.humidity,   unit:"%", color:"#60A5FA",status:humOk?t.optimal:latest.humidity<thresh.humid_low?t.low:t.high,sc:humColor,bar:humBar},
          ].map(({key,val,unit,color,status,sc,bar})=>(
            <div className="sensor-cell" key={key}>
              <div className="sensor-eyebrow">{t[key]}</div>
              <div>
                <span className="sensor-num" style={{color}}>{val.toFixed(1)}</span>
                <span className="sensor-unit">{unit}</span>
              </div>
              <div className="sensor-status">
                <div className="pip" style={{background:sc}}/>
                <span style={{color:sc}}>{status}</span>
              </div>
              <div className="sensor-bar">
                <div className="sensor-bar-zone" style={{left:`${bar.zl}%`,width:`${bar.zw}%`}}/>
                <div className="sensor-bar-fill" style={{width:`${bar.pct}%`,background:sc}}/>
              </div>
              <div className="sensor-range">{key==="temperature"?`${thresh.temp_low}–${thresh.temp_high}°C`:`${thresh.humid_low}–${thresh.humid_high}%`}</div>
            </div>
          ))}
        </div>

        {/* ── Health + LED ── */}
        <div className="status-row gap">
          <div className="health-card">
            <div className="ring-wrap">
              <svg viewBox="0 0 100 100">
                <circle cx="50" cy="50" r={R} fill="none"
                  stroke={`${hm.color}25`} strokeWidth="8"
                  strokeDasharray={`${C2*0.75} ${C2}`}
                  strokeDashoffset={C2*0.125} strokeLinecap="round"/>
                <circle cx="50" cy="50" r={R} fill="none"
                  stroke={hm.color} strokeWidth="8"
                  strokeDasharray={`${arc} ${C2}`}
                  strokeDashoffset={C2*0.125} strokeLinecap="round"
                  style={{
                    filter:`drop-shadow(0 0 6px ${hm.color}80)`,
                    transition:"stroke-dasharray 0.8s ease,stroke 0.4s",
                  }}/>
              </svg>
              <div className="ring-overlay">
                <div className="ring-score" style={{color:hm.color}}>{score}</div>
                <div className="ring-label">/ 100</div>
              </div>
            </div>
            <div className="health-status" style={{color:hm.color}}>{hm.label}</div>
            <div className="health-plant">{thresh.plant || "No plant set"}</div>
          </div>

          <div className="led-card">
            <div>
              <div style={{fontSize:10,fontWeight:600,letterSpacing:"0.08em",textTransform:"uppercase",color:"var(--dim)",marginBottom:10}}>Device LED</div>
              <div className="led-orb-wrap">
                <div className="led-orb" style={{
                  background:led.color,
                  boxShadow:led.color!=="374151"?`0 0 18px ${led.color}80,0 0 6px ${led.color}`:undefined,
                }}/>
                <div>
                  <div className="led-state" style={{color:led.color}}>{led.label}</div>
                  <div className="led-label">RGB Status</div>
                </div>
              </div>
            </div>
            {notifSup?(
              <button className={`notif-btn ${notifOk?"on":""}`}
                onClick={async()=>{const ok=await requestNotif();setNotifOk(ok);}}>
                {notifOk?`🔔 ${t.alertOn}`:`🔕 ${t.alertOff}`}
              </button>
            ):<div className="ios-hint">{t.alertIOS}</div>}
          </div>
        </div>

        {/* ── Indicators ── */}
        <div className="inds gap">
          {[
            {on:fanOn,    color:"#60A5FA",icon:"💨",name:t.fan, stOn:t.running,stOff:t.idle},
            {on:mistOn,   color:"#22D3EE",icon:"🌫️",name:t.mist,stOn:t.misting,stOff:t.idle},
            {on:autoMode, color:"#F59E0B",icon:"⚡",name:t.auto,stOn:t.auto,   stOff:t.manual},
          ].map(({on,color,icon,name,stOn,stOff})=>(
            <div key={name} className={`ind ${on?"on":""}`} style={{"--ic":color}}>
              <span className="ind-icon">{icon}</span>
              <div className="ind-name">{name}</div>
              <div className="ind-state">{on?stOn:stOff}</div>
            </div>
          ))}
        </div>

        {/* ── Charts ── */}
        <div className="charts gap">
          {[
            {dKey:"temperature",color:"#F87171",name:t.temp,unit:"°C",lo:thresh.temp_low,hi:thresh.temp_high},
            {dKey:"humidity",   color:"#60A5FA",name:t.humid,unit:"%",lo:thresh.humid_low,hi:thresh.humid_high},
          ].map(({dKey,color,name,unit,lo,hi})=>(
            <div className="chart-card" key={dKey}>
              <div className="chart-hdr">
                <span className="chart-name">{name}</span>
                <span className="chart-range">{lo}–{hi} {unit}</span>
              </div>
              <ResponsiveContainer width="100%" height={100}>
                <LineChart data={history.slice(-24)} margin={{top:2,right:2,left:-30,bottom:0}}>
                  <XAxis dataKey="ts" tick={{fill:"#8C959F",fontSize:8}} interval="preserveStartEnd" axisLine={false} tickLine={false}/>
                  <YAxis tick={{fill:"#8C959F",fontSize:8}} axisLine={false} tickLine={false}/>
                  <Tooltip contentStyle={{background:"#FFFFFF",border:"1px solid #D0D7DE",borderRadius:8,fontSize:11}}
                    labelStyle={{color:"#57606A"}} itemStyle={{color}}
                    cursor={{stroke:"#21262D",strokeWidth:1}}/>
                  <ReferenceLine y={hi} stroke={color} strokeDasharray="3 3" strokeOpacity={0.3} strokeWidth={1}/>
                  <ReferenceLine y={lo} stroke={color} strokeDasharray="3 3" strokeOpacity={0.3} strokeWidth={1}/>
                  <Line type="monotone" dataKey={dKey} stroke={color} strokeWidth={2}
                    dot={false} activeDot={{r:4,fill:color,strokeWidth:0}}/>
                </LineChart>
              </ResponsiveContainer>
            </div>
          ))}
        </div>

        {/* ── Controls ── */}
        <div className="ctrl-card gap">
          <div className="ctrl-title">{t.controls}</div>
          <div className="ctrl-list">
            {[
              {on:autoMode,toggle:toggleAuto,name:t.autoMode,color:"#F59E0B",disabled:false},
              {on:fanOn,   toggle:toggleFan, name:t.fanCtrl, color:"#60A5FA",disabled:autoMode},
              {on:mistOn,  toggle:toggleMist,name:t.mistCtrl,color:"#22D3EE",disabled:autoMode},
            ].map(({on,toggle,name,color,disabled})=>(
              <div key={name}
                className={`ctrl-row ${on&&!disabled?"ctrl-on":""} ${disabled?"ctrl-dim":""}`}
                style={{"--ac":color}} onClick={disabled?undefined:toggle}>
                <div className="ctrl-left">
                  <div className="ctrl-dot" style={{
                    background:on&&!disabled?color:"var(--bd)",
                    boxShadow:on&&!disabled?`0 0 8px ${color}`:undefined,
                  }}/>
                  <span className="ctrl-name">{name}</span>
                </div>
                <Toggle on={on&&!disabled} color={color} disabled={disabled}/>
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
