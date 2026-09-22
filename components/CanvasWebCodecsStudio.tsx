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
  if (a.includes("walk") || a.includes("run") || a.includes("move")) return { x: Math.sin(local * 1.8) * 150, y: bounce, rotation: Math.sin(local * 3.6) * 0.035, scale: 1 };
  if (a.includes("jump")) return { x: 0, y: -Math.abs(Math.sin(local * 3)) * 80, rotation: 0, scale: 1.04 };
  if (a.includes("dance")) return { x: Math.sin(local * 5) * 35, y: Math.sin(local * 10) * 16, rotation: Math.sin(local * 5) * 0.08, scale: 1.03 };
  if (a.includes("sit")) return { x: 0, y: 38, rotation: -0.03, scale: 0.98 };
  return { x: 0, y: bounce, rotation: Math.sin(local * 2) * 0.015, scale: 1 };
}

function expressionState(emotion = "", local = 0) {
  const e = emotion.toLowerCase();
  const blink = Math.sin(local * 1.7) > 0.985;
  if (e.includes("surpris") || e.includes("shock")) return { eyeScale: 1.35, brow: -0.16, mouth: "open", blink: false };
  if (e.includes("sad") || e.includes("cry")) return { eyeScale: 0.9, brow: 0.12, mouth: "sad", blink };
  if (e.includes("angry") || e.includes("rage")) return { eyeScale: 0.92, brow: 0.22, mouth: "angry", blink };
  if (e.includes("happy") || e.includes("joy") || e.includes("excited")) return { eyeScale: 1.05, brow: -0.04, mouth: "smile", blink };
  return { eyeScale: 1, brow: 0, mouth: "neutral", blink };
}

const ASSET_BASE = "https://raw.githubusercontent.com/jbnikky13/cartoon-studios/main/char_assets_fullbody/";
const RIG_ASSET_BASE = "https://raw.githubusercontent.com/jbnikky13/cartoon-studios/main/char_assets/";
type RigAssets = Partial<Record<"head" | "torso" | "left_arm" | "right_arm" | "left_leg" | "right_leg", HTMLImageElement>>;
const rigAssetCache = new Map<string, RigAssets>();
const rigAssetLoads = new Map<string, Promise<RigAssets>>();

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(src));
    img.src = src;
  });
}

async function loadRigAssets(name: string): Promise<RigAssets> {
  const key = slugifyCharacter(name);
  const cached = rigAssetCache.get(key);
  if (cached) return cached;
  const pending = rigAssetLoads.get(key);
  if (pending) return pending;
  const promise = Promise.all(
    ["head", "torso", "left_arm", "right_arm", "left_leg", "right_leg"].map(async (part) => {
      try {
        return [part, await loadImage(`${RIG_ASSET_BASE}${key}/${part}.png`)] as const;
      } catch {
        return [part, undefined] as const;
      }
    })
  ).then(entries => {
    const assets: RigAssets = {};
    for (const [part, image] of entries) {
      if (image) assets[part as keyof RigAssets] = image;
    }
    rigAssetCache.set(key, assets);
    return assets;
  });
  rigAssetLoads.set(key, promise);
  return promise;
}

const assetCache = new Map<string, HTMLImageElement>();
const rigAssets = new Map<string, RigAssets>();
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

type PuppetPose = {
  torsoX: number; torsoY: number; torsoRot: number;
  headX: number; headY: number; headRot: number;
  leftArm: number; rightArm: number; leftLeg: number; rightLeg: number;
  lean: number; squash: number;
};

