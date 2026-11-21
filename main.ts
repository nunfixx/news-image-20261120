// THE WORLD IN ONE DAY — Friday, 20 November 2026
// Draws a newspaper front page summing up the day's world news as a
// 1024x1024 PNG. Node 22+ stdlib only, no network, fully deterministic.
// Every pixel is drawn by this file: its own PNG encoder and its own
// 5x7 bitmap font. Run: MAKEFUN_OUTPUT_DIR=out node main.ts

import * as fs from "node:fs";
import * as path from "node:path";
import { deflateSync } from "node:zlib";

const W = 1024;
const H = 1024;

// ---- palette: newsprint paper, ink, and two accent colours ----
const PAPER: [number, number, number] = [248, 244, 232];
const INK: [number, number, number] = [20, 20, 18];
const RED: [number, number, number] = [163, 22, 33];
const BLUE: [number, number, number] = [30, 64, 175];
const GREY: [number, number, number] = [107, 107, 96];
const LIGHT: [number, number, number] = [232, 226, 208];
const ORANGE: [number, number, number] = [217, 119, 6];
const SKY: [number, number, number] = [186, 214, 235];
const SEA: [number, number, number] = [96, 140, 175];
const GOLD: [number, number, number] = [212, 175, 55];

type RGB = [number, number, number];

// ---- pixel buffer ----
const img = new Uint8Array(W * H * 3);
for (let i = 0; i < W * H; i++) {
  img[i * 3] = PAPER[0];
  img[i * 3 + 1] = PAPER[1];
  img[i * 3 + 2] = PAPER[2];
}

function px(x: number, y: number, c: RGB): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const o = (y * W + x) * 3;
  img[o] = c[0];
  img[o + 1] = c[1];
  img[o + 2] = c[2];
}

function fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
  for (let j = y; j < y + h; j++) {
    for (let i = x; i < x + w; i++) px(i, j, c);
  }
}

function hline(x: number, y: number, w: number, c: RGB): void {
  for (let i = x; i < x + w; i++) px(i, y, c);
}

function vline(x: number, y: number, h: number, c: RGB): void {
  for (let j = y; j < y + h; j++) px(x, j, c);
}

function border(x: number, y: number, w: number, h: number, c: RGB): void {
  hline(x, y, w, c);
  hline(x, y + h - 1, w, c);
  vline(x, y, h, c);
  vline(x + w - 1, y, h, c);
}

// Bresenham line, for diagonals (bridge cables, chart arrows, sun rays).
function line(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    px(x, y, c);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

function disc(cx: number, cy: number, r: number, c: RGB): void {
  for (let j = cy - r; j <= cy + r; j++) {
    for (let i = cx - r; i <= cx + r; i++) {
      const dx = i - cx;
      const dy = j - cy;
      if (dx * dx + dy * dy <= r * r) px(i, j, c);
    }
  }
}

function ring(cx: number, cy: number, r: number, c: RGB): void {
  for (let a = 0; a < 360; a += 2) {
    const t = (a * Math.PI) / 180;
    px(Math.round(cx + r * Math.cos(t)), Math.round(cy + r * Math.sin(t)), c);
  }
}

// ---- PNG encoder (CRC32 + zlib, stdlib only) ----
const CRC_TABLE: Uint32Array = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}

