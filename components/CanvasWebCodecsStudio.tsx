"use client";

import { useEffect, useRef, useState } from "react";
import {
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
} from "mediabunny";

type ExportStory = {
  story_title?: string;
  scenes?: Array<{
    number: number;
    title: string;
    start: number;
    end: number;
    summary: string;
    emotion: string;
    setting: string;
    camera: string;
    actions?: Array<{ character: string; action: string; emotion?: string; gesture?: string }>;
  }>;
};

type Props = { story: ExportStory };

const W = 1280;
const H = 720;
const FPS = 30;
const DURATION = 8;

function sceneAt(story: ExportStory, t: number) {
  const scenes = story.scenes ?? [];
  return scenes.find((s) => t >= s.start && t < s.end) ?? scenes[Math.min(scenes.length - 1, 0)];
}

function drawFrame(canvas: HTMLCanvasElement, story: ExportStory, t: number) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const scene = sceneAt(story, t);
  const progress = Math.min(1, t / DURATION);
  const local = scene ? Math.max(0, t - scene.start) : t;

  const gradient = ctx.createLinearGradient(0, 0, W, H);
  gradient.addColorStop(0, "#17132f");
  gradient.addColorStop(0.55, "#32265c");
  gradient.addColorStop(1, "#0b0d15");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, W, H);

  // Atmospheric lights.
  for (let i = 0; i < 5; i++) {
    const x = ((i + 1) * W) / 6;
    const y = 150 + Math.sin(t * 0.8 + i) * 35;
    const r = 80 + i * 18;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, r);
    glow.addColorStop(0, "rgba(155,124,255,.16)");
    glow.addColorStop(1, "rgba(155,124,255,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Ground.
  ctx.fillStyle = "#0a0c13";
  ctx.fillRect(0, 570, W, 150);

  // Character body with deterministic motion.
  const bob = Math.sin(local * 4) * 7;
  const walk = Math.sin(local * 2.5) * 34;
  const cx = 420 + walk;
  const cy = 455 + bob;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = "#9b7cff";
  ctx.beginPath();
  ctx.arc(0, -115, 62, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#17131f";
  ctx.beginPath();
  ctx.arc(-22, -120, 8, 0, Math.PI * 2);
  ctx.arc(22, -120, 8, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#f5f7ff";
  ctx.lineWidth = 7;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(0, -105, 27, 0.15, Math.PI - 0.15);
  ctx.stroke();

  ctx.fillStyle = "#ff5da2";
  ctx.fillRect(-70, -50, 140, 145);

  const arm = Math.sin(local * 3) * 24;
  ctx.strokeStyle = "#ffb8cf";
  ctx.lineWidth = 20;
  ctx.beginPath();
  ctx.moveTo(-60, -25);
  ctx.lineTo(-110, 40 + arm);
  ctx.moveTo(60, -25);
  ctx.lineTo(110, 40 - arm);
  ctx.stroke();

  ctx.strokeStyle = "#9b7cff";
  ctx.lineWidth = 24;
  ctx.beginPath();
  ctx.moveTo(-32, 95);
  ctx.lineTo(-48, 160);
  ctx.moveTo(32, 95);
  ctx.lineTo(48, 160);
  ctx.stroke();
  ctx.restore();

  // Camera-like entrance.
  ctx.globalAlpha = Math.min(1, progress * 4);
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 20px Inter, system-ui, sans-serif";
  ctx.fillText("CARTOON STUDIO · CANVAS + WEBCODECS", 54, 54);

  if (scene) {
    ctx.fillStyle = "#ffffff";
    ctx.font = "800 42px Inter, system-ui, sans-serif";
    ctx.fillText(`SCENE ${scene.number} · ${scene.title}`, 54, 115);

    ctx.fillStyle = "#c9c2df";
    ctx.font = "24px Inter, system-ui, sans-serif";
    const summary = scene.summary.length > 86 ? scene.summary.slice(0, 83) + "…" : scene.summary;
    ctx.fillText(summary, 54, 155);

    ctx.fillStyle = "#9b7cff";
    ctx.font = "700 18px Inter, system-ui, sans-serif";
    ctx.fillText(`${scene.emotion} · ${scene.setting} · ${scene.camera}`, 54, 190);
  }

  ctx.globalAlpha = 1;
  ctx.fillStyle = "#aeb4c8";
  ctx.font = "600 16px Inter, system-ui, sans-serif";
  ctx.fillText(story.story_title || "Animated Story Preview", 54, 675);
  ctx.fillText(`${t.toFixed(1)}s / ${DURATION.toFixed(1)}s`, 1080, 675);
}

export default function CanvasWebCodecsStudio({ story }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [playing, setPlaying] = useState(true);
  const [time, setTime] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [status, setStatus] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");

  const supported =
    typeof window !== "undefined" &&
    "VideoEncoder" in window &&
    "VideoFrame" in window;

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      setTime((v) => {
        const next = playing ? v + dt : v;
        return next >= DURATION ? 0 : next;
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) drawFrame(canvas, story, time);
  }, [story, time]);

  useEffect(() => () => {
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  }, [downloadUrl]);

  async function exportMp4() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    setExporting(true);
    setStatus("Preparing browser-native encoder…");
    setDownloadUrl("");

    try {
      if (!supported) {
        throw new Error("WebCodecs is not available in this browser. Try a recent Chrome, Edge, or another browser with WebCodecs support.");
      }

      const output = new Output({
        format: new Mp4OutputFormat({ fastStart: "in-memory" }),
        target: new BufferTarget(),
      });

      const source = new CanvasSource(canvas, {
        codec: "avc",
        bitrate: QUALITY_HIGH,
      });

      output.addVideoTrack(source, { frameRate: FPS });
      await output.start();

      for (let i = 0; i < DURATION * FPS; i++) {
        const timestamp = i / FPS;
        drawFrame(canvas, story, timestamp);
        source.add(timestamp, 1 / FPS);
        if (i % 15 === 0) {
          setStatus(`Encoding ${Math.round((i / (DURATION * FPS)) * 100)}%…`);
          await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
        }
      }

      await output.finalize();
      const buffer = output.target.buffer;
      if (!buffer) throw new Error("Encoder returned an empty file.");

      const url = URL.createObjectURL(new Blob([buffer], { type: "video/mp4" }));
      setDownloadUrl(url);
      setStatus("MP4 ready — rendered locally in your browser.");
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
          <div className="eyebrow">Browser Render Engine</div>
          <h2>Canvas + WebCodecs</h2>
          <p className="muted">
            Preview and export the storyboard without sending every frame to a server.
          </p>
        </div>
        <div className={supported ? "engine-pill ok" : "engine-pill"}>
          {supported ? "● WebCodecs ready" : "● WebCodecs unavailable"}
        </div>
      </div>

      <div className="canvas-wrap">
        <canvas ref={canvasRef} width={W} height={H} />
      </div>

      <div className="render-controls">
        <button className="secondary" onClick={() => setPlaying((v) => !v)}>
          {playing ? "⏸ Pause" : "▶ Play"}
        </button>
        <button className="primary render-button" onClick={exportMp4} disabled={exporting || !supported}>
          {exporting ? "Encoding…" : "🎬 Export MP4"}
        </button>
      </div>

      {status && <p className={status.includes("ready") ? "success" : "muted"}>{status}</p>}
      {downloadUrl && (
        <a className="download" href={downloadUrl} download="cartoon-studio-canvas.mp4">
          ⬇️ Download browser-rendered MP4
        </a>
      )}
    </section>
  );
}
