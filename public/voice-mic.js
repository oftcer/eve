/**
 * Microfone EVE — push-to-talk estilo ChatGPT
 * 1) Web Speech (texto ao vivo) se disponível
 * 2) Senão: MediaRecorder → PCM WAV → /api/listen
 */
(function (global) {
  function encodeWav(samples, sampleRate) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);
    const str = (o, s) => {
      for (let i = 0; i < s.length; i += 1) view.setUint8(o + i, s.charCodeAt(i));
    };
    str(0, "RIFF");
    view.setUint32(4, 36 + samples.length * 2, true);
    str(8, "WAVE");
    str(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    str(36, "data");
    view.setUint32(40, samples.length * 2, true);
    let o = 44;
    for (let i = 0; i < samples.length; i += 1) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
    return buffer;
  }

  function bufToBase64(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  async function blobToWav16k(blob) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    try {
      const raw = await blob.arrayBuffer();
      const decoded = await ctx.decodeAudioData(raw.slice(0));
      const ch0 = decoded.getChannelData(0);
      // mono mix se stereo
      let mono = ch0;
      if (decoded.numberOfChannels > 1) {
        const ch1 = decoded.getChannelData(1);
        mono = new Float32Array(ch0.length);
        for (let i = 0; i < ch0.length; i += 1) mono[i] = (ch0[i] + ch1[i]) * 0.5;
      }
      // normaliza
      let peak = 0;
      for (let i = 0; i < mono.length; i += 1) peak = Math.max(peak, Math.abs(mono[i]));
      if (peak > 0.0002 && peak < 0.95) {
        const g = Math.min(20, 0.95 / peak);
        for (let i = 0; i < mono.length; i += 1) mono[i] = Math.max(-1, Math.min(1, mono[i] * g));
      }
      const target = 16000;
      const ratio = decoded.sampleRate / target;
      const len = Math.max(1, Math.floor(mono.length / ratio));
      const down = new Float32Array(len);
      for (let i = 0; i < len; i += 1) {
        down[i] = mono[Math.min(mono.length - 1, Math.floor(i * ratio))];
      }
      return encodeWav(down, target);
    } finally {
      try {
        await ctx.close();
      } catch {
        /* ok */
      }
    }
  }

  /**
   * @param {object} ui
   * @param {(text:string)=>Promise<void>} ui.onTranscript
   * @param {(msg:string, kind?:string)=>void} ui.setHint
   * @param {(on:boolean)=>void} ui.setListening
   * @param {(on:boolean)=>void} ui.setHearing
   * @param {(pct:number)=>void} [ui.setLevel]
   * @param {()=>string|undefined} [ui.deviceId]
   * @param {(on:boolean)=>void} [ui.onMicActive]
   */
  function createVoiceMic(ui) {
    let active = false;
    let finishing = false;
    let stream = null;
    let recorder = null;
    let chunks = [];
    let recognition = null;
    let speechText = "";
    let speechInterim = "";
    let analyser = null;
    let audioCtx = null;
    let raf = 0;
    let silenceTimer = 0;
    let lastLoud = 0;
    let heard = false;

    function constraints() {
      const audio = {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: true,
        channelCount: 1,
      };
      const id = ui.deviceId?.();
      if (id) audio.deviceId = { ideal: id };
      return { audio, video: false };
    }

    function stopMeter() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      if (silenceTimer) clearInterval(silenceTimer);
      silenceTimer = 0;
      try {
        audioCtx?.close();
      } catch {
        /* ok */
      }
      audioCtx = null;
      analyser = null;
      ui.setLevel?.(0);
    }

    function stopRecognition() {
      if (!recognition) return;
      try {
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;
        recognition.stop();
      } catch {
        /* ok */
      }
      recognition = null;
    }

    function stopHardware() {
      stopRecognition();
      stopMeter();
      try {
        if (recorder && recorder.state !== "inactive") recorder.stop();
      } catch {
        /* ok */
      }
      recorder = null;
      if (stream) {
        for (const t of stream.getTracks()) t.stop();
        stream = null;
      }
      ui.setHearing(false);
      ui.setListening(false);
      ui.onMicActive?.(false);
      active = false;
    }

    function startLevelWatch(mediaStream) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      audioCtx = new Ctx();
      if (audioCtx.state === "suspended") audioCtx.resume();
      const src = audioCtx.createMediaStreamSource(mediaStream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      lastLoud = Date.now();
      heard = false;

      const tick = () => {
        if (!active || !analyser) return;
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        let peak = 0;
        for (let i = 0; i < data.length; i += 1) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
          peak = Math.max(peak, Math.abs(v));
        }
        const rms = Math.sqrt(sum / data.length);
        ui.setLevel?.(Math.min(100, Math.round(rms * 500)));
        if (rms > 0.012 || peak > 0.04) {
          heard = true;
          lastLoud = Date.now();
          ui.setHearing(true);
        } else if (Date.now() - lastLoud > 450) {
          ui.setHearing(false);
        }
        raf = requestAnimationFrame(tick);
      };
      tick();

      // auto-envia após ~1s de silêncio se já ouviu voz
      silenceTimer = setInterval(() => {
        if (!active || finishing) return;
        const spoken = speechText.trim() || heard;
        if (spoken && Date.now() - lastLoud > 1100) {
          void stopAndSend({ auto: true });
        }
      }, 200);
    }

    function startWebSpeech() {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) return false;
      speechText = "";
      speechInterim = "";
      const rec = new SR();
      recognition = rec;
      rec.lang = "pt-BR";
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 1;

      rec.onresult = (ev) => {
        let interim = "";
        let finals = speechText;
        for (let i = ev.resultIndex; i < ev.results.length; i += 1) {
          const t = ev.results[i][0]?.transcript || "";
          if (ev.results[i].isFinal) finals += `${t} `;
          else interim += t;
        }
        speechText = finals;
        speechInterim = interim;
        const full = `${speechText}${speechInterim}`.trim();
        if (full) {
          heard = true;
          lastLoud = Date.now();
          ui.setHearing(true);
          ui.onPartial?.(full);
        }
      };

      rec.onerror = (ev) => {
        if (ev.error === "not-allowed") {
          ui.setHint("Permita o microfone.", "err");
        }
        // network/no-speech: continua com MediaRecorder
      };

      rec.onend = () => {
        if (!active || finishing) return;
        try {
          rec.start();
        } catch {
          /* ok */
        }
      };

      try {
        rec.start();
        return true;
      } catch {
        recognition = null;
        return false;
      }
    }

    async function start() {
      if (active || finishing) return;
      active = true;
      chunks = [];
      speechText = "";
      speechInterim = "";
      heard = false;
      ui.setListening(true);
      ui.setHint("Ouvindo… fale e toque de novo pra enviar.", "ok");
      ui.onMicActive?.(true);

      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints());
      } catch (err) {
        stopHardware();
        ui.setHint(
          /NotAllowed|Permission/i.test(err?.name || "") ? "Permita o microfone." : "Não abri o microfone.",
          "err",
        );
        return;
      }

      startLevelWatch(stream);
      startWebSpeech();

      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "";
      try {
        recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      } catch {
        recorder = new MediaRecorder(stream);
      }
      chunks = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };
      recorder.start(250);
    }

    async function stopAndSend(opts = {}) {
      if (finishing) return;
      if (!active) return;
      finishing = true;

      const webText = `${speechText} ${speechInterim}`.replace(/\s+/g, " ").trim();
      stopRecognition();

      const blob = await new Promise((resolve) => {
        if (!recorder || recorder.state === "inactive") {
          resolve(null);
          return;
        }
        recorder.onstop = () => {
          resolve(chunks.length ? new Blob(chunks, { type: recorder.mimeType || "audio/webm" }) : null);
        };
        try {
          recorder.stop();
        } catch {
          resolve(null);
        }
      });

      stopHardware();
      finishing = false;

      // 1) Web Speech já tem texto
      if (webText.length >= 2) {
        ui.setHint("Enviado…", "ok");
        await ui.onTranscript(webText);
        return;
      }

      // 2) clique sem fala
      if (opts.userStop && !heard) {
        ui.setHint("Mic desligado.", "ok");
        ui.onIdle?.();
        return;
      }

      if (!blob || blob.size < 200) {
        ui.setHint(opts.userStop ? "Mic desligado." : "Áudio vazio. Tente de novo.", opts.userStop ? "ok" : "err");
        if (opts.userStop) ui.onIdle?.();
        return;
      }

      try {
        ui.setHint("Escrevendo o que você falou…", "ok");
        const wav = await blobToWav16k(blob);
        const wavBase64 = bufToBase64(wav);
        const res = await fetch("/api/listen", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ wavBase64 }),
        });
        const data = await res.json().catch(() => ({}));
        const text = String(data.text || "").trim();
        if (text) {
          await ui.onTranscript(text);
          return;
        }
        ui.setHint(data.error || "Não entendi. Pode repetir?", "err");
      } catch {
        ui.setHint("Falha ao reconhecer.", "err");
      }
    }

    function forceStop(hint) {
      finishing = true;
      stopHardware();
      finishing = false;
      if (hint) ui.setHint(hint, "ok");
      ui.onIdle?.();
    }

    return {
      get active() {
        return active;
      },
      start,
      stopAndSend,
      forceStop,
      toggle: async () => {
        if (finishing) return;
        if (active) await stopAndSend({ userStop: true });
        else await start();
      },
    };
  }

  global.createVoiceMic = createVoiceMic;
})(window);
