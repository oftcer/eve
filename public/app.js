(() => {
  const $ = (id) => document.getElementById(id);
  const animImg = $("animImg");
  const bubble = $("bubble");
  const transcript = $("transcript");
  const form = $("composer");
  const input = $("input");
  const mute = $("mute");
  const mic = $("mic");
  const micHint = $("micHint");
  const cfg = $("cfg");
  const cfgBtn = $("cfgBtn");
  const cfgClose = $("cfgClose");
  const cfgCancel = $("cfgCancel");
  const cfgSave = $("cfgSave");
  const cursorState = $("cursorState");
  const userEmail = $("userEmail");
  const ghState = $("ghState");
  const claudeState = $("claudeState");
  const gptState = $("gptState");
  const igState = $("igState");
  const ttState = $("ttState");
  const connHint = $("connHint");
  const audioIn = $("audioIn");
  const audioOut = $("audioOut");
  const noiseOn = $("noiseOn");
  const echoOn = $("echoOn");
  const agcOn = $("agcOn");
  const micGain = $("micGain");
  const micGainVal = $("micGainVal");
  const micLevel = $("micLevel");
  const audioTest = $("audioTest");

  const MOOD = {
    boot: "/eve/wave.svg",
    idle: "/eve/idle.svg",
    think: "/eve/think.svg",
    work: "/eve/work.svg",
    talk: "/eve/talk.svg",
    happy: "/eve/happy.svg",
    wave: "/eve/wave.svg",
    error: "/eve/error.svg",
  };

  const AUDIO_KEY = "eve-audio-v1";
  let lastMood = "";
  let muted = sessionStorage.getItem("eve-mute") === "1";
  let listening = false;
  let liveTalk = false; // mic ligado → respostas por voz
  let waitingReply = false;
  let resumeTalkTimer = 0;
  let voiceMic = null;
  let meterCtx = null;
  let meterStream = null;
  let meterRaf = 0;
  let recCtx = null;
  let recStream = null;
  let recChunks = [];
  let recSilence = null;
  let recProcessor = null;
  let listenFinishing = false;
  let audioCfg = loadAudio();
  if (audioCfg.volumePct == null) {
    audioCfg.volumePct = 100;
    audioCfg.gain = 4;
    saveAudioLocal(audioCfg);
  }

  function defaultAudio() {
    return {
      inputId: "",
      outputId: "",
      noiseSuppression: true,
      echoCancellation: true,
      autoGainControl: true,
      // 100% = volume máximo da voz no mic
      volumePct: 100,
      gain: 4,
    };
  }

  function loadAudio() {
    try {
      const raw = { ...defaultAudio(), ...JSON.parse(localStorage.getItem(AUDIO_KEY) || "{}") };
      // migra gain antigo (0.5–4) → volumePct; força 100% se não definido
      if (raw.volumePct == null) {
        const g = Number(raw.gain) || 4;
        raw.volumePct = Math.min(100, Math.max(50, Math.round((g / 4) * 100)));
      }
      raw.volumePct = Math.min(100, Math.max(50, Number(raw.volumePct) || 100));
      raw.gain = (raw.volumePct / 100) * 4;
      return raw;
    } catch {
      return defaultAudio();
    }
  }

  function micBoost() {
    // 100% → ganho forte o bastante pra voz baixa
    const pct = Math.min(100, Math.max(50, Number(audioCfg.volumePct) || 100));
    return 2.5 + (pct / 100) * 6.5; // 50%≈5.75 … 100%≈9.0
  }

  function saveAudioLocal(v) {
    localStorage.setItem(AUDIO_KEY, JSON.stringify(v));
  }

  function esc(v) {
    return String(v)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  const PATH_RE =
    /(?:[A-Za-z]:\\(?:[^\s`"'<>|]+)?|\\\\[^\s`"'<>|]+|~\/[^\s`"'<>|]+|(?:\.\.?\/)[^\s`"'<>|]+)/g;
  const CODE_FENCE_RE = /```([\w-]*)\n?([\s\S]*?)```/g;
  const INLINE_CODE_RE = /`([^`\n]+)`/g;
  const BOLD_RE = /\*\*([^*]+)\*\*/g;

  function copyBtn(value) {
    return `<button type="button" class="copy-btn" data-copy="${esc(value)}" title="Copiar" aria-label="Copiar"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M16 1H4a2 2 0 0 0-2 2v12h2V3h12V1Zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Zm0 16H8V7h11v14Z"/></svg></button>`;
  }

  function pathChip(p) {
    return `<span class="path-chip"><span class="path-ico" aria-hidden="true">📁</span><code>${esc(p)}</code>${copyBtn(p)}</span>`;
  }

  function codeChip(c) {
    return `<span class="code-chip"><span class="code-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M8.7 16.3 4.4 12l4.3-4.3-1.4-1.4L1.6 12l5.7 5.7 1.4-1.4Zm6.6 0 1.4 1.4L22.4 12l-5.7-5.7-1.4 1.4 4.3 4.3-4.3 4.3Z"/></svg></span><code>${esc(c)}</code>${copyBtn(c)}</span>`;
  }

  function langMeta(lang) {
    const raw = String(lang || "code").toLowerCase().trim();
    const aliases = {
      js: "javascript",
      mjs: "javascript",
      cjs: "javascript",
      ts: "typescript",
      py: "python",
      sh: "shell",
      bash: "shell",
      ps1: "powershell",
      yml: "yaml",
      md: "markdown",
      htm: "html",
    };
    const key = aliases[raw] || raw || "code";
    const labels = {
      javascript: "JS",
      typescript: "TS",
      jsx: "JSX",
      tsx: "TSX",
      python: "PY",
      css: "CSS",
      scss: "SCSS",
      html: "HTML",
      json: "JSON",
      markdown: "MD",
      shell: "SH",
      powershell: "PS1",
      sql: "SQL",
      yaml: "YML",
      rust: "RS",
      go: "GO",
      java: "JAVA",
      php: "PHP",
      ruby: "RB",
      vue: "VUE",
      svg: "SVG",
      text: "TXT",
      file: "FILE",
      code: "CODE",
    };
    return { key, label: labels[key] || key.slice(0, 6).toUpperCase() };
  }

  function codeSpoiler({ lang, body, title, action }) {
    const meta = langMeta(lang);
    const head = title || meta.label;
    const act = action ? `<span class="file-action">${esc(action)}</span>` : "";
    return `<details class="code-spoiler lang-${esc(meta.key)}"><summary class="code-spoiler-sum"><span class="lang-badge" data-lang="${esc(meta.key)}" aria-hidden="true">${esc(meta.label)}</span>${act}<span class="code-spoiler-title">${esc(head)}</span><span class="spoiler-hint">spoiler</span>${copyBtn(body || "")}</summary><pre class="code-spoiler-body"><code>${esc(body || "")}</code></pre></details>`;
  }

  function formatRich(raw) {
    let text = String(raw || "")
      .replace(/\r\n/g, "\n")
      .replace(/<\/?(?:strong|b|em|i|span|div|p)\b[^>]*>/gi, "")
      .replace(/&lt;\/?(?:strong|b)&gt;/gi, "")
      .replace(/\*{3,}/g, "**");

    const slots = [];
    const park = (html) => {
      const i = slots.length;
      slots.push(html);
      return `§§${i}§§`;
    };

    // 1) blocos de código → spoiler com ícone da linguagem
    text = text.replace(CODE_FENCE_RE, (_, lang, code) => {
      const body = String(code || "").replace(/\n$/, "");
      const meta = langMeta(lang);
      return park(codeSpoiler({ lang: meta.key, body, title: meta.label }));
    });

    // 2) inline code / paths em `...`
    text = text.replace(INLINE_CODE_RE, (_, code) => {
      const c = String(code || "");
      const isPath = /^[A-Za-z]:\\/.test(c) || /^\\\\/.test(c) || /^~\//.test(c) || /^[.]{1,2}\//.test(c);
      return park(isPath ? pathChip(c) : codeChip(c));
    });

    // 3) paths soltos (só Windows/UNC/~) — NUNCA /something de HTML
    text = text.replace(PATH_RE, (p) => {
      if (!p || p.length < 4) return p;
      return park(pathChip(p));
    });

    // 4) negrito markdown → strong (depois de estacionar tokens)
    text = text.replace(BOLD_RE, (_, inner) => park(`<strong>${esc(inner)}</strong>`));
    text = text.replace(/\*\*/g, "");

    // 5) aspas → citação
    text = text.replace(/[“”]([^“”]+)[“”]/g, (_, q) => park(`<span class="cite">“${esc(q)}”</span>`));
    text = text.replace(/"([^"\n]{2,120})"/g, (_, q) => park(`<span class="cite">“${esc(q)}”</span>`));

    // 6) escapa o resto e devolve slots
    let html = esc(text);
    html = html.replace(/§§(\d+)§§/g, (_m, i) => slots[Number(i)] || "");
    html = html.replace(/\n/g, "<br>");
    html = html.replace(/(^|<br>)(?:[-•]\s+)(.+?)(?=<br>|$)/g, '$1<span class="bullet">$2</span>');
    return html;
  }

  function setHint(text, kind) {
    if (!text) {
      micHint.hidden = true;
      micHint.textContent = "";
      micHint.dataset.kind = "";
      return;
    }
    const next = String(text);
    const nextKind = kind || "ok";
    // evita flicker: não reescreve a mesma dica
    if (!micHint.hidden && micHint.textContent === next && micHint.dataset.kind === nextKind) return;
    micHint.hidden = false;
    micHint.textContent = next;
    micHint.dataset.kind = nextKind;
  }

  function setMood(mood) {
    const key = MOOD[mood] ? mood : "idle";
    if (key === lastMood) return;
    lastMood = key;
    animImg.src = `${MOOD[key]}?t=${Date.now()}`;
  }

  function setListeningUi(on) {
    listening = on;
    mic.setAttribute("aria-pressed", on ? "true" : "false");
    mic.title = on ? "Parar e enviar" : "Falar com a EVE";
    if (!on) mic.classList.remove("hearing");
  }

  function setHearing(on) {
    mic.classList.toggle("hearing", Boolean(on));
  }

  let lastSayKey = "";
  let lastTranscriptKey = "";
  let lastBusy = null;

  function setShimmer(on) {
    // só na bolha da EVE — nunca no histórico (isso fazia a msg piscar)
    bubble.classList.toggle("shimmer", Boolean(on));
    transcript.classList.remove("processing");
  }

  function transcriptKey(list) {
    if (!list || !list.length) return "0";
    const last = list[list.length - 1];
    return `${list.length}|${last.role}|${last.kind || ""}|${last.path || ""}|${last.via || ""}|${String(last.text || "").length}|${String(last.preview || "").length}`;
  }

  function renderTranscript(list) {
    transcript.innerHTML = (list || [])
      .map((item) => {
        if (item.kind === "file") {
          const fileName = String(item.path || "arquivo").split(/[/\\]/).pop() || item.path;
          const body = item.preview || "// (sem preview)";
          return `<div class="msg eve file-msg"><span class="who">EVE · arquivo</span><div class="msg-body">${codeSpoiler({
            lang: item.lang || "file",
            body,
            title: fileName,
            action: item.action || "arquivo",
          })}<div class="file-path">${pathChip(item.path || fileName)}</div></div></div>`;
        }
        const role = item.role === "voce" ? "voce" : "eve";
        if (item.via === "voice" && role === "voce") {
          return `<div class="msg voce"><span class="who">Você · voz</span><div class="msg-body">${formatRich(item.text)}</div></div>`;
        }
        const who = role === "voce" ? "Você" : "EVE";
        return `<div class="msg ${role}"><span class="who">${who}</span><div class="msg-body">${formatRich(item.text)}</div></div>`;
      })
      .join("");
    transcript.scrollTop = transcript.scrollHeight;
  }

  function render(state) {
    setMood(state.mood || "idle");
    const busy = /pensando|trabalhando|conectando|acordando|falando/i.test(state.status || "");
    if (busy !== lastBusy) {
      lastBusy = busy;
      setShimmer(busy);
    }

    const say = String(state.say || "");
    if (say !== lastSayKey) {
      lastSayKey = say;
      bubble.innerHTML = formatRich(say);
    }

    const tKey = transcriptKey(state.transcript);
    if (tKey !== lastTranscriptKey) {
      lastTranscriptKey = tKey;
      renderTranscript(state.transcript);
    }

    if (userEmail && state.email) {
      userEmail.dataset.email = state.email;
    }

    // conversa contínua: quando ela termina, reabre o mic
    const eveTalking = Boolean(state.speaking) || busy;
    if (liveTalk && waitingReply && !eveTalking && !busy && !listening && !voiceMic?.active) {
      waitingReply = false;
      if (resumeTalkTimer) clearTimeout(resumeTalkTimer);
      resumeTalkTimer = setTimeout(() => {
        if (liveTalk && !listening && !voiceMic?.active) voiceMic?.start();
      }, 600);
    }
  }

  function micNotifyActive(on) {
    fetch("/api/mic", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: Boolean(on) }),
    }).catch(() => {});
  }

  transcript.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-copy]");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const val = btn.getAttribute("data-copy") || "";
    navigator.clipboard?.writeText(val).then(() => {
      btn.classList.add("copied");
      setTimeout(() => btn.classList.remove("copied"), 900);
    }).catch(() => {});
  });
  bubble.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-copy]");
    if (!btn) return;
    const val = btn.getAttribute("data-copy") || "";
    navigator.clipboard?.writeText(val).catch(() => {});
  });

  if (mute) {
    mute.onclick = () => {
      muted = !muted;
      sessionStorage.setItem("eve-mute", muted ? "1" : "0");
      mute.setAttribute("aria-pressed", muted ? "true" : "false");
      fetch("/api/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: muted ? "voz off" : "voz on" }),
      }).catch(() => {});
    };
    mute.setAttribute("aria-pressed", muted ? "true" : "false");
  }

  async function sendText(text, via = "text") {
    const clean = String(text || "").trim();
    if (!clean) return;
    setHint("");
    input.value = "";
    await fetch("/api/say", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: clean, via: via === "voice" ? "voice" : "text" }),
    });
  }

  function audioConstraints(forSpeech = false) {
    const audio = {
      // fala: SEM echo cancel — no Electron isso mata a voz e o mic “não detecta”
      echoCancellation: forSpeech ? false : Boolean(audioCfg.echoCancellation),
      noiseSuppression: forSpeech ? false : Boolean(audioCfg.noiseSuppression),
      autoGainControl: forSpeech ? true : Boolean(audioCfg.autoGainControl),
      channelCount: 1,
    };
    if (audioCfg.inputId) audio.deviceId = { ideal: audioCfg.inputId };
    return { audio, video: false };
  }

  async function unlockMic() {
    if (!navigator.mediaDevices?.getUserMedia) return false;
    let stream = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia(audioConstraints());
      for (const t of stream.getTracks()) t.stop();
      return true;
    } catch {
      if (stream) for (const t of stream.getTracks()) t.stop();
      return false;
    }
  }

  /** Mic novo (voice-mic.js): push-to-talk → texto → resposta por voz. */
  function setupMic() {
    if (typeof createVoiceMic !== "function") {
      setHint("voice-mic.js não carregou. Reinicie a EVE.", "err");
      return;
    }
    voiceMic = createVoiceMic({
      deviceId: () => audioCfg.inputId || "",
      setHint,
      setListening: (on) => {
        setListeningUi(on);
        if (on) {
          liveTalk = true;
          mic.classList.add("live");
          setMood("think");
          bubble.textContent = "Ouvindo… fale agora";
        } else {
          mic.classList.remove("hearing");
        }
      },
      setHearing,
      setLevel: (pct) => {
        if (micLevel) micLevel.style.width = `${pct}%`;
      },
      onMicActive: micNotifyActive,
      onPartial: (text) => {
        input.value = text;
        bubble.innerHTML = formatRich(text);
      },
      onTranscript: async (text) => {
        const clean = String(text || "").trim();
        if (!clean) return;
        input.value = clean;
        bubble.innerHTML = formatRich(clean);
        setHint("Enviado…", "ok");
        waitingReply = true;
        liveTalk = true;
        await sendText(clean, "voice");
      },
      onIdle: () => {
        liveTalk = false;
        waitingReply = false;
        mic.classList.remove("live");
      },
    });

    mic.onclick = async () => {
      await voiceMic.toggle();
    };

    mic.addEventListener("dblclick", (e) => {
      e.preventDefault();
      liveTalk = false;
      waitingReply = false;
      if (resumeTalkTimer) clearTimeout(resumeTalkTimer);
      voiceMic.forceStop("Mic desligado. Digite pra falar por texto (sem voz).");
      mic.classList.remove("live");
    });
  }

  async function fillDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    // labels só aparecem após permissão
    await unlockMic();
    const devices = await navigator.mediaDevices.enumerateDevices();
    const fill = (select, list, selected, empty) => {
      select.innerHTML = "";
      const o0 = document.createElement("option");
      o0.value = "";
      o0.textContent = empty;
      select.appendChild(o0);
      for (const d of list) {
        const o = document.createElement("option");
        o.value = d.deviceId;
        o.textContent = d.label || `${d.kind} ${d.deviceId.slice(0, 6)}`;
        select.appendChild(o);
      }
      select.value = selected && [...select.options].some((x) => x.value === selected) ? selected : "";
    };
    fill(
      audioIn,
      devices.filter((d) => d.kind === "audioinput"),
      audioCfg.inputId,
      "Padrão do sistema",
    );
    fill(
      audioOut,
      devices.filter((d) => d.kind === "audiooutput"),
      audioCfg.outputId,
      "Padrão do sistema",
    );
  }

  function applyAudioForm() {
    noiseOn.checked = audioCfg.noiseSuppression !== false;
    echoOn.checked = audioCfg.echoCancellation !== false;
    agcOn.checked = audioCfg.autoGainControl !== false;
    const pct = Math.min(100, Math.max(50, Number(audioCfg.volumePct) || 100));
    micGain.value = String(pct);
    micGainVal.textContent = `${pct}%`;
  }

  function readAudioForm() {
    const pct = Math.min(100, Math.max(50, Number(micGain.value) || 100));
    return {
      inputId: audioIn.value || "",
      outputId: audioOut.value || "",
      noiseSuppression: noiseOn.checked,
      echoCancellation: echoOn.checked,
      autoGainControl: agcOn.checked,
      volumePct: pct,
      gain: (pct / 100) * 4,
    };
  }

  function stopMeter() {
    if (meterRaf) cancelAnimationFrame(meterRaf);
    meterRaf = 0;
    if (meterStream) {
      for (const t of meterStream.getTracks()) t.stop();
      meterStream = null;
    }
    try {
      meterCtx?.close();
    } catch {
      /* ok */
    }
    meterCtx = null;
    if (micLevel) micLevel.style.width = "0%";
  }

  async function startMeter() {
    stopMeter();
    audioCfg = readAudioForm();
    try {
      meterStream = await navigator.mediaDevices.getUserMedia(audioConstraints());
      const Ctx = window.AudioContext || window.webkitAudioContext;
      meterCtx = new Ctx();
      const src = meterCtx.createMediaStreamSource(meterStream);
      const gain = meterCtx.createGain();
      gain.gain.value = micBoost();
      const analyser = meterCtx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(gain);
      gain.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const v of data) {
          const n = (v - 128) / 128;
          sum += n * n;
        }
        const rms = Math.sqrt(sum / data.length);
        const pct = Math.min(100, Math.round(rms * 280));
        micLevel.style.width = `${pct}%`;
        meterRaf = requestAnimationFrame(tick);
      };
      tick();
      setHint(pctHint(), "ok");
    } catch {
      setHint("Não testei o mic.", "err");
    }
  }

  function pctHint() {
    return "Fale — a barra deve mexer. Depois salve e use o mic no chat.";
  }

  function setupTabs() {
    document.querySelectorAll(".tab").forEach((tab) => {
      tab.onclick = () => {
        document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === tab));
        document.querySelectorAll(".pane").forEach((pane) => {
          const on = pane.id === `tab-${tab.dataset.tab}`;
          pane.classList.toggle("active", on);
          pane.hidden = !on;
        });
        if (tab.dataset.tab === "audio") fillDevices().catch(() => {});
        else stopMeter();
      };
    });
  }

  function connectEvents() {
    const source = new EventSource("/events");
    source.onmessage = (event) => {
      try {
        render(JSON.parse(event.data));
      } catch {
        /* ignore */
      }
    };
    source.onerror = () => {
      source.close();
      setTimeout(connectEvents, 1200);
    };
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    await sendText(text);
    input.focus();
  });

  function openCfg() {
    cfg.hidden = false;
  }
  function closeCfg() {
    stopMeter();
    cfg.hidden = true;
  }

  function setPill(el, on, onLabel = "conectado", offLabel = "offline") {
    if (!el) return;
    el.textContent = on ? onLabel : offLabel;
    el.className = on ? "pill on" : "pill off";
  }

  async function loadConnections() {
    const res = await fetch("/api/connections");
    const data = await res.json();
    lastConn = data;
    setPill(cursorState, data.cursor?.linked || data.cursor?.hasKey);
    const mail = data.cursor?.email || userEmail?.dataset.email || "";
    if (mail) {
      userEmail.hidden = false;
      userEmail.textContent = mail;
    } else {
      userEmail.hidden = true;
    }
    setPill(ghState, data.github?.enabled, data.github?.user ? `@${data.github.user}` : "conectado");
    setPill(claudeState, data.claude?.enabled && data.claude?.hasKey, "ligado", "off");
    setPill(gptState, data.chatgpt?.enabled && data.chatgpt?.hasKey, "ligado", "off");
    setPill(igState, data.instagram?.enabled, "ligado", "off");
    setPill(ttState, data.tiktok?.enabled, "ligado", "off");
  }

  function showConnHint(text, kind = "ok") {
    if (!connHint) return;
    if (!text) {
      connHint.hidden = true;
      return;
    }
    connHint.hidden = false;
    connHint.textContent = text;
    connHint.dataset.kind = kind;
  }

  cfgBtn.onclick = async () => {
    applyAudioForm();
    await loadConnections();
    await fillDevices().catch(() => {});
    openCfg();
  };
  cfgClose.onclick = closeCfg;
  cfgCancel.onclick = closeCfg;
  cfg.addEventListener("click", (e) => {
    if (e.target === cfg) closeCfg();
  });

  let apiProvider = "";
  let detailsProvider = "";
  let lastConn = {};
  const apiModal = $("apiModal");
  const detailsModal = $("detailsModal");
  const apiKeyInput = $("apiKeyInput");
  const apiBaseUrl = $("apiBaseUrl");
  const apiAuthHeader = $("apiAuthHeader");
  const apiModel = $("apiModel");
  const apiKeyLabel = $("apiKeyLabel");
  const apiScript = $("apiScript");
  const apiMeta = $("apiMeta");
  const apiDemo = $("apiDemo");
  const apiTitle = $("apiTitle");
  const apiStatus = $("apiStatus");
  const apiProviderLabel = $("apiProviderLabel");
  const detailsList = $("detailsList");
  const detailsTitle = $("detailsTitle");

  const API_SPECS = {
    claude: {
      title: "Anthropic Claude",
      demo: "SDK oficial @anthropic-ai/sdk · header x-api-key + anthropic-version.",
      lib: "@anthropic-ai/sdk",
      docs: "https://docs.anthropic.com/en/api/getting-started",
      keyLabel: "ANTHROPIC_API_KEY",
      keyPh: "sk-ant-api03-…",
      auth: "x-api-key: $ANTHROPIC_API_KEY",
      base: "https://api.anthropic.com",
      model: "claude-sonnet-4-20250514",
      probe: "/v1/models",
      extras: ["anthropic-version: 2023-06-01", "Content-Type: application/json"],
      script: (base, model) =>
        `import Anthropic from "@anthropic-ai/sdk";\n\nconst client = new Anthropic({\n  apiKey: process.env.ANTHROPIC_API_KEY, // ou cole abaixo\n  baseURL: "${base}",\n});\n\n// teste real\nconst models = await client.models.list();\n\nconst msg = await client.messages.create({\n  model: "${model}",\n  max_tokens: 64,\n  messages: [{ role: "user", content: "ping" }],\n});`,
    },
    chatgpt: {
      title: "OpenAI ChatGPT",
      demo: "SDK oficial openai · Authorization: Bearer.",
      lib: "openai",
      docs: "https://platform.openai.com/docs/api-reference",
      keyLabel: "OPENAI_API_KEY",
      keyPh: "sk-…",
      auth: "Authorization: Bearer $OPENAI_API_KEY",
      base: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
      probe: "/models",
      extras: ["Content-Type: application/json"],
      script: (base, model) =>
        `import OpenAI from "openai";\n\nconst client = new OpenAI({\n  apiKey: process.env.OPENAI_API_KEY,\n  baseURL: "${base}",\n});\n\n// teste real\nconst models = await client.models.list();\n\nconst chat = await client.chat.completions.create({\n  model: "${model}",\n  messages: [{ role: "user", content: "ping" }],\n});`,
    },
    github: {
      title: "GitHub",
      demo: "REST api.github.com · token classic (ghp_) ou fine-grained.",
      lib: "@octokit/rest / gh",
      docs: "https://docs.github.com/en/rest",
      keyLabel: "GITHUB_TOKEN",
      keyPh: "ghp_… ou github_pat_…",
      auth: "Authorization: Bearer $GITHUB_TOKEN",
      base: "https://api.github.com",
      model: "",
      probe: "/user",
      extras: ["Accept: application/vnd.github+json", "User-Agent: eve-agent"],
      hideModel: true,
      script: () =>
        `# PowerShell / curl\ncurl -s -H "Authorization: Bearer $GITHUB_TOKEN" \\\n  -H "Accept: application/vnd.github+json" \\\n  -H "User-Agent: eve-agent" \\\n  https://api.github.com/user\n\n# Node\nconst r = await fetch("https://api.github.com/user", {\n  headers: {\n    Authorization: \`Bearer \${token}\`,\n    Accept: "application/vnd.github+json",\n    "User-Agent": "eve-agent",\n  },\n});`,
    },
    cursor: {
      title: "Cursor Agent",
      demo: "Cursor SDK · variável CURSOR_API_KEY (settings do Cursor).",
      lib: "@cursor/sdk",
      docs: "https://cursor.com/docs",
      keyLabel: "CURSOR_API_KEY",
      keyPh: "cole a key do Cursor",
      auth: "CURSOR_API_KEY (env / SDK)",
      base: "https://api2.cursor.sh",
      model: "",
      probe: "authStatus()",
      extras: ["Usada pelo Agent.send no PC"],
      hideModel: true,
      script: () =>
        `import { Agent } from "@cursor/sdk";\n\nprocess.env.CURSOR_API_KEY = "sua-key";\n\nconst agent = await Agent.create({\n  apiKey: process.env.CURSOR_API_KEY,\n  name: "EVE",\n});\n\nconst run = await agent.send("ping");\nfor await (const ev of run.stream()) {\n  console.log(ev);\n}`,
    },
  };

  function fillApiForm(provider, saved = {}) {
    const spec = API_SPECS[provider];
    if (!spec) return;
    apiProviderLabel.textContent = `API · ${provider}`;
    apiTitle.textContent = spec.title;
    apiDemo.textContent = spec.demo;
    apiBaseUrl.value = saved.baseUrl || spec.base;
    apiAuthHeader.value = spec.auth;
    apiModel.value = saved.model || spec.model;
    apiModel.closest("label").hidden = Boolean(spec.hideModel);
    apiKeyLabel.textContent = spec.keyLabel;
    apiKeyInput.placeholder = spec.keyPh;
    apiKeyInput.value = "";
    apiScript.value = spec.script(apiBaseUrl.value, apiModel.value || spec.model);
    apiMeta.innerHTML = [
      `<span class="skill-chip">${esc(spec.lib)}</span>`,
      `<a class="skill-chip" href="${esc(spec.docs)}" target="_blank" rel="noopener">docs</a>`,
      `<span class="skill-chip">probe ${esc(spec.probe)}</span>`,
      ...(spec.extras || []).map((x) => `<span class="skill-chip">${esc(x)}</span>`),
    ].join("");
    if (apiStatus) {
      apiStatus.hidden = true;
      apiStatus.textContent = "";
    }
  }

  function refreshApiScript() {
    const spec = API_SPECS[apiProvider];
    if (!spec || !apiScript) return;
    apiScript.value = spec.script(apiBaseUrl.value.trim() || spec.base, apiModel.value.trim() || spec.model);
  }

  apiBaseUrl?.addEventListener("input", refreshApiScript);
  apiModel?.addEventListener("input", refreshApiScript);

  async function doConnect(provider, extra = {}) {
    showConnHint("Verificando conexão…", "ok");
    const res = await fetch("/api/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, mode: "auto", ...extra }),
    });
    const data = await res.json();
    const ok = Boolean(data.linked);
    showConnHint(data.message || (ok ? "Conectado." : "Ainda não conectado."), ok ? "ok" : "err");
    await loadConnections();
    return data;
  }

  document.querySelectorAll(".conn-btn").forEach((btn) => {
    btn.onclick = async () => {
      const provider = btn.dataset.provider;
      btn.disabled = true;
      try {
        // Claude/ChatGPT: valida key salva/env/.env de verdade (auth Bearer / x-api-key)
        await doConnect(provider);
      } catch {
        showConnHint("Não consegui conectar.", "err");
      }
      btn.disabled = false;
    };
  });

  document.querySelectorAll(".api-btn").forEach((btn) => {
    btn.onclick = async () => {
      apiProvider = btn.dataset.provider || "";
      if (apiProvider === "instagram" || apiProvider === "tiktok") {
        showConnHint("Redes sociais não usam API. Clique em Conectar.", "err");
        return;
      }
      if (!API_SPECS[apiProvider]) {
        showConnHint("Provedor sem parâmetros de API.", "err");
        return;
      }
      await loadConnections();
      fillApiForm(apiProvider, lastConn[apiProvider] || {});
      apiModal.hidden = false;
      apiKeyInput.focus();
    };
  });

  async function loadDetails(provider) {
    detailsTitle.textContent = provider ? `Detalhes · ${provider}` : "Detalhes";
    detailsList.innerHTML = `<p class="tiny">Carregando…</p>`;
    const q = provider ? `?provider=${encodeURIComponent(provider)}&limit=120` : "?limit=120";
    try {
      const res = await fetch(`/api/activity${q}`);
      const data = await res.json();
      const rows = data.rows || [];
      if (!rows.length) {
        detailsList.innerHTML = `<p class="tiny">Sem logs ainda. Use <b>API</b> ou <b>Conectar</b> — erros GET/POST aparecem aqui.</p>`;
        return;
      }
      detailsList.innerHTML = rows
        .map((r) => {
          const isErr = r.ok === false || r.level === "error" || (r.status && r.status >= 400);
          const cls = isErr ? "err" : r.ok ? "ok" : "";
          const statusLabel =
            r.status == null ? "" : r.status === 0 ? "NET FAIL" : `HTTP ${r.status}`;
          const meta = [r.method || "—", statusLabel, r.kind, r.path].filter(Boolean).join(" · ");
          const badge = isErr ? "ERRO" : r.ok ? "OK" : "…";
          return `<article class="log-row ${cls}">
            <div class="log-top"><time>${esc((r.at || "").replace("T", " ").slice(0, 19))}</time><em class="log-badge">${badge}</em></div>
            <b>${esc(r.message || r.kind || "evento")}</b>
            <span>${esc(meta)}</span>
            ${r.detail ? `<code>${esc(r.detail)}</code>` : ""}
          </article>`;
        })
        .join("");
    } catch (error) {
      detailsList.innerHTML = `<p class="tiny" style="color:var(--danger)">Falha ao ler logs: ${esc(error.message || "erro")}</p>`;
    }
  }

  document.querySelectorAll(".details-btn").forEach((btn) => {
    btn.onclick = async () => {
      detailsProvider = btn.dataset.provider || "";
      detailsModal.hidden = false;
      await loadDetails(detailsProvider);
    };
  });

  $("apiClose").onclick = () => {
    apiModal.hidden = true;
  };
  $("apiCancel").onclick = () => {
    apiModal.hidden = true;
  };
  function setApiStatus(text, kind = "ok") {
    if (!apiStatus) return;
    if (!text) {
      apiStatus.hidden = true;
      return;
    }
    apiStatus.hidden = false;
    apiStatus.textContent = text;
    apiStatus.dataset.kind = kind;
  }

  $("apiApply").onclick = async () => {
    if (apiProvider === "instagram" || apiProvider === "tiktok") {
      setApiStatus("Redes sociais não usam API.", "err");
      return;
    }
    const raw = apiKeyInput.value.trim();
    if (!raw) {
      setApiStatus("Cole a key antes de validar.", "err");
      apiKeyInput.focus();
      return;
    }
    const payload = {
      provider: apiProvider,
      mode: "manual",
      apiKey: raw,
      baseUrl: apiBaseUrl.value.trim(),
      model: apiModel.value.trim(),
    };
    setApiStatus("Validando na API real…", "ok");
    $("apiApply").disabled = true;
    try {
      const res = await fetch("/api/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      const ok = Boolean(data.linked);
      setApiStatus(data.message || (ok ? "OK" : "Falhou"), ok ? "ok" : "err");
      showConnHint(data.message || "", ok ? "ok" : "err");
      await loadConnections();
      if (ok) {
        setTimeout(() => {
          apiModal.hidden = true;
        }, 700);
      }
    } catch {
      setApiStatus("Falha de rede ao validar.", "err");
      showConnHint("Falha ao validar API.", "err");
    }
    $("apiApply").disabled = false;
  };

  $("detailsClose").onclick = () => {
    detailsModal.hidden = true;
  };
  $("detailsDone").onclick = () => {
    detailsModal.hidden = true;
  };
  $("detailsRefresh").onclick = () => loadDetails(detailsProvider || "");

  apiModal?.addEventListener("click", (e) => {
    if (e.target === apiModal) apiModal.hidden = true;
  });
  detailsModal?.addEventListener("click", (e) => {
    if (e.target === detailsModal) detailsModal.hidden = true;
  });

  micGain.oninput = () => {
    micGainVal.textContent = `${Number(micGain.value) || 100}%`;
  };
  audioTest.onclick = () => startMeter();

  cfgSave.onclick = async () => {
    audioCfg = readAudioForm();
    saveAudioLocal(audioCfg);
    await fetch("/api/audio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(audioCfg),
    }).catch(() => {});
    closeCfg();
    bubble.innerHTML = formatRich("Áudio salvo.");
    setMood("happy");
    setHint("Salvo.", "ok");
    setTimeout(() => setHint(""), 2000);
  };

  setupTabs();
  setupMic();
  connectEvents();
  setMood("wave");
  fetch("/api/state")
    .then((r) => r.json())
    .then(render)
    .catch(() => {
      $("bootFail").style.display = "block";
    });
})();
