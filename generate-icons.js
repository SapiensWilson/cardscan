/**
 * generate-icons.js  (Node.js helper — run once to generate PWA icons)
 *
 * Usage:  node generate-icons.js
 * Requires: npm install canvas
 *
 * Generates icons/icon-192.png and icons/icon-512.png
 * using Node Canvas so you don't need Figma or Photoshop.
 * Delete this file after running if you don't want it in the repo.
 */

const { createCanvas } = require('canvas');
const fs  = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'icons');
if (!fs.existsSync(dir)) fs.mkdirSync(dir);

function drawIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx    = canvas.getContext('2d');
  const r      = size * 0.18; // corner radius

  // Background
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(size - r, 0);
  ctx.quadraticCurveTo(size, 0, size, r);
  ctx.lineTo(size, size - r);
  ctx.quadraticCurveTo(size, size, size - r, size);
  ctx.lineTo(r, size);
  ctx.quadraticCurveTo(0, size, 0, size - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();
  ctx.fillStyle = '#01696f';
  ctx.fill();

  // Card rectangle
  const pad = size * 0.18;
  const cw  = size - pad * 2;
  const ch  = cw * 0.62;
  const cy  = (size - ch) / 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth   = size * 0.045;
  ctx.lineJoin    = 'round';
  const cr = size * 0.06;
  ctx.beginPath();
  ctx.moveTo(pad + cr, cy);
  ctx.lineTo(pad + cw - cr, cy);
  ctx.quadraticCurveTo(pad + cw, cy, pad + cw, cy + cr);
  ctx.lineTo(pad + cw, cy + ch - cr);
  ctx.quadraticCurveTo(pad + cw, cy + ch, pad + cw - cr, cy + ch);
  ctx.lineTo(pad + cr, cy + ch);
  ctx.quadraticCurveTo(pad, cy + ch, pad, cy + ch - cr);
  ctx.lineTo(pad, cy + cr);
  ctx.quadraticCurveTo(pad, cy, pad + cr, cy);
  ctx.closePath();
  ctx.stroke();

  // Lines on card
  const lx = pad + size * 0.12;
  const lw = cw * 0.5;
  ctx.lineWidth   = size * 0.035;
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  [0.35, 0.55, 0.72].forEach(t => {
    ctx.beginPath();
    ctx.moveTo(lx, cy + ch * t);
    ctx.lineTo(lx + lw * (t === 0.35 ? 1 : 0.65), cy + ch * t);
    ctx.stroke();
  });

  return canvas.toBuffer('image/png');
}

[192, 512].forEach(size => {
  const buf  = drawIcon(size);
  const file = path.join(dir, `icon-${size}.png`);
  fs.writeFileSync(file, buf);
  console.log(`✓ Wrote ${file}`);
});
