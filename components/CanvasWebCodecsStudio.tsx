"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AudioBufferSource,
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  Quality,
  QUALITY_HIGH,
} from "mediabunny";

type Action = {
  character: string;
  action: string;
  emotion?: string;
  gesture?: string;
};

type Scene = {
  number: number;
  title: string;
  start: number;
  end: number;
  summary: string;
  emotion: string;
  setting: string;
  camera: string;
  actions?: Action[];
};

type ExportStory = {
  story_title?: string;
  characters?: Array<{ role: string; description: string }>;
  scenes?: Scene[];
};

type Props = { story: ExportStory };

const W = 1280;
const H = 720;
const FPS = 30;

const palette = ["#9b7cff", "#ff5da2", "#53d8fb", "#ffd166", "#7ee081"];

function durationOf(story: ExportStory) {
  const scenes = story.scenes ?? [];
  return Math.max(1, ...scenes.map((s) => Number(s.end) || 0));
}

function sceneAt(story: ExportStory, t: number) {
  const scenes = story.scenes ?? [];
  return scenes.find((s) => t >= s.start && t < s.end) ?? scenes[scenes.length - 1] ?? null;
}

function cameraScale(camera = "") {
  const c = camera.toLowerCase();
  if (c.includes("close")) return 1.16;
  if (c.includes("wide")) return 0.9;
  if (c.includes("zoom")) return 1.08;
  return 1;
}

function cameraOffset(camera = "", local: number) {
  const c = camera.toLowerCase();
  if (c.includes("pan")) return Math.sin(local * 0.55) * 90;
  if (c.includes("shake")) return Math.sin(local * 22) * 7;
  return 0;
}

function characterMotion(action: string, local: number) {
  const a = action.toLowerCase();
  const bounce = Math.sin(local * 5) * 7;
  if (a.includes("walk") || a.includes("run") || a.includes("move")) return { x: Math.sin(local * 1.8) * 150, y: bounce };
  if (a.includes("jump")) return { x: 0, y: -Math.abs(Math.sin(local * 3)) * 80 };
  if (a.includes("dance")) return { x: Math.sin(local * 5) * 35, y: Math.sin(local * 10) * 16 };
  if (a.includes("sit")) return { x: 0, y: 38 };
  return { x: 0, y: bounce };
}

const ASSET_BASE = "https://raw.githubusercontent.com/jbnikky13/cartoon-studios/main/char_assets_fullbody/";
const assetCache = new Map<string, HTMLImageElement>();
const assetLoads = new Map<string, Promise<HTMLImageElement>>();

function slugifyCharacter(name: string) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function characterAssetUrl(name: string) {
  const slug = slugifyCharacter(name);
  return `${ASSET_BASE}${slug}/full_body.png`;
}

function loadCharacterAsset(name: string) {
  const key = slugifyCharacter(name);
  const cached = assetCache.get(key);
  if (cached) return Promise.resolve(cached);
  const existing = assetLoads.get(key);
  if (existing) return existing;
  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => { assetCache.set(key, img); resolve(img); };
    img.onerror = () => reject(new Error(`Character asset not found: ${name}`));
    img.src = characterAssetUrl(name);
  });
  assetLoads.set(key, promise);
  return promise;
}