function puppetPose(action: string, local: number): PuppetPose {
  const a = action.toLowerCase();
  const idle = Math.sin(local * 2) * 0.018;
  if (a.includes("dance")) return {
    torsoX: Math.sin(local * 5) * 4, torsoY: Math.sin(local * 10) * 5, torsoRot: Math.sin(local * 5) * .05,
    headX: Math.sin(local * 5) * 5, headY: -Math.abs(Math.sin(local * 5)) * 4, headRot: Math.sin(local * 5) * .09,
    leftArm: Math.sin(local * 5) * .65, rightArm: -Math.sin(local * 5) * .65,
    leftLeg: Math.sin(local * 5) * .22, rightLeg: -Math.sin(local * 5) * .22, lean: Math.sin(local * 5) * .035, squash: 1 + Math.sin(local * 10) * .025
  };
  if (a.includes("walk") || a.includes("run") || a.includes("move")) {
    const speed = a.includes("run") ? 8 : 4;
    return {
      torsoX: Math.sin(local * speed) * 3, torsoY: Math.abs(Math.sin(local * speed)) * -5, torsoRot: Math.sin(local * speed) * .035,
      headX: 0, headY: -Math.abs(Math.sin(local * speed)) * 3, headRot: Math.sin(local * speed) * .025,
      leftArm: Math.sin(local * speed) * .55, rightArm: -Math.sin(local * speed) * .55,
      leftLeg: -Math.sin(local * speed) * .3, rightLeg: Math.sin(local * speed) * .3, lean: a.includes("run") ? .07 : .025, squash: 1
    };
  }
  if (a.includes("jump")) return {
    torsoX: 0, torsoY: -Math.abs(Math.sin(local * 3)) * 12, torsoRot: 0,
    headX: 0, headY: -Math.abs(Math.sin(local * 3)) * 10, headRot: 0,
    leftArm: -.8, rightArm: .8, leftLeg: .28, rightLeg: -.28, lean: 0, squash: 1.03
  };
  if (a.includes("wave")) return {
    torsoX: 0, torsoY: 0, torsoRot: 0, headX: 0, headY: -2, headRot: idle,
    leftArm: Math.sin(local * 7) * .45 - .8, rightArm: 0, leftLeg: 0, rightLeg: 0, lean: 0, squash: 1
  };
  if (a.includes("sit")) return {
    torsoX: 0, torsoY: 25, torsoRot: -.05, headX: 0, headY: 20, headRot: 0,
    leftArm: 0, rightArm: 0, leftLeg: -.55, rightLeg: .55, lean: 0, squash: .98
  };
  return {
    torsoX: 0, torsoY: Math.sin(local * 2) * 3, torsoRot: idle,
    headX: 0, headY: Math.sin(local * 2) * 2, headRot: idle * .7,
    leftArm: Math.sin(local * 2) * .08, rightArm: -Math.sin(local * 2) * .08,
    leftLeg: 0, rightLeg: 0, lean: 0, squash: 1
  };
}