function encodePng(): Buffer {
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0; // filter: none
    raw.set(img.subarray(y * W * 3, (y + 1) * W * 3), y * (1 + W * 3) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---- 5x7 bitmap font: each glyph is 7 rows of 5 bits (bit 4 = leftmost) ----
const FONT: Record<string, number[]> = {
  A: [0x0e, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  B: [0x1e, 0x11, 0x11, 0x1e, 0x11, 0x11, 0x1e],
  C: [0x0e, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0e],
  D: [0x1e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1e],
  E: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x1f],
  F: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x10],
  G: [0x0e, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0f],
  H: [0x11, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  I: [0x0e, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e],
  J: [0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0c],
  K: [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],
  L: [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1f],
  M: [0x11, 0x1b, 0x15, 0x15, 0x11, 0x11, 0x11],
  N: [0x11, 0x19, 0x15, 0x13, 0x11, 0x11, 0x11],
  O: [0x0e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  P: [0x1e, 0x11, 0x11, 0x1e, 0x10, 0x10, 0x10],
  Q: [0x0e, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0d],
  R: [0x1e, 0x11, 0x11, 0x1e, 0x14, 0x12, 0x11],
  S: [0x0f, 0x10, 0x10, 0x0e, 0x01, 0x01, 0x1e],
  T: [0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
  U: [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  V: [0x11, 0x11, 0x11, 0x11, 0x11, 0x0a, 0x04],
  W: [0x11, 0x11, 0x11, 0x15, 0x15, 0x1b, 0x11],
  X: [0x11, 0x11, 0x0a, 0x04, 0x0a, 0x11, 0x11],
  Y: [0x11, 0x11, 0x0a, 0x04, 0x04, 0x04, 0x04],
  Z: [0x1f, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1f],
  "0": [0x0e, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0e],
  "1": [0x04, 0x0c, 0x04, 0x04, 0x04, 0x04, 0x0e],
  "2": [0x0e, 0x11, 0x01, 0x06, 0x08, 0x10, 0x1f],
  "3": [0x1f, 0x02, 0x04, 0x02, 0x01, 0x11, 0x0e],
  "4": [0x02, 0x06, 0x0a, 0x12, 0x1f, 0x02, 0x02],
  "5": [0x1f, 0x10, 0x1e, 0x01, 0x01, 0x11, 0x0e],
  "6": [0x06, 0x08, 0x10, 0x1e, 0x11, 0x11, 0x0e],
  "7": [0x1f, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
  "8": [0x0e, 0x11, 0x11, 0x0e, 0x11, 0x11, 0x0e],
  "9": [0x0e, 0x11, 0x11, 0x0f, 0x01, 0x02, 0x0c],
  " ": [0, 0, 0, 0, 0, 0, 0],
  ".": [0, 0, 0, 0, 0, 0x0c, 0x0c],
  ",": [0, 0, 0, 0, 0x0c, 0x04, 0x08],
  ":": [0, 0x0c, 0x0c, 0, 0x0c, 0x0c, 0],
  ";": [0, 0x0c, 0x0c, 0, 0x0c, 0x04, 0x08],
  "!": [0x04, 0x04, 0x04, 0x04, 0x04, 0, 0x04],
  "?": [0x0e, 0x11, 0x01, 0x02, 0x04, 0, 0x04],
  "'": [0x04, 0x04, 0x08, 0, 0, 0, 0],
  '"': [0x0a, 0x0a, 0x0a, 0, 0, 0, 0],
  "-": [0, 0, 0, 0x0e, 0, 0, 0],
  "(": [0x02, 0x04, 0x08, 0x08, 0x08, 0x04, 0x02],
  ")": [0x08, 0x04, 0x02, 0x02, 0x02, 0x04, 0x08],
  "/": [0x01, 0x01, 0x02, 0x04, 0x08, 0x10, 0x10],
  "%": [0x19, 0x19, 0x02, 0x04, 0x08, 0x13, 0x13],
  $: [0x04, 0x0f, 0x14, 0x0e, 0x05, 0x1e, 0x04],
  "+": [0, 0x04, 0x04, 0x1f, 0x04, 0x04, 0],
  "=": [0, 0, 0x1f, 0, 0x1f, 0, 0],
  "&": [0x0c, 0x12, 0x14, 0x08, 0x15, 0x12, 0x0d],
  "#": [0x0a, 0x0a, 0x1f, 0x0a, 0x1f, 0x0a, 0x0a],
  "*": [0, 0x04, 0x15, 0x0e, 0x15, 0x04, 0],
  "<": [0x02, 0x04, 0x08, 0x10, 0x08, 0x04, 0x02],
  ">": [0x08, 0x04, 0x02, 0x01, 0x02, 0x04, 0x08],
  _: [0, 0, 0, 0, 0, 0, 0x1f],
  "@": [0x0e, 0x11, 0x17, 0x15, 0x16, 0x10, 0x0e],
};

const BLANK = [0, 0, 0, 0, 0, 0, 0];

// All copy is set in capitals: the font covers A-Z, digits and punctuation.
function drawText(s: string, x: number, y: number, scale: number, c: RGB): void {
  const up = s.toUpperCase();
  let cx = x;
  for (const ch of up) {
    const g = FONT[ch] ?? BLANK;
    for (let r = 0; r < 7; r++) {
      for (let col = 0; col < 5; col++) {
        if (g[r] & (1 << (4 - col))) {
          fillRect(cx + col * scale, y + r * scale, scale, scale, c);
        }
      }
    }
    cx += 6 * scale;
  }
}

function textW(s: string, scale: number): number {
  return s.length * 6 * scale - scale;
}

function drawCentered(s: string, cx: number, y: number, scale: number, c: RGB): void {
  drawText(s, cx - Math.floor(textW(s, scale) / 2), y, scale, c);
}

// Greedy word wrap to a pixel width; returns the lines.
function wrap(s: string, maxW: number, scale: number): string[] {
  const words = s.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const trial = cur ? cur + " " + w : w;
    if (textW(trial, scale) <= maxW || !cur) {
      cur = trial;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

// Draw wrapped text inside a box; returns the y just below the last line.
function drawPara(s: string, x: number, y: number, maxW: number, scale: number, c: RGB): number {
  const lines = wrap(s, maxW, scale);
  const lh = 9 * scale;
  for (let i = 0; i < lines.length; i++) {
    drawText(lines[i], x, y + i * lh, scale, c);
  }
  return y + lines.length * lh;
}

// ---- panel furniture ----
function panel(x: number, y: number, w: number, h: number): void {
  border(x, y, w, h, INK);
  hline(x + 1, y + 1, w - 2, LIGHT);
}

function kicker(x: number, y: number, s: string): void {
  drawText(s, x, y, 2, RED);
}

function headline(x: number, y: number, maxW: number, s: string, scale: number): number {
  return drawPara(s, x, y, maxW, scale, INK);
}

// A small explosion burst: radiating spikes around a hot core.
function burst(cx: number, cy: number, r: number): void {
  disc(cx, cy, Math.floor(r / 2), ORANGE);
  disc(cx, cy, Math.floor(r / 4), RED);
  for (let a = 0; a < 12; a++) {
    const t = (a * Math.PI) / 6;
    line(cx, cy, Math.round(cx + r * Math.cos(t)), Math.round(cy + r * Math.sin(t)), RED);
  }
}

// ---- artwork: a river bridge under attack ----
function drawBridge(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, SKY);
  // river
  fillRect(x, y + h - 22, w, 22, SEA);
  for (let i = 0; i < 5; i++) hline(x + 8 + i * 34, y + h - 14 + (i % 2) * 5, 18, PAPER);
  // deck
  fillRect(x + 6, y + h - 46, w - 12, 6, INK);
  // three arches under the deck
  const span = (w - 12) / 3;
  for (let a = 0; a < 3; a++) {
    const ax = x + 6 + a * span;
    for (let t = 0; t <= 20; t++) {
      const fx = ax + (t / 20) * span;
      const fy = y + h - 40 - Math.sin((t / 20) * Math.PI) * 22;
      fillRect(Math.round(fx), Math.round(fy), 3, 3, INK);
    }
    vline(Math.round(ax + 2), y + h - 46, 24, INK);
  }
  vline(Math.round(x + w - 10), y + h - 46, 24, INK);
  // two towers above the deck
  fillRect(x + 30, y + 18, 8, h - 58, INK);
  fillRect(x + w - 44, y + 26, 8, h - 66, INK);
  // blast over the middle span
  burst(x + Math.floor(w / 2), y + 34, 20);
  burst(x + Math.floor(w / 2) + 52, y + 52, 12);
  // falling debris dots
  disc(x + 60, y + h - 58, 2, INK);
  disc(x + w - 70, y + h - 60, 2, INK);
}

// ---- artwork: an oil tanker at sea ----
function drawTanker(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, SKY);
  fillRect(x, y + h - 26, w, 26, SEA);
  for (let i = 0; i < 6; i++) hline(x + 6 + i * 30, y + h - 16 + (i % 2) * 6, 16, PAPER);
  // hull
  line(x + 10, y + h - 44, x + w - 16, y + h - 44, RED);
  line(x + 10, y + h - 44, x + 22, y + h - 28, RED);
  line(x + w - 16, y + h - 44, x + w - 30, y + h - 28, RED);
  line(x + 22, y + h - 28, x + w - 30, y + h - 28, RED);
  fillRect(x + 24, y + h - 42, w - 56, 14, RED);
  // deck containers
  fillRect(x + 30, y + h - 62, 26, 16, INK);
  fillRect(x + 60, y + h - 62, 26, 16, BLUE);
  fillRect(x + 90, y + h - 62, 26, 16, GOLD);
  // funnel with smoke
  fillRect(x + w - 52, y + h - 70, 14, 26, INK);
  disc(x + w - 45, y + h - 78, 5, GREY);
  disc(x + w - 38, y + h - 86, 4, GREY);
  // a second tanker far behind
  fillRect(x + w - 150, y + h - 52, 34, 6, GREY);
  fillRect(x + w - 146, y + h - 60, 10, 8, GREY);
}

// ---- artwork: a falling market chart ----
function drawChart(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, PAPER);
  border(x, y, w, h, GREY);
  const base = y + h - 16;
  hline(x + 8, base, w - 16, INK);
  vline(x + 8, y + 8, h - 24, INK);
  const bars = [62, 55, 48, 40, 30, 22, 12];
  const bw = Math.floor((w - 28) / bars.length);
  for (let i = 0; i < bars.length; i++) {
    const bh = Math.floor(((h - 30) * bars[i]) / 70);
    fillRect(x + 12 + i * bw, base - bh, bw - 4, bh, i < 4 ? BLUE : RED);
  }
  line(x + 12, y + 12, x + w - 14, base - 4, RED);
  line(x + w - 14, base - 4, x + w - 24, base - 4, RED);
  line(x + w - 14, base - 4, x + w - 16, base - 12, RED);
}

// ---- artwork: two flags side by side (UK and EU) ----
function drawFlags(x: number, y: number, w: number, h: number): void {
  const fw = Math.floor((w - 16) / 2);
  const fh = h - 8;
  // Union Jack, simplified: blue field, white saltire and cross, red cross
  fillRect(x, y, fw, fh, BLUE);
  line(x, y, x + fw, y + fh, PAPER);
  line(x + fw, y, x, y + fh, PAPER);
  line(x, y, x + fw, y + fh, RED);
  line(x + fw, y, x, y + fh, RED);
  fillRect(x + Math.floor(fw / 2) - 4, y, 8, fh, PAPER);
  fillRect(x, y + Math.floor(fh / 2) - 4, fw, 8, PAPER);
  fillRect(x + Math.floor(fw / 2) - 2, y, 4, fh, RED);
  fillRect(x, y + Math.floor(fh / 2) - 2, fw, 4, RED);
  border(x, y, fw, fh, INK);
  // EU flag: blue field, ring of gold stars
  const ex = x + fw + 16;
  fillRect(ex, y, fw, fh, BLUE);
  const cx = ex + Math.floor(fw / 2);
  const cy = y + Math.floor(fh / 2);
  const r = Math.floor(Math.min(fw, fh) / 2) - 7;
  for (let a = 0; a < 12; a++) {
    const t = (a * Math.PI) / 6 - Math.PI / 2;
    disc(Math.round(cx + r * Math.cos(t)), Math.round(cy + r * Math.sin(t)), 2, GOLD);
  }
  border(ex, y, fw, fh, INK);
}

// ---- artwork: a city skyline at dusk with a star ----
function drawSkyline(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, INK);
  disc(x + w - 30, y + 22, 14, GOLD);
  const heights = [0.55, 0.8, 0.45, 0.95, 0.6, 0.75, 0.5];
  const bw = Math.floor(w / heights.length);
  for (let i = 0; i < heights.length; i++) {
    const bh = Math.floor(h * heights[i]);
    fillRect(x + i * bw + 2, y + h - bh, bw - 4, bh, [52, 52, 48]);
    // lit windows
    for (let wy = y + h - bh + 8; wy < y + h - 10; wy += 12) {
      for (let wx = x + i * bw + 6; wx < x + (i + 1) * bw - 6; wx += 10) {
        if ((wx + wy) % 24 < 12) fillRect(wx, wy, 3, 4, GOLD);
      }
    }
  }
  // big star over the skyline
  const sx = x + 34;
  const sy = y + 26;
  line(sx - 10, sy, sx + 10, sy, GOLD);
  line(sx, sy - 10, sx, sy + 10, GOLD);
  line(sx - 7, sy - 7, sx + 7, sy + 7, GOLD);
  line(sx + 7, sy - 7, sx - 7, sy + 7, GOLD);
}

// ---- artwork: a marching crowd with placards ----
function drawCrowd(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, LIGHT);
  const n = 9;
  const step = Math.floor(w / n);
  for (let i = 0; i < n; i++) {
    const cx = x + 10 + i * step;
    const cy = y + h - 34 - (i % 3) * 8;
    disc(cx, cy, 8, INK);
    fillRect(cx - 9, cy + 9, 18, h - (cy + 9 - y), i % 2 ? BLUE : RED);
  }
  // placards held high
  fillRect(x + 26, y + 10, 64, 22, PAPER);
  border(x + 26, y + 10, 64, 22, INK);
  drawText("FUTURE", x + 30, y + 14, 1, INK);
  fillRect(x + w - 96, y + 18, 64, 22, PAPER);
  border(x + w - 96, y + 18, 64, 22, INK);
  drawText("NOW", x + w - 82, y + 22, 1, RED);
  vline(x + 56, y + 32, 26, INK);
  vline(x + w - 64, y + 40, 20, INK);
}

// ---- artwork: a ballot paper, a ballot box, and a barred ring ----
function drawBallot(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, LIGHT);
  // ballot paper with a cross
  fillRect(x + 16, y + 8, 48, 30, PAPER);
  border(x + 16, y + 8, 48, 30, INK);
  line(x + 28, y + 16, x + 52, y + 30, RED);
  line(x + 52, y + 16, x + 28, y + 30, RED);
  // ballot box
  fillRect(x + 84, y + 40, 76, h - 46, BLUE);
  border(x + 84, y + 40, 76, h - 46, INK);
  fillRect(x + 108, y + 36, 28, 5, INK);
  drawText("2028", x + 104, y + 46, 1, PAPER);
  // barred ring: the race is closed to him
  const cx = x + w - 52;
  const cy = y + 30;
  ring(cx, cy, 20, RED);
  ring(cx, cy, 19, RED);
  line(cx - 15, cy + 15, cx + 15, cy - 15, RED);
  line(cx - 14, cy + 16, cx + 16, cy - 14, RED);
}

// ---- page composition ----
function compose(): void {
  // masthead
  drawCentered("THE WORLD IN ONE DAY", W / 2, 20, 6, INK);
  drawCentered("FRIDAY, 20 NOVEMBER 2026", W / 2, 68, 3, RED);
  drawCentered("SEVEN STORIES FROM AROUND THE WORLD", W / 2, 94, 2, GREY);
  hline(24, 114, W - 48, INK);
  hline(24, 118, W - 48, INK);

  // ---- LEAD: Kyiv ----
  panel(24, 128, 560, 302);
  kicker(40, 140, "UKRAINE - LEAD STORY");
  drawPara("MISSILES RAIN ON KYIV BRIDGES", 40, 164, 528, 4, INK);
  drawText("7 DEAD, 17 HURT", 40, 240, 3, RED);
  drawPara(
    "84 CRUISE MISSILES, 27 BALLISTIC MISSILES AND 404 DRONES STRUCK " +
      "OVERNIGHT. PODILSKYI, DARNYTSKYI AND PIVDENNYI BRIDGES HIT. " +
      "POWER, WATER AND HEAT CUT ACROSS THE CAPITAL.",
    40, 268, 528, 2, INK,
  );
  drawBridge(40, 344, 528, 74);

  // ---- MARKETS ----
  panel(596, 128, 404, 302);
  kicker(612, 140, "MARKETS");
  drawPara("WALL STREET PLUNGES ON AI FEARS", 612, 164, 372, 3, INK);
  drawText("NASDAQ -5.28%", 612, 222, 4, RED);
  drawPara(
    "S&P 500 -3.70% TO 6,910.39. DOW -949.73 TO 48,147.33. " +
      "NVIDIA -14% AS THE SEC PROBES ITS ACCOUNTING. ANTHROPIC -9.1% TO $88.30.",
    612, 258, 372, 2, INK,
  );
  drawChart(612, 352, 372, 66);

  // ---- IRAN / KHARG ----
  panel(24, 442, 480, 250);
  kicker(40, 454, "IRAN - KHARG ISLAND");
  drawPara("TANKER CONVOY READIES TO DEFY US BLOCKADE", 40, 478, 448, 3, INK);
  drawPara(
    "14+ TANKERS WAIT AT KHARG ISLAND TO DEFY THE BLOCKADE. " +
      "FIRST SHIP-TO-SHIP TRANSFER: 200,000 BARRELS ON 17 NOV. " +
      "TRUMP: DECISION AFTER NEW YEAR.",
    40, 536, 448, 2, INK,
  );
  drawTanker(40, 612, 448, 66);

  // ---- UK-EU RESET ----
  panel(516, 442, 484, 250);
  kicker(532, 454, "BRITAIN AND EUROPE");
  drawPara("UK AND EU SEAL RESET DEAL", 532, 478, 452, 3, INK);
  drawPara(
    "YOUTH MOBILITY: 100,000 A YEAR EACH WAY, AGES 18-31, UP TO 3 YEARS. " +
      "FOOD CHECKS END AND CARBON MARKETS LINK FROM 2028. " +
      "VON DER LEYEN: 'A TURNING POINT'.",
    532, 506, 452, 2, INK,
  );
  drawFlags(532, 604, 452, 76);

  // ---- GTA VI ----
  panel(24, 704, 312, 272);
  kicker(36, 716, "ENTERTAINMENT");
  drawPara("GTA VI SMASHES RECORDS", 36, 738, 288, 3, INK);
  drawText("$3.79 BILLION", 36, 796, 3, RED);
  drawPara(
    "FIRST-DAY RETAIL SALES, OFFICIAL TAKE-TWO FIGURE. " +
      "32.5 MILLION UNITS PRE-SOLD.",
    36, 824, 288, 2, INK,
  );
  drawSkyline(36, 886, 288, 78);

  // ---- YOUTH STRIKES ----
  panel(348, 704, 312, 272);
  kicker(360, 716, "EUROPE");
  drawPara("YOUTH STRIKE SWEEPS EUROPE", 360, 738, 288, 3, INK);
  drawPara(
    "TENS OF THOUSANDS MARCH IN 25+ COUNTRIES. 350+ SCHOOLS OUT IN " +
      "BRITAIN. BASEL POLICE USE WATER CANNON.",
    360, 798, 288, 2, INK,
  );
  drawCrowd(360, 894, 288, 70);

  // ---- IMAMOGLU ----
  panel(672, 704, 328, 272);
  kicker(684, 716, "TURKEY");
  drawPara("IMAMOGLU BARRED FROM 2028 RACE", 684, 738, 304, 3, INK);
  drawPara(
    "RULING REPORTED; OPPOSITION LEADER VOWS APPEAL. " +
      "OZEL CALLS IT 'COWARDICE'. NOT YET IN COURT RECORDS.",
    684, 798, 304, 2, INK,
  );
  drawBallot(684, 894, 304, 70);
  // footer
  drawCentered("ALL STORIES AS REPORTED ON FRIDAY, 20 NOVEMBER 2026", W / 2, 986, 1, GREY);
}

function main(): void {
  compose();
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "out";
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "entry.png");
  fs.writeFileSync(outPath, encodePng());
  // eslint-disable-next-line no-console
  console.log("wrote " + outPath);
}

main();