function drawCharacter(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, action: string, local: number, label: string, image?: HTMLImageElement) {
  const motion = characterMotion(action, local);
  ctx.save();
  ctx.translate(x + motion.x, y + motion.y);

  ctx.fillStyle = "rgba(0,0,0,.28)";
  ctx.beginPath();
  ctx.ellipse(0, 155 - motion.y, 82, 18, 0, 0, Math.PI * 2);
  ctx.fill();

  if (image) {
    const maxW = 210;
    const maxH = 360;
    const ratio = Math.min(maxW / image.naturalWidth, maxH / image.naturalHeight);
    const dw = image.naturalWidth * ratio;
    const dh = image.naturalHeight * ratio;
    ctx.drawImage(image, -dw / 2, -dh + 20, dw, dh);
  } else {
    ctx.fillStyle = color;
    ctx.fillRect(-62, -48, 124, 145);
    ctx.beginPath();
    ctx.arc(0, -112, 62, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#17131f";
    ctx.beginPath();
    ctx.arc(-22, -118, 8, 0, Math.PI * 2);
    ctx.arc(22, -118, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#f7f7ff";
    ctx.lineWidth = 7;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(0, -103, 27, 0.15, Math.PI - 0.15);
    ctx.stroke();
    const arm = Math.sin(local * 4) * 25;
    ctx.strokeStyle = "#ffc4d7";
    ctx.lineWidth = 20;
    ctx.beginPath();
    ctx.moveTo(-58, -22);
    ctx.lineTo(-108, 38 + arm);
    ctx.moveTo(58, -22);
    ctx.lineTo(108, 38 - arm);
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = 24;
    ctx.beginPath();
    ctx.moveTo(-30, 97);
    ctx.lineTo(-45, 160);
    ctx.moveTo(30, 97);
    ctx.lineTo(45, 160);
    ctx.stroke();
  }

  ctx.fillStyle = "#fff";
  ctx.font = "700 15px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(label.slice(0, 18), 0, 193);
  ctx.restore();
}

function drawFrame(canvas: HTMLCanvasElement, story: ExportStory, t: number) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const scenes = story.scenes ?? [];
  const scene = sceneAt(story, t);
  const duration = durationOf(story);
  const local = scene ? Math.max(0, t - scene.start) : t;
  const sceneLength = scene ? Math.max(0.1, scene.end - scene.start) : duration;
  const sceneProgress = scene ? Math.min(1, Math.max(0, local / sceneLength)) : 0;

  const gradient = ctx.createLinearGradient(0, 0, W, H);
  gradient.addColorStop(0, "#17132f");
  gradient.addColorStop(0.55, "#32265c");
  gradient.addColorStop(1, "#0b0d15");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, W, H);

  for (let i = 0; i < 7; i++) {
    const x = ((i + 1) * W) / 8;
    const y = 120 + Math.sin(t * (0.5 + i * 0.04) + i) * 40;
    const r = 70 + i * 15;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, r);
    glow.addColorStop(0, "rgba(155,124,255,.15)");
    glow.addColorStop(1, "rgba(155,124,255,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "#0a0c13";
  ctx.fillRect(0, 570, W, 150);

  const scale = cameraScale(scene?.camera);
  const pan = cameraOffset(scene?.camera, local);
  ctx.save();
  ctx.translate(W / 2 + pan, H / 2);
  ctx.scale(scale, scale);
  ctx.translate(-W / 2, -H / 2);

  const actions = scene?.actions ?? [];
  const names = Array.from(new Set([
    ...actions.map((a) => a.character),
    ...(story.characters ?? []).map((c) => c.role),
  ])).filter(Boolean);
  const cast = names.length ? names : ["Character"];
  const positions = cast.slice(0, 5).map((_, i, arr) => W / 2 + (i - (arr.length - 1) / 2) * Math.min(190, 680 / Math.max(1, arr.length)));

  cast.slice(0, 5).forEach((name, i) => {
    const action = actions.find((a) => a.character === name)?.action ?? "idle";
    drawCharacter(ctx, positions[i], 455, palette[i % palette.length], action, local, name, assetCache.get(slugifyCharacter(name)));
  });

  ctx.restore();

  const fadeIn = Math.min(1, sceneProgress * 5);
  const fadeOut = Math.min(1, (1 - sceneProgress) * 5);
  ctx.globalAlpha = Math.min(fadeIn, fadeOut);
  ctx.fillStyle = "rgba(8,9,16,.78)";
  ctx.roundRect(42, 34, 780, 175, 18);
  ctx.fill();

  ctx.fillStyle = "#fff";
  ctx.font = "800 20px Inter, system-ui, sans-serif";
  ctx.fillText("CARTOON STUDIO · PHASE 3 AUDIO ENGINE", 64, 70);

  if (scene) {
    ctx.font = "800 40px Inter, system-ui, sans-serif";
    ctx.fillText(`SCENE ${scene.number} · ${scene.title}`, 64, 118);
    ctx.fillStyle = "#c9c2df";
    ctx.font = "22px Inter, system-ui, sans-serif";
    const summary = scene.summary.length > 84 ? scene.summary.slice(0, 81) + "…" : scene.summary;
    ctx.fillText(summary, 64, 151);
    ctx.fillStyle = "#9b7cff";
    ctx.font = "700 17px Inter, system-ui, sans-serif";
    ctx.fillText(`${scene.emotion} · ${scene.setting} · ${scene.camera}`, 64, 180);
  }

  ctx.globalAlpha = 1;
  const barX = 54;
  const barY = 665;
  const barW = W - 108;
  ctx.fillStyle = "rgba(255,255,255,.14)";
  ctx.fillRect(barX, barY, barW, 5);
  ctx.fillStyle = "#9b7cff";
  ctx.fillRect(barX, barY, barW * Math.min(1, t / duration), 5);
  scenes.forEach((s) => {
    const x = barX + (s.start / duration) * barW;
    ctx.fillStyle = "rgba(255,255,255,.55)";
    ctx.fillRect(x, barY - 7, 1, 19);
  });
  ctx.fillStyle = "#aeb4c8";
  ctx.font = "600 15px Inter, system-ui, sans-serif";
  ctx.fillText(story.story_title || "Animated Story", 54, 700);
  ctx.textAlign = "right";
  ctx.fillText(`${t.toFixed(1)}s / ${duration.toFixed(1)}s`, W - 54, 700);
  ctx.textAlign = "left";
}

async function decodeAudio(file: File) {
  const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) throw new Error("Web Audio is not available in this browser.");
  const context = new AudioContextClass();
  try {
    return await context.decodeAudioData(await file.arrayBuffer());
  } finally {
    await context.close();
  }
}

