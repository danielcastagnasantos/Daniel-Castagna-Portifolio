// Gera os ícones PWA (PNG) a partir de um SVG, usando o Chromium do Playwright.
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

const glyph = (pad) => `
  <g transform="translate(${pad} ${pad}) scale(${(512 - pad * 2) / 512})">
    <rect x="96" y="150" width="320" height="212" rx="34" fill="#fff" fill-opacity=".14"/>
    <rect x="96" y="150" width="320" height="212" rx="34" fill="none" stroke="#fff" stroke-width="16"/>
    <circle cx="256" cy="256" r="52" fill="#fff"/>
    <path d="M256 224v64M240 240c0-9 7-14 16-14s16 5 16 13-6 11-16 14-16 6-16 14 7 13 16 13 16-5 16-14" stroke="#4f46e5" stroke-width="10" fill="none" stroke-linecap="round"/>
    <path d="M96 196h56M360 316h56" stroke="#fff" stroke-width="16" stroke-linecap="round"/>
  </g>`;
const svg = (size, radius, pad) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6366f1"/><stop offset="1" stop-color="#4338ca"/></linearGradient></defs>
  <rect width="512" height="512" rx="${radius}" fill="url(#g)"/>${glyph(pad)}</svg>`;

mkdirSync("public/icons", { recursive: true });
const jobs = [
  ["icon-192.png", 192, 112, 0], ["icon-512.png", 512, 112, 0],
  ["maskable-512.png", 512, 0, 70],         // área segura de 80% para máscaras circulares
  ["apple-touch-icon.png", 180, 0, 20],     // iOS aplica o arredondamento
];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage();
for (const [name, size, radius, pad] of jobs) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>*{margin:0}</style>${svg(size, radius, pad)}`);
  await page.screenshot({ path: `public/icons/${name}`, omitBackground: true });
  console.log("ok", name);
}
writeFileSync("public/icons/icon.svg", svg(512, 112, 0));
await browser.close();
