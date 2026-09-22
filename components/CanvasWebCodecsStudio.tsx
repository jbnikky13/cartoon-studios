"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
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
  return (
    scenes.find((s) => t >= s.start && t < s.end) ??
    scenes[scenes.length - 1] ??
    null
  );
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
  if (a.includes("walk") || a.includes("run") || a.includes("move")) {
    return { x: Math.sin(local * 1.8) * 150, y: bounce };
  }
  if (a.includes("jump")) {
    return { x: 0, y: -Math.abs(Math.sin(local * 3)) * 80 };
  }
  if (a.includes("dance")) {
    return { x: Math.sin(local * 5) * 35, y: Math.sin(local * 10) * 16 };
  }
  if (a.includes("sit")) return { x: 0, y: 38 };
  return { x: 0, y: bounce };
}

function drawCharacter(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  action: string,
  local: number,
  label: string,
) {
  const motion = characterMotion(action, local);
  const bob = motion.y;

  ctx.save();
  ctx.translate(x + motion.x, y + bob);

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,.28)";
  ctx.beginPath();
  ctx.ellipse(0, 155 - bob, 82, 18, 0, 0, Math.PI * 2);
  ctx.fill();

  // Body
  ctx.fillStyle = color;
  ctx.fillRect(-62, -48, 124, 145);

  // Head
  ctx.beginPath();
  ctx.arc(0, -112, 62, 0, Math.PI * 2);
  ctx.fill();

  // Eyes
  ctx.fillStyle = "#17131f";
  ctx.beginPath();
  ctx.arc(-22, -118, 8, 0, Math.PI * 2);
  ctx.arc(22, -118, 8, 0, Math.PI * 2);
  ctx.fill();

  // Smile / expression
  ctx.strokeStyle = "#f7f7ff";
  ctx.lineWidth = 7;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(0, -103, 27, 0.15, Math.PI - 0.15);
  ctx.stroke();

  // Arms react to movement.
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

  ctx.fillStyle = "#ffffff";
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
  const sceneProgress = scene
    ? Math.min(1, Math.max(0, local / sceneLength))
    : 0;

  const gradient = ctx.createLinearGradient(0, 0, W, H);
  gradient.addColorStop(0, "#17132f");
  gradient.addColorStop(0.55, "#32265c");
  gradient.addColorStop(1, "#0b0d15");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, W, H);

  // Animated atmosphere.
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

  // Scene transition + camera system.
  const scale = cameraScale(scene?.camera);
  const pan = cameraOffset(scene?.camera, local);
  ctx.save();
  ctx.translate(W / 2 + pan, H / 2);
  ctx.scale(scale, scale);
  ctx.translate(-W / 2, -H / 2);

  const actions = scene?.actions ?? [];
  const names = Array.from(
    new Set([
      ...actions.map((a) => a.character),
      ...(story.characters ?? []).map((c) => c.role),
    ]),
  ).filter(Boolean);

  const cast = names.length ? names : ["Character"];
  const positions = cast.slice(0, 5).map((_, i, arr) => {
    const spread = Math.min(190, 680 / Math.max(1, arr.length));
    return W / 2 + (i - (arr.length - 1) / 2) * spread;
  });

  cast.slice(0, 5).forEach((name, i) => {
    const action =
      actions.find((a) => a.character === name)?.action ?? "idle";
    drawCharacter(
      ctx,
      positions[i],
      455,
      palette[i % palette.length],
      action,
      local,
      name,
    );
  });

  ctx.restore();

  // Scene card.
  const fadeIn = Math.min(1, sceneProgress * 5);
  const fadeOut = Math.min(1, (1 - sceneProgress) * 5);
  ctx.globalAlpha = Math.min(fadeIn, fadeOut);
  ctx.fillStyle = "rgba(8,9,16,.78)";
  ctx.roundRect(42, 34, 780, 175, 18);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.font = "800 20px Inter, system-ui, sans-serif";
  ctx.fillText("CARTOON STUDIO · PHASE 2 RENDER ENGINE", 64, 70);

  if (scene) {
    ctx.font = "800 40px Inter, system-ui, sans-serif";
    ctx.fillText(`SCENE ${scene.number} · ${scene.title}`, 64, 118);

    ctx.fillStyle = "#c9c2df";
    ctx.font = "22px Inter, system-ui, sans-serif";
    const summary =
      scene.summary.length > 84
        ? scene.summary.slice(0, 81) + "…"
        : scene.summary;
    ctx.fillText(summary, 64, 151);

    ctx.fillStyle = "#9b7cff";
    ctx.font = "700 17px Inter, system-ui, sans-serif";
    ctx.fillText(
      `${scene.emotion} · ${scene.setting} · ${scene.camera}`,
      64,
      180,
    );
  }

  ctx.globalAlpha = 1;

  // Timeline.
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

export default function CanvasWebCodecsStudio({ story }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [playing, setPlaying] = useState(true);
  const [time, setTime] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [status, setStatus] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");

  const duration = useMemo(() => durationOf(story), [story]);
  const supported =
    typeof window !== "undefined" &&
    "VideoEncoder" in window &&
    "VideoFrame" in window;

  useEffect(() => {
    setTime(0);
  }, [story]);

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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) drawFrame(canvas, story, time);
  }, [story, time]);

  useEffect(
    () => () => {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    },
    [downloadUrl],
  );

  async function exportMp4() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    setExporting(true);
    setStatus("Preparing browser-native encoder…");
    setDownloadUrl("");

    try {
      if (!supported) {
        throw new Error(
          "WebCodecs is not available in this browser. Try a recent Chrome or Edge.",
        );
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

      const frames = Math.ceil(duration * FPS);

      for (let i = 0; i < frames; i++) {
        const timestamp = i / FPS;
        drawFrame(canvas, story, timestamp);
        source.add(timestamp, 1 / FPS);

        if (i % 15 === 0) {
          setStatus(`Encoding ${Math.round((i / frames) * 100)}%…`);
          await new Promise((resolve) => requestAnimationFrame(resolve));
        }
      }

      await output.finalize();

      const buffer = output.target.buffer;
      if (!buffer) throw new Error("Encoder returned an empty file.");

      const url = URL.createObjectURL(
        new Blob([buffer], { type: "video/mp4" }),
      );
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
          <div className="eyebrow">Phase 2 · Browser Animation Engine</div>
          <h2>Canvas + WebCodecs</h2>
          <p className="muted">
            Timeline-driven scenes, multiple characters, actions and camera
            motion render locally before export.
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
        <button
          className="secondary"
          onClick={() => setPlaying((v) => !v)}
          disabled={exporting}
        >
          {playing ? "⏸ Pause" : "▶ Play"}
        </button>
        <input
          aria-label="Timeline"
          type="range"
          min={0}
          max={duration}
          step={1 / FPS}
          value={Math.min(time, duration)}
          onChange={(e) => {
            setPlaying(false);
            setTime(Number(e.target.value));
          }}
          disabled={exporting}
          style={{ flex: 1 }}
        />
        <button
          className="primary render-button"
          onClick={exportMp4}
          disabled={exporting || !supported}
        >
          {exporting ? "Encoding…" : "🎬 Export MP4"}
        </button>
      </div>

      {status && (
        <p className={status.includes("ready") ? "success" : "muted"}>
          {status}
        </p>
      )}
      {downloadUrl && (
        <a
          className="download"
          href={downloadUrl}
          download="cartoon-studio-phase-2.mp4"
        >
          ⬇️ Download Phase 2 MP4
        </a>
      )}
    </section>
  );
}