async function mixAudio(music: AudioBuffer | null, voice: AudioBuffer | null, duration: number, musicVolume: number, voiceVolume: number) {
  if (!music && !voice) return null;

  const OfflineContext = window.OfflineAudioContext || (window as typeof window & { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  if (!OfflineContext) throw new Error("Offline Web Audio is not available in this browser.");

  const sampleRate = music?.sampleRate || voice?.sampleRate || 48000;
  const channels = 2;
  const length = Math.ceil(duration * sampleRate);
  const offline = new OfflineContext(channels, length, sampleRate);

  const connectBuffer = (buffer: AudioBuffer, volume: number, loop: boolean) => {
    const source = offline.createBufferSource();
    source.buffer = buffer;
    source.loop = loop;
    const gain = offline.createGain();
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(offline.destination);
    source.start(0);
  };

  if (music) connectBuffer(music, musicVolume, true);
  if (voice) connectBuffer(voice, voiceVolume, false);

  return await offline.startRendering();
}

export default function CanvasWebCodecsStudio({ story }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [playing, setPlaying] = useState(true);
  const [time, setTime] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [status, setStatus] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");
  const [music, setMusic] = useState<AudioBuffer | null>(null);
  const [voice, setVoice] = useState<AudioBuffer | null>(null);
  const [musicName, setMusicName] = useState("");
  const [voiceName, setVoiceName] = useState("");
  const [musicVolume, setMusicVolume] = useState(0.55);
  const [voiceVolume, setVoiceVolume] = useState(1);
  const [audioBusy, setAudioBusy] = useState(false);

  const duration = useMemo(() => durationOf(story), [story]);
  const supported = typeof window !== "undefined" && "VideoEncoder" in window && "VideoFrame" in window;

  useEffect(() => setTime(0), [story]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      setTime((v) => {
        if (!playing) return v;
        const next = v + dt;
        return next >= duration ? 0 : next;
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, duration]);

  const characterNames = useMemo(() => {
    const scenes = story.scenes ?? [];
    const actionNames = scenes.flatMap((s) => (s.actions ?? []).map((a) => a.character));
    const castNames = (story.characters ?? []).map((c) => c.role);
    return Array.from(new Set([...actionNames, ...castNames].filter(Boolean))).slice(0, 5);
  }, [story]);

  const [assetsReady, setAssetsReady] = useState(false);
  const [assetStatus, setAssetStatus] = useState("Loading character assets…");

  useEffect(() => {
    let cancelled = false;
    setAssetsReady(false);
    setAssetStatus(characterNames.length ? "Loading character assets…" : "Using fallback character.");
    Promise.allSettled(characterNames.map((name) => loadCharacterAsset(name)))
      .then((results) => {
        if (cancelled) return;
        const loaded = results.filter((r) => r.status === "fulfilled").length;
        setAssetsReady(true);
        setAssetStatus(characterNames.length ? `${loaded}/${characterNames.length} character assets ready.` : "Using fallback character.");
      });
    return () => { cancelled = true; };
  }, [characterNames]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) drawFrame(canvas, story, time);
  }, [story, time, assetsReady]);

  useEffect(() => () => {
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  }, [downloadUrl]);

  async function loadAudio(file: File, kind: "music" | "voice") {
    setAudioBusy(true);
    setStatus(`Decoding ${kind}…`);
    try {
      const buffer = await decodeAudio(file);
      if (kind === "music") {
        setMusic(buffer);
        setMusicName(file.name);
      } else {
        setVoice(buffer);
        setVoiceName(file.name);
      }
      setStatus(`${kind === "music" ? "Music" : "Voice"} loaded and ready for sync.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : `Could not decode ${kind}.`);
    } finally {
      setAudioBusy(false);
    }
  }

  async function previewAudio() {
    if (!music && !voice) {
      setStatus("Add music or voice first.");
      return;
    }
    setStatus("Preparing synchronized audio preview…");
    try {
      const mixed = await mixAudio(music, voice, duration, musicVolume, voiceVolume);
      if (!mixed) return;
      const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) throw new Error("Web Audio is not available.");
      const context = new AudioContextClass();
      const source = context.createBufferSource();
      source.buffer = mixed;
      source.connect(context.destination);
      source.start(0, Math.min(time, Math.max(0, mixed.duration - 0.01)));
      source.onended = () => void context.close();
      setStatus("Playing synchronized music + voice preview.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Audio preview failed.");
    }
  }

  async function exportMp4() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    setExporting(true);
    setStatus("Preparing video and synchronized audio…");
    setDownloadUrl("");

    try {
      if (!supported) throw new Error("WebCodecs is not available in this browser. Try a recent Chrome or Edge.");

      const output = new Output({
        format: new Mp4OutputFormat({ fastStart: "in-memory" }),
        target: new BufferTarget(),
      });

      const videoSource = new CanvasSource(canvas, {
        codec: "avc",
        bitrate: QUALITY_HIGH,
      });
      output.addVideoTrack(videoSource, { frameRate: FPS });

      const mixed = await mixAudio(music, voice, duration, musicVolume, voiceVolume);
      let audioSource: AudioBufferSource | null = null;

      if (mixed) {
        audioSource = new AudioBufferSource({
          codec: "aac",
          quality: new Quality({ bitrate: 128e3 }),
        });
        output.addAudioTrack(audioSource);
      }

      await output.start();

      const frames = Math.ceil(duration * FPS);
      for (let i = 0; i < frames; i++) {
        const timestamp = i / FPS;
        drawFrame(canvas, story, timestamp);
        await videoSource.add(timestamp, 1 / FPS);

        if (i % 15 === 0) {
          setStatus(`Encoding video ${Math.round((i / frames) * 100)}%…`);
          await new Promise((resolve) => requestAnimationFrame(resolve));
        }
      }

      if (audioSource && mixed) {
        setStatus("Encoding synchronized audio…");
        await audioSource.add(mixed);
        audioSource.close();
      }

      videoSource.close();
      await output.finalize();

      const buffer = output.target.buffer;
      if (!buffer) throw new Error("Encoder returned an empty file.");

      const url = URL.createObjectURL(new Blob([buffer], { type: "video/mp4" }));
      setDownloadUrl(url);
      setStatus(mixed ? "MP4 ready with synchronized audio." : "MP4 ready — no audio track was selected.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="card render-studio">
      <div className="render-head">
        <div>
          <div className="eyebrow">Phase 3 · Audio + Video Engine</div>
          <h2>Canvas + WebCodecs + Web Audio</h2>
          <p className="muted">Add music and voice, mix them locally, preview the timing, and export one synchronized MP4.</p>
        </div>
        <div className={supported ? "engine-pill ok" : "engine-pill"}>
          {supported ? "● WebCodecs ready" : "● WebCodecs unavailable"}
        </div>
      </div>

      <div className="asset-status muted">{assetStatus}</div>
      <div className="canvas-wrap">
        <canvas ref={canvasRef} width={W} height={H} />
      </div>

      <div className="render-controls">
        <button className="secondary" onClick={() => setPlaying((v) => !v)} disabled={exporting}>
          {playing ? "⏸ Pause" : "▶ Play"}
        </button>
        <input aria-label="Timeline" type="range" min={0} max={duration} step={1 / FPS} value={Math.min(time, duration)}
          onChange={(e) => { setPlaying(false); setTime(Number(e.target.value)); }} disabled={exporting} style={{ flex: 1 }} />
        <button className="primary render-button" onClick={exportMp4} disabled={exporting || !supported}>
          {exporting ? "Encoding…" : "🎬 Export MP4"}
        </button>
      </div>

      <div className="audio-panel">
        <div className="eyebrow">Audio timeline</div>
        <div className="audio-grid">
          <label className="audio-slot">
            <span>🎵 Music</span>
            <input type="file" accept="audio/*" disabled={audioBusy || exporting}
              onChange={(e) => { const file = e.target.files?.[0]; if (file) void loadAudio(file, "music"); }} />
            <small>{musicName || "Choose a music file"}</small>
          </label>
          <label className="audio-slot">
            <span>🎙️ Voice</span>
            <input type="file" accept="audio/*" disabled={audioBusy || exporting}
              onChange={(e) => { const file = e.target.files?.[0]; if (file) void loadAudio(file, "voice"); }} />
            <small>{voiceName || "Choose narration / voiceover"}</small>
          </label>
        </div>
        <div className="volume-row">
          <label>Music {Math.round(musicVolume * 100)}%
            <input type="range" min="0" max="1" step="0.05" value={musicVolume} onChange={(e) => setMusicVolume(Number(e.target.value))} />
          </label>
          <label>Voice {Math.round(voiceVolume * 100)}%
            <input type="range" min="0" max="1.5" step="0.05" value={voiceVolume} onChange={(e) => setVoiceVolume(Number(e.target.value))} />
          </label>
          <button className="secondary" onClick={() => void previewAudio()} disabled={audioBusy || exporting || (!music && !voice)}>▶ Preview audio</button>
        </div>
      </div>

      {status && <p className={status.includes("ready") ? "success" : "muted"}>{status}</p>}
      {downloadUrl && <a className="download" href={downloadUrl} download="cartoon-studio-phase-3.mp4">⬇️ Download Phase 3 MP4</a>}
    </section>
  );
}