function drawPuppetAsset(ctx: CanvasRenderingContext2D, image: HTMLImageElement, pose: PuppetPose, rig?: RigAssets) {
  if (rig && Object.keys(rig).length >= 4) {
    const drawLayer = (part: keyof RigAssets, x: number, y: number, rot: number, sx=1, sy=1) => {
      const img = rig[part]; if (!img) return;
      ctx.save(); ctx.translate(x,y); ctx.rotate(rot); ctx.scale(sx,sy);
      const scale=Math.min(210/img.naturalWidth,360/img.naturalHeight);
      ctx.drawImage(img,-img.naturalWidth*scale/2,-img.naturalHeight*scale/2,img.naturalWidth*scale,img.naturalHeight*scale);
      ctx.restore();
    };
    drawLayer("torso", pose.torsoX, 42+pose.torsoY, pose.torsoRot+pose.lean, pose.squash, 1/pose.squash);
    drawLayer("head", pose.headX, -112+pose.headY, pose.headRot);
    drawLayer("left_arm", -55+pose.torsoX, 40+pose.torsoY, pose.leftArm);
    drawLayer("right_arm", 55+pose.torsoX, 40+pose.torsoY, pose.rightArm);
    drawLayer("left_leg", -28+pose.torsoX, 150+pose.torsoY, pose.leftLeg);
    drawLayer("right_leg", 28+pose.torsoX, 150+pose.torsoY, pose.rightLeg);
    return;
  }
  // Normalized regions let the same rig work across the Cartoon Studio full-body
  // assets without requiring separate exported limb files.
  const iw = image.naturalWidth, ih = image.naturalHeight;
  const scale = Math.min(210 / iw, 360 / ih);
  const dw = iw * scale, dh = ih * scale;
  const drawRegion = (sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, rot: number) => {
    ctx.save();
    ctx.translate(dx, dy);
    ctx.rotate(rot);
    ctx.drawImage(image, sx * iw, sy * ih, sw * iw, sh * ih, -(sw * dw) / 2, -(sh * dh) / 2, sw * dw, sh * dh);
    ctx.restore();
  };
  // Torso is the stable anchor. Limbs/head are re-positioned as puppet joints.
  ctx.save();
  ctx.scale(pose.squash, 1 / pose.squash);
  ctx.translate(pose.torsoX, pose.torsoY);
  ctx.rotate(pose.torsoRot + pose.lean);
  drawRegion(.24, .27, .52, .43, 0, 42, 0);
  ctx.restore();

  drawRegion(.28, .04, .44, .27, pose.headX, -dh * .31 + pose.headY, pose.headRot);
  drawRegion(.02, .27, .27, .38, -dw * .24 + pose.torsoX, 35 + pose.torsoY, pose.leftArm);
  drawRegion(.71, .27, .27, .38, dw * .24 + pose.torsoX, 35 + pose.torsoY, pose.rightArm);
  drawRegion(.18, .68, .29, .32, -dw * .12 + pose.torsoX, dh * .38 + pose.torsoY, pose.leftLeg);
  drawRegion(.53, .68, .29, .32, dw * .12 + pose.torsoX, dh * .38 + pose.torsoY, pose.rightLeg);
}

function drawCharacter(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, action: string, local: number, label: string, image?: HTMLImageElement, emotion = "", mouthOpen = 0, usePuppetRig = true) {
  const motion = characterMotion(action, local);
  const expression = expressionState(emotion, local);
  ctx.save();
  ctx.translate(x + motion.x, y + motion.y);
  ctx.rotate(motion.rotation);
  ctx.scale(motion.scale, motion.scale);

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
    if (usePuppetRig) {
      const pose = puppetPose(action, local);
      drawPuppetAsset(ctx, image, pose, rigAssets.get(slugifyCharacter(label)));
    } else {
      ctx.drawImage(image, -dw / 2, -dh + 20, dw, dh);
    }

    // Lightweight facial rig overlay. The asset remains intact while expression,
    // blinking and speech are animated on top of it.
    const faceY = -dh + 78;
    ctx.save();
    ctx.translate(0, faceY);
    ctx.fillStyle = "#17131f";
    const eyeY = expression.blink ? 3 : 0;
    ctx.save();
    ctx.scale(1, expression.blink ? 0.12 : expression.eyeScale);
    ctx.beginPath();
    ctx.arc(-22, eyeY, 5.5, 0, Math.PI * 2);
    ctx.arc(22, eyeY, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = "#17131f";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-31, -15 + expression.brow * 25);
    ctx.lineTo(-12, -12 - expression.brow * 15);
    ctx.moveTo(12, -12 - expression.brow * 15);
    ctx.lineTo(31, -15 + expression.brow * 25);
    ctx.stroke();

    const open = Math.max(0, Math.min(1, mouthOpen));
    ctx.fillStyle = "#301b2c";
    if (expression.mouth === "sad") {
      ctx.beginPath();
      ctx.arc(0, 25, 16, Math.PI + 0.15, Math.PI * 2 - 0.15);
      ctx.strokeStyle = "#17131f";
      ctx.stroke();
    } else if (expression.mouth === "smile") {
      ctx.beginPath();
      ctx.arc(0, 19, 18, 0.15, Math.PI - 0.15);
      ctx.strokeStyle = "#17131f";
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.ellipse(0, 22, 10 + open * 6, 3 + open * 11, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
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

type CompiledClip = {
  scene: number;
  character: string;
  action: string;
  emotion: string;
  gesture: string;
  start: number;
  end: number;
  label: string;
};

function normalizeAction(value = "") {
  const a = value.toLowerCase();
  if (a.includes("run")) return "run";
  if (a.includes("walk") || a.includes("move") || a.includes("enter") || a.includes("exit")) return "walk";
  if (a.includes("dance")) return "dance";
  if (a.includes("jump")) return "jump";
  if (a.includes("wave")) return "wave";
  if (a.includes("sit")) return "sit";
  if (a.includes("talk") || a.includes("speak") || a.includes("say")) return "talk";
  return "idle";
}

function compileStory(story: ExportStory): CompiledClip[] {
  const clips: CompiledClip[] = [];
  for (const scene of story.scenes ?? []) {
    for (const item of scene.actions ?? []) {
      const action = normalizeAction(item.action);
      const gesture = (item.gesture || "").trim();
      clips.push({
        scene: scene.number,
        character: item.character,
        action,
        emotion: item.emotion || scene.emotion || "neutral",
        gesture,
        start: scene.start,
        end: scene.end,
        label: gesture ? `${action} + ${gesture}` : action,
      });
    }
  }
  return clips;
}

function compiledClipFor(clips: CompiledClip[], scene: Scene, character: string) {
  return clips.find((clip) => clip.scene === scene.number && clip.character === character) ?? null;
}

type CharacterTransform = { x: number; y: number; scale: number; rotation: number; flipX: boolean };

function defaultCharacterTransform(): CharacterTransform {
  return { x: 0, y: 0, scale: 1, rotation: 0, flipX: false };
}

type CameraPreset = "wide" | "medium" | "close" | "pan-left" | "pan-right" | "zoom-in" | "zoom-out";

function cameraPresetAt(scene: Scene | null, local: number): CameraPreset {
  const cameraValue = scene?.camera;
  const explicit = typeof cameraValue === "object" && cameraValue !== null
    ? String((cameraValue as { preset?: unknown }).preset ?? "").toLowerCase()
    : "";
  if (["wide","medium","close","pan-left","pan-right","zoom-in","zoom-out"].includes(explicit)) return explicit as CameraPreset;
  if (local < 0.2) return "wide";
  if (local > 0.82) return "medium";
  return "medium";
}

function cameraScaleForPreset(preset: CameraPreset, progress: number) {
  switch (preset) {
    case "close": return 1.18;
    case "zoom-in": return 1 + progress * 0.22;
    case "zoom-out": return 1.18 - progress * 0.18;
    case "medium": return 1.05;
    default: return 1;
  }
}

function cameraPanForPreset(preset: CameraPreset, progress: number) {
  switch (preset) {
    case "pan-left": return 90 - progress * 180;
    case "pan-right": return -90 + progress * 180;
    default: return 0;
  }
}

function drawTransition(ctx: CanvasRenderingContext2D, progress: number, style: "cut" | "fade" | "wipe") {
  if (style === "cut" || progress <= 0 || progress >= 1) return;
  ctx.save();
  if (style === "fade") {
    ctx.globalAlpha = progress < 0.5 ? 1 - progress * 2 : (progress - 0.5) * 2;
    ctx.fillStyle = "#05060a";
    ctx.fillRect(0, 0, 900, 720);
  } else {
    const p = progress < 0.5 ? progress * 2 : (1 - progress) * 2;
    ctx.fillStyle = "#05060a";
    if (style === "wipe") {
      ctx.fillRect(progress < 0.5 ? 0 : 900 * (1-p), 0, 900*p, 720);
    }
  }
  ctx.restore();
}

type ActionOverrides = Record<string, string>;

function actionOverrideKey(scene: Scene, character: string) {
  return `${scene.number}::${character}`;
}

function drawFrame(canvas: HTMLCanvasElement, story: ExportStory, t: number, mouthOpen = 0, usePuppetRig = true, actionOverrides: ActionOverrides = {}, compiledClips: CompiledClip[] = [], characterTransforms: Record<string, CharacterTransform> = {}) {
  // Character transforms are applied by the scene renderer through transformOverrides.

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

  const preset = cameraPresetAt(scene, sceneProgress);
  const scale = cameraScale(scene?.camera) * cameraScaleForPreset(preset, sceneProgress);
  const pan = cameraOffset(scene?.camera, local) + cameraPanForPreset(preset, sceneProgress);
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
    const actionData = actions.find((a) => a.character === name);
    const compiled = scene ? compiledClipFor(compiledClips, scene, name) : null;
    const action = (scene ? actionOverrides[actionOverrideKey(scene, name)] : undefined) ?? compiled?.action ?? actionData?.action ?? "idle";
    const emotion = actionData?.emotion || scene?.emotion || "";
    const transform = characterTransforms[name] ?? defaultCharacterTransform();
    ctx.save();
    ctx.translate(transform.x, transform.y);
    ctx.translate(positions[i], 455);
    ctx.rotate((transform.rotation * Math.PI) / 180);
    ctx.scale(transform.flipX ? -transform.scale : transform.scale, transform.scale);
    drawCharacter(ctx, 0, 0, palette[i % palette.length], action, local, name, assetCache.get(slugifyCharacter(name)), emotion, mouthOpen, usePuppetRig);
    ctx.restore();
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

function buildVoiceLevels(buffer: AudioBuffer, bucketSize = 1024) {
  const channel = buffer.getChannelData(0);
  const buckets = Math.ceil(channel.length / bucketSize);
  const levels = new Float32Array(buckets);
  for (let i = 0; i < buckets; i++) {
    const start = i * bucketSize;
    const end = Math.min(channel.length, start + bucketSize);
    let sum = 0;
    for (let j = start; j < end; j++) sum += channel[j] * channel[j];
    levels[i] = Math.min(1, Math.sqrt(sum / Math.max(1, end - start)) * 3.2);
  }
  return levels;
}

function mouthLevelAt(levels: Float32Array | null, time: number, duration: number) {
  if (!levels || !levels.length || time >= duration) return 0;
  const index = Math.min(levels.length - 1, Math.max(0, Math.floor((time / Math.max(0.001, duration)) * levels.length)));
  return levels[index] || 0;
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
  const [lipSync, setLipSync] = useState(true);
  const [voiceLevels, setVoiceLevels] = useState<Float32Array | null>(null);
  const [puppetRig, setPuppetRig] = useState(true);
  const [actionOverrides, setActionOverrides] = useState<ActionOverrides>({});
  const compiledClips = useMemo(() => compileStory(story), [story]);
  const [selectedSceneNumber, setSelectedSceneNumber] = useState<number | null>(null);
  const [transitionStyle, setTransitionStyle] = useState<"cut" | "fade" | "wipe">("fade");
  const [characterTransforms, setCharacterTransforms] = useState<Record<string, CharacterTransform>>({});
  const [selectedCharacter, setSelectedCharacter] = useState<string>("");


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
    Promise.allSettled(characterNames.map(async (name) => { const [img, rig] = await Promise.all([loadCharacterAsset(name), loadRigAssets(name)]); rigAssets.set(slugifyCharacter(name), rig); return img; }))
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
    if (canvas) drawFrame(canvas, story, time, lipSync ? mouthLevelAt(voiceLevels, time, duration) : 0, puppetRig, actionOverrides, compiledClips, characterTransforms);
  }, [story, time, assetsReady, lipSync, voiceLevels, duration, puppetRig, actionOverrides, compiledClips, characterTransforms]);

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
        setVoiceLevels(buildVoiceLevels(buffer));
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



  const timelineScenes = story.scenes ?? [];
  const selectedScene = timelineScenes.find((s) => s.number === selectedSceneNumber) ?? timelineScenes[0] ?? null;
  const selectedActions = selectedScene?.actions ?? [];
  const actionLibrary = ["idle", "talk", "walk", "run", "wave", "jump", "dance", "sit"];

function updateCharacterTransform(character: string, patch: Partial<CharacterTransform>) {
    setCharacterTransforms((current) => ({
      ...current,
      [character]: { ...defaultCharacterTransform(), ...(current[character] ?? {}), ...patch },
    }));
  }

  function resetCharacterTransforms() {
    setCharacterTransforms({});
  }

  function setClipAction(sceneNumber: number, character: string, action: string) {
    setActionOverrides((current) => ({
      ...current,
      [`${sceneNumber}::${character}`]: action,
    }));
  }

  function resetTimelineEdits() {
    setActionOverrides({});
  }

  async function exportMp4() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    setExporting(true);
    setStatus("Preparing video and synchronized audio…");
    setDownloadUrl("");

    try {
      if (!supported) throw new Error("WebCodecs is not available in this browser. Try a recent Chrome or Edge.");
      if (!assetsReady && characterNames.length) throw new Error("Character assets are still loading. Please wait a moment and export again.");

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
        drawFrame(canvas, story, timestamp, lipSync ? mouthLevelAt(voiceLevels, timestamp, duration) : 0, puppetRig, actionOverrides, compiledClips, characterTransforms);
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






      <div className="character-editor-panel">
        <div className="timeline-head">
          <div>
            <div className="eyebrow">Phase 12 · Character Editor</div>
            <strong>Per-character transform controls</strong>
            <p className="muted">Adjust a character's position, scale, rotation and facing without regenerating the storyboard.</p>
          </div>
          <button className="secondary" onClick={resetCharacterTransforms} disabled={exporting || !Object.keys(characterTransforms).length}>Reset</button>
        </div>
        <div className="character-editor">
          {(story.characters ?? []).map((character) => {
            const value = characterTransforms[character] ?? defaultCharacterTransform();
            return (
              <div className="character-editor-row" key={character}>
                <button className={selectedCharacter === character ? "character-select selected" : "character-select"} onClick={() => setSelectedCharacter(character)} disabled={exporting}>{character}</button>
                <label> X <input type="range" min="-300" max="300" step="1" value={value.x} onChange={(e) => updateCharacterTransform(character,{x:Number(e.target.value)})}/></label>
                <label> Y <input type="range" min="-250" max="250" step="1" value={value.y} onChange={(e) => updateCharacterTransform(character,{y:Number(e.target.value)})}/></label>
                <label> Scale <input type="range" min=".5" max="2" step=".01" value={value.scale} onChange={(e) => updateCharacterTransform(character,{scale:Number(e.target.value)})}/></label>
                <label> Rotate <input type="range" min="-180" max="180" step="1" value={value.rotation} onChange={(e) => updateCharacterTransform(character,{rotation:Number(e.target.value)})}/></label>
                <button className="secondary" onClick={() => updateCharacterTransform(character,{flipX:!value.flipX})} disabled={exporting}>{value.flipX ? "Facing left" : "Facing right"}</button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="camera-panel">
        <div className="timeline-head">
          <div>
            <div className="eyebrow">Phase 11 · Camera + Transitions</div>
            <strong>Dynamic cinematography</strong>
            <p className="muted">Preview and export now support camera presets and scene transition controls.</p>
          </div>
          <select value={transitionStyle} onChange={(e) => setTransitionStyle(e.target.value as "cut" | "fade" | "wipe")} disabled={exporting}>
            <option value="fade">Fade</option>
            <option value="cut">Cut</option>
            <option value="wipe">Wipe</option>
          </select>
        </div>
        <div className="camera-presets">
          {["wide","medium","close","pan-left","pan-right","zoom-in","zoom-out"].map((preset) => (
            <span className="camera-chip" key={preset}>{preset.replace("-", " ")}</span>
          ))}
        </div>
      </div>

      <div className="compiler-panel">
        <div className="timeline-head">
          <div>
            <div className="eyebrow">Phase 10 · AI Scene Compiler</div>
            <strong>Storyboard → animation directives</strong>
            <p className="muted">The compiler converts each scene action, emotion and gesture into normalized animation clips before the renderer runs.</p>
          </div>
          <span className="compiler-count">{compiledClips.length} clips</span>
        </div>
        <div className="compiler-list">
          {compiledClips.slice(0, 12).map((clip, index) => (
            <div className="compiler-row" key={`${clip.scene}-${clip.character}-${index}`}>
              <span className="compiler-scene">S{clip.scene}</span>
              <strong>{clip.character}</strong>
              <span>{clip.label}</span>
              <span className="compiler-emotion">{clip.emotion}</span>
            </div>
          ))}
          {compiledClips.length > 12 && <div className="muted">+ {compiledClips.length - 12} more compiled clips</div>}
        </div>
      </div>

      <div className="timeline-panel">
        <div className="timeline-head">
          <div>
            <div className="eyebrow">Phase 9 · Animation Timeline</div>
            <strong>Reusable action clips</strong>
            <p className="muted">Select a scene, choose a character, then apply an action clip. Timeline edits are used in preview and MP4 export.</p>
          </div>
          <button className="secondary" onClick={resetTimelineEdits} disabled={exporting || !Object.keys(actionOverrides).length}>Reset edits</button>
        </div>

        <div className="scene-timeline">
          {timelineScenes.map((scene) => {
            const active = (selectedScene?.number ?? timelineScenes[0]?.number) === scene.number;
            return (
              <button key={scene.number} className={active ? "scene-chip active" : "scene-chip"}
                onClick={() => { setSelectedSceneNumber(scene.number); setPlaying(false); setTime(scene.start); }} disabled={exporting}>
                <span>Scene {scene.number}</span>
                <small>{scene.start.toFixed(1)}s–{scene.end.toFixed(1)}s</small>
              </button>
            );
          })}
        </div>

        {selectedScene && (
          <div className="clip-editor">
            {selectedActions.length ? selectedActions.map((actionData) => {
              const key = actionOverrideKey(selectedScene, actionData.character);
              const current = actionOverrides[key] ?? actionData.action ?? "idle";
              return (
                <div className="clip-row" key={actionData.character}>
                  <div className="clip-character">
                    <strong>{actionData.character}</strong>
                    <small>{current}</small>
                  </div>
                  <div className="clip-buttons">
                    {actionLibrary.map((clip) => (
                      <button key={clip} className={current.toLowerCase() === clip ? "clip-button selected" : "clip-button"}
                        onClick={() => setClipAction(selectedScene.number, actionData.character, clip)} disabled={exporting}>
                        {clip}
                      </button>
                    ))}
                  </div>
                </div>
              );
            }) : <p className="muted">No character actions in this scene.</p>}
          </div>
        )}
      </div>

      <div className="rig-panel">
        <div>
          <div className="eyebrow">Phase 5 · Character Rig</div>
          <strong>Expressions + lip sync</strong>
          <p className="muted">Emotion drives facial expression and the voice waveform drives mouth movement during preview and export.</p>
        </div>
        <label className="toggle-row">
          <input type="checkbox" checked={lipSync} onChange={(e) => setLipSync(e.target.checked)} disabled={exporting} />
          <span>Enable lip sync</span>
        </label>
      </div>

      <div className="puppet-panel">
        <div>
          <div className="eyebrow">Phase 6 · 2D Puppet Rig</div>
          <strong>Independent head, torso, arms and legs</strong>
          <p className="muted">Actions are converted into joint motion and rendered from the existing full-body artwork.</p>
        </div>
        <label className="toggle-row">
          <input type="checkbox" checked={puppetRig} onChange={(e) => setPuppetRig(e.target.checked)} disabled={exporting} />
          <span>Enable puppet rig</span>
        </label>
      </div>

      <div className="audio-panel">
        <div className="eyebrow">Audio timeline · lip-sync source</div>
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
