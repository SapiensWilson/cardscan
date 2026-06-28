/**
 * CardScan — app.js
 * Handles: SW registration, theme toggle, file/camera input, OCR pre-processing,
 * OCR via Tesseract.js, smart contact field parsing, vCard generation, export,
 * and PWA install prompt.
 */

'use strict';

// ── Service Worker Registration ────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('[SW] Registered, scope:', reg.scope))
      .catch(err => console.warn('[SW] Registration failed:', err));
  });
}


// ── PWA Install Prompt ─────────────────────────────────────────────────────────
let deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  const btnInstall = document.getElementById('btnInstall');
  const banner     = document.getElementById('installBanner');
  if (btnInstall) btnInstall.style.display = '';
  if (banner)     banner.style.display = '';
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  const btnInstall = document.getElementById('btnInstall');
  const banner     = document.getElementById('installBanner');
  if (btnInstall) btnInstall.style.display = 'none';
  if (banner)     banner.style.display = 'none';
  showToast('CardScan installed! ✓');
});

async function triggerInstall() {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  const { outcome } = await deferredInstallPrompt.userChoice;
  console.log('[PWA] Install outcome:', outcome);
  deferredInstallPrompt = null;
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btnInstall')?.addEventListener('click', triggerInstall);
  document.getElementById('btnInstallBanner')?.addEventListener('click', triggerInstall);
  document.getElementById('btnDismissBanner')?.addEventListener('click', () => {
    document.getElementById('installBanner').style.display = 'none';
  });
});


// ── Theme Toggle ───────────────────────────────────────────────────────────────
(function initTheme() {
  const btn  = document.querySelector('[data-theme-toggle]');
  const root = document.documentElement;
  let theme  = matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light';
  root.setAttribute('data-theme', theme);

  function updateIcon() {
    if (!btn) return;
    btn.innerHTML = theme === 'dark'
      ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>`
      : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
    btn.setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`);
  }

  if (btn) btn.addEventListener('click', () => {
    theme = theme === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', theme);
    updateIcon();
  });
  updateIcon();
})();


// ── State ──────────────────────────────────────────────────────────────────────
let currentImageData = null;
let cameraStream     = null;
let facingMode       = 'environment';


// ── Helpers ────────────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

function showPanel(id) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  $(id).classList.add('active');
}

function setStep(n) {
  [1, 2, 3].forEach(i => {
    const el = $('s' + i);
    el.classList.remove('active', 'done');
    if (i < n)        el.classList.add('done');
    else if (i === n) el.classList.add('active');
  });
}

function showToast(msg) {
  const t = $('toast');
  $('toastMsg').textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3200);
}


// ── File Upload & Drag-Drop ────────────────────────────────────────────────────
const dropZone = $('dropZone');
const fileInput = $('fileInput');

$('btnUpload').addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });
dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') fileInput.click();
});
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) processFile(file);
});
fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) processFile(fileInput.files[0]);
  fileInput.value = '';
});

if (new URLSearchParams(location.search).get('action') === 'camera') {
  window.addEventListener('DOMContentLoaded', () => startCamera());
}


// ── Camera ─────────────────────────────────────────────────────────────────────
$('btnCamera').addEventListener('click', startCamera);
$('btnStopCamera').addEventListener('click', stopCamera);
$('btnCapture').addEventListener('click', captureFrame);
$('btnFlip').addEventListener('click', () => {
  facingMode = facingMode === 'environment' ? 'user' : 'environment';
  stopCamera();
  startCamera();
});

async function startCamera() {
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode, width: { ideal: 1920 } }
    });
    $('videoEl').srcObject = cameraStream;
    $('cameraPanel').style.display = 'block';
    dropZone.style.display = 'none';
  } catch (err) {
    console.error('Camera error:', err);
    alert('Camera access denied or unavailable. Please upload an image instead.');
  }
}

function stopCamera() {
  if (cameraStream) { cameraStream.getTracks().forEach(t => t.stop()); cameraStream = null; }
  $('cameraPanel').style.display = 'none';
  dropZone.style.display = '';
}

function captureFrame() {
  const video  = $('videoEl');
  const canvas = $('captureCanvas');
  canvas.width  = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  canvas.toBlob((blob) => { stopCamera(); processFile(blob); }, 'image/jpeg', 0.92);
}


// ── Image → OCR Pipeline ───────────────────────────────────────────────────────
function processFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    currentImageData = e.target.result;
    $('previewImg').src = currentImageData;
    runOCR(currentImageData);
  };
  reader.readAsDataURL(file);
}

async function runOCR(imageSrc) {
  showPanel('panel-processing');
  setStep(2);
  const bar = $('progressBar');
  const st  = $('processStatus');

  try {
    // Pre-process before handing to Tesseract
    st.textContent  = 'Pre-processing image…';
    bar.style.width = '5%';
    const processedSrc = await preprocessImage(imageSrc, (msg, pct) => {
      st.textContent  = msg;
      bar.style.width = pct + '%';
    });

    // Update the preview to show the processed image the OCR actually sees
    $('previewImg').src = processedSrc;

    const worker = await Tesseract.createWorker('eng', 1, {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          const pct = Math.round((m.progress || 0) * 100);
          bar.style.width = Math.round(20 + pct * 0.8) + '%';
          st.textContent  = `Reading text… ${pct}%`;
        } else if (m.status.includes('loading')) {
          st.textContent = 'Loading OCR engine…';
          bar.style.width = '22%';
        } else if (m.status.includes('initializing')) {
          st.textContent = 'Initializing…';
          bar.style.width = '28%';
        }
      }
    });

    await worker.setParameters({ tessedit_pageseg_mode: Tesseract.PSM.AUTO });
    const { data } = await worker.recognize(processedSrc);
    await worker.terminate();

    bar.style.width = '100%';
    $('rawText').textContent = data.text;
    parseContactFields(data.text);
    showPanel('panel-review');
    setStep(2);

  } catch (err) {
    console.error('OCR failed:', err);
    alert('OCR failed: ' + err.message + '\n\nPlease try a clearer, higher-contrast image.');
    showPanel('panel-capture');
    setStep(1);
  }
}


// ── OCR Pre-Processing Pipeline ────────────────────────────────────────────────
/**
 * Applies a series of canvas-based transforms to maximise OCR accuracy:
 *   1. Upscale small images to a minimum width (Tesseract likes ≥ 300 DPI equivalent)
 *   2. Grayscale conversion
 *   3. Contrast stretch (linear histogram normalisation)
 *   4. Unsharp mask (sharpens blurry text edges)
 *   5. Adaptive threshold → clean black-on-white binary image
 *   6. Deskew (detects card rotation angle, rotates to horizontal)
 *
 * @param {string} src        — data-URL of the original image
 * @param {Function} progress — (message: string, percent: number) => void
 * @returns {Promise<string>} — data-URL of the processed image (PNG)
 */
async function preprocessImage(src, progress) {
  const img = await loadImage(src);

  // Step 1 — Upscale if too small
  progress('Upscaling…', 6);
  const MIN_WIDTH = 1800;
  const scale = img.width < MIN_WIDTH ? MIN_WIDTH / img.width : 1;
  const w = Math.round(img.width  * scale);
  const h = Math.round(img.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width  = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);

  // Step 2 — Grayscale
  progress('Converting to grayscale…', 8);
  let imageData = ctx.getImageData(0, 0, w, h);
  toGrayscale(imageData.data);
  ctx.putImageData(imageData, 0, 0);

  // Step 3 — Contrast stretch
  progress('Boosting contrast…', 10);
  imageData = ctx.getImageData(0, 0, w, h);
  contrastStretch(imageData.data);
  ctx.putImageData(imageData, 0, 0);

  // Step 4 — Unsharp mask
  progress('Sharpening…', 13);
  imageData = ctx.getImageData(0, 0, w, h);
  unsharpMask(imageData.data, w, h, 1.2, 0.6);
  ctx.putImageData(imageData, 0, 0);

  // Step 5 — Adaptive threshold (Sauvola-style, block-based)
  progress('Binarising…', 16);
  imageData = ctx.getImageData(0, 0, w, h);
  adaptiveThreshold(imageData.data, w, h, 32, 0.12);
  ctx.putImageData(imageData, 0, 0);

  // Step 6 — Deskew
  progress('Detecting skew…', 19);
  const angle = detectSkewAngle(ctx.getImageData(0, 0, w, h).data, w, h);
  if (Math.abs(angle) > 0.3 && Math.abs(angle) < 25) {
    progress(`Correcting ${angle.toFixed(1)}° skew…`, 20);
    const rotated = rotateCanvas(canvas, -angle);
    return rotated.toDataURL('image/png');
  }

  return canvas.toDataURL('image/png');
}

/** Load a data-URL or URL into an HTMLImageElement. */
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = reject;
    img.src     = src;
  });
}

/** Convert RGBA pixel array to grayscale in-place (luminance formula). */
function toGrayscale(data) {
  for (let i = 0; i < data.length; i += 4) {
    const g = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    data[i] = data[i + 1] = data[i + 2] = g;
  }
}

/**
 * Linear contrast stretch: maps [p2, p98] percentile range → [0, 255].
 * Handles cards that were photographed in poor lighting.
 */
function contrastStretch(data) {
  // Sample every 4th pixel for speed
  const samples = [];
  for (let i = 0; i < data.length; i += 16) samples.push(data[i]);
  samples.sort((a, b) => a - b);
  const lo = samples[Math.floor(samples.length * 0.02)];
  const hi = samples[Math.floor(samples.length * 0.98)];
  if (hi === lo) return;
  const range = hi - lo;
  for (let i = 0; i < data.length; i += 4) {
    const v = Math.round(((data[i] - lo) / range) * 255);
    data[i] = data[i + 1] = data[i + 2] = Math.max(0, Math.min(255, v));
  }
}

/**
 * Simple unsharp mask: blurs a copy, then blends original + (original − blurred).
 * Sharpens soft text from phone cameras without adding noise artifacts.
 *
 * @param {Uint8ClampedArray} data
 * @param {number} w
 * @param {number} h
 * @param {number} amount   — strength (0–2)
 * @param {number} radius   — blur radius in fraction of width (0.002–0.01)
 */
function unsharpMask(data, w, h, amount, radius) {
  const blurred = new Uint8ClampedArray(data.length);
  // Horizontal box blur
  const r = Math.max(1, Math.round(w * radius));
  for (let y = 0; y < h; y++) {
    let sum = 0;
    for (let x = 0; x < r; x++) sum += data[(y * w + x) * 4];
    for (let x = 0; x < w; x++) {
      if (x + r < w) sum += data[(y * w + x + r) * 4];
      if (x - r >= 0) sum -= data[(y * w + x - r - 1) * 4];
      const v = Math.round(sum / Math.min(r * 2, w));
      blurred[(y * w + x) * 4] = blurred[(y * w + x) * 4 + 1] =
        blurred[(y * w + x) * 4 + 2] = v;
    }
  }
  // Apply: sharpen = original + amount * (original - blurred)
  for (let i = 0; i < data.length; i += 4) {
    const v = Math.round(data[i] + amount * (data[i] - blurred[i]));
    data[i] = data[i + 1] = data[i + 2] = Math.max(0, Math.min(255, v));
  }
}

/**
 * Block-based adaptive threshold (approximates Sauvola).
 * Each block's mean determines the local threshold — handles
 * uneven lighting / shadows across different regions of the card.
 *
 * @param {Uint8ClampedArray} data
 * @param {number} w
 * @param {number} h
 * @param {number} blockSize  — side length of local neighbourhood (px)
 * @param {number} k          — sensitivity (0 = mean only, higher = more aggressive)
 */
function adaptiveThreshold(data, w, h, blockSize, k) {
  const half = Math.floor(blockSize / 2);
  const out  = new Uint8ClampedArray(data.length);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Compute local mean in block
      let sum = 0, count = 0;
      const x0 = Math.max(0, x - half), x1 = Math.min(w - 1, x + half);
      const y0 = Math.max(0, y - half), y1 = Math.min(h - 1, y + half);
      for (let by = y0; by <= y1; by += 2) {     // sample every 2nd row for speed
        for (let bx = x0; bx <= x1; bx += 2) {
          sum += data[(by * w + bx) * 4];
          count++;
        }
      }
      const mean = sum / count;
      const threshold = mean * (1 - k);
      const idx = (y * w + x) * 4;
      const val = data[idx] >= threshold ? 255 : 0;
      out[idx] = out[idx + 1] = out[idx + 2] = val;
      out[idx + 3] = 255;
    }
  }
  data.set(out);
}

/**
 * Detect card skew angle using a Hough-like horizontal projection approach.
 * Tries angles −20° to +20°; the angle where the projection variance is
 * maximised corresponds to the text-line direction.
 *
 * @param {Uint8ClampedArray} data — binary (0 or 255) grayscale pixels
 * @param {number} w
 * @param {number} h
 * @returns {number} angle in degrees (positive = clockwise tilt)
 */
function detectSkewAngle(data, w, h) {
  // Work on a down-sampled version for speed
  const SCALE = 4;
  const sw = Math.floor(w / SCALE);
  const sh = Math.floor(h / SCALE);
  const small = new Uint8Array(sw * sh);
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      small[y * sw + x] = data[(y * SCALE * w + x * SCALE) * 4] < 128 ? 1 : 0;
    }
  }

  let bestAngle = 0;
  let bestVariance = -1;

  for (let deg = -20; deg <= 20; deg += 0.5) {
    const rad = (deg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const cx  = sw / 2;
    const cy  = sh / 2;

    // Project onto rotated horizontal axis
    const rows = new Float32Array(sh);
    for (let y = 0; y < sh; y++) {
      let cnt = 0;
      for (let x = 0; x < sw; x++) {
        if (small[y * sw + x]) {
          const ry = Math.round(-(x - cx) * sin + (y - cy) * cos + cy);
          if (ry >= 0 && ry < sh) rows[ry]++;
          cnt++;
        }
      }
    }

    // Variance of the row-projection histogram
    let mean = 0;
    for (let i = 0; i < sh; i++) mean += rows[i];
    mean /= sh;
    let variance = 0;
    for (let i = 0; i < sh; i++) variance += (rows[i] - mean) ** 2;

    if (variance > bestVariance) {
      bestVariance = variance;
      bestAngle    = deg;
    }
  }

  return bestAngle;
}

/** Rotate a canvas by `angle` degrees around its centre; returns a new canvas. */
function rotateCanvas(src, angle) {
  const rad = (angle * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const nw  = Math.round(src.width * cos + src.height * sin);
  const nh  = Math.round(src.width * sin + src.height * cos);

  const dst = document.createElement('canvas');
  dst.width  = nw;
  dst.height = nh;
  const ctx = dst.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, nw, nh);
  ctx.translate(nw / 2, nh / 2);
  ctx.rotate(rad);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return dst;
}


// ── Smart Contact Parser ───────────────────────────────────────────────────────
function parseContactFields(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  const emailMatch = text.match(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
  $('fEmail').value = emailMatch ? emailMatch[0] : '';

  const phoneRe = /(?:\+?1[-.\\s]?)?\(?\d{3}\)?[-.\\s]\d{3}[-.\\s]\d{4}(?:[\s]*(?:x|ext)\.?[\s]*\d{1,5})?/g;
  const phones  = [...text.matchAll(phoneRe)].map(m => m[0].trim());
  $('fPhone').value  = phones[0] || '';
  $('fPhone2').value = phones[1] || '';

  const urlMatch = text.match(/(?:https?:\/\/)?(?:www\.)[^\s,]+\.[a-z]{2,}[^\s,]*/i)
    || text.match(/(?:https?:\/\/)[^\s,]+/i);
  if (urlMatch) {
    const url = urlMatch[0];
    $('fWebsite').value = url.startsWith('http') ? url : 'https://' + url;
  } else {
    $('fWebsite').value = '';
  }

  const liMatch = text.match(/linkedin\.com\/in\/[\w-]+/i);
  $('fLinkedIn').value = liMatch ? liMatch[0] : '';

  const addrRe   = /\b([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\b/;
  const addrLine = lines.find(l => addrRe.test(l));
  if (addrLine) {
    const idx   = lines.indexOf(addrLine);
    const parts = [idx > 0 ? lines[idx - 1] : '', addrLine].filter(Boolean);
    $('fAddress').value = parts.join(', ');
  } else {
    $('fAddress').value = '';
  }

  const usedValues = [
    emailMatch && emailMatch[0], phones[0], phones[1],
    urlMatch && urlMatch[0], liMatch && liMatch[0], addrLine
  ].filter(Boolean);

  const cleanLines = lines.filter(l => {
    if (l.length < 2 || /^[\W_]+$/.test(l) || /^\d+$/.test(l)) return false;
    if (usedValues.some(v => l.toLowerCase().includes(v.toLowerCase()))) return false;
    if (/www\.|http|@|linkedin/i.test(l)) return false;
    if (addrRe.test(l) || /\b[A-Z]{2}\s+\d{5}/.test(l)) return false;
    return true;
  });

  const nameCandidates = cleanLines
    .filter(l => { const w = l.split(/\s+/); return w.length >= 2 && w.length <= 5 && !/\d/.test(l); })
    .sort((a, b) => a.length - b.length);

  const titleKw = /\b(vp|ceo|cto|cfo|coo|cmo|president|director|manager|engineer|developer|consultant|analyst|officer|founder|partner|associate|senior|junior|lead|principal|head|chief|advisor|specialist|coordinator|supervisor|executive)\b/i;

  const name       = nameCandidates[0] || '';
  const titleLine  = cleanLines.find(l => l !== name && titleKw.test(l));
  const compLine   = cleanLines.find(l => l !== name && l !== titleLine && l.length > 1);

  $('fName').value    = name;
  $('fTitle').value   = titleLine  || '';
  $('fCompany').value = compLine   || '';
  $('fNotes').value   = '';
}


// ── Review Panel ───────────────────────────────────────────────────────────────
$('rawToggle').addEventListener('click', () => {
  const panel = $('rawPanel');
  const btn   = $('rawToggle');
  panel.classList.toggle('visible');
  btn.textContent = panel.classList.contains('visible') ? 'Hide raw text' : 'Show raw text';
});

$('btnNext').addEventListener('click', () => { buildVcardPreview(); showPanel('panel-export'); setStep(3); });
$('btnBackToReview').addEventListener('click', () => { showPanel('panel-review'); setStep(2); });

function resetApp() {
  showPanel('panel-capture');
  setStep(1);
  currentImageData = null;
  ['fName','fTitle','fCompany','fPhone','fPhone2','fEmail','fWebsite','fAddress','fLinkedIn','fNotes']
    .forEach(id => $(id).value = '');
  $('rawPanel').classList.remove('visible');
  $('rawToggle').textContent = 'Show raw text';
  $('progressBar').style.width = '0%';
}

$('btnReScan').addEventListener('click', resetApp);
$('btnScanAnother').addEventListener('click', resetApp);


// ── vCard Preview ──────────────────────────────────────────────────────────────
function buildVcardPreview() {
  const get = (id) => $(id).value.trim();
  const name = get('fName') || 'No Name';

  $('vcName').textContent    = name;
  $('vcTitleCo').textContent = [get('fTitle'), get('fCompany')].filter(Boolean).join(' · ') || '—';

  const mkIcon = (path) =>
    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${path}</svg>`;

  const PHONE_ICON = mkIcon('<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.49 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.4 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.08 6.08l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>');
  const EMAIL_ICON = mkIcon('<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>');
  const WEB_ICON   = mkIcon('<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>');
  const ADDR_ICON  = mkIcon('<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>');

  const fields = [];
  if (get('fPhone'))   fields.push({ icon: PHONE_ICON, text: get('fPhone') });
  if (get('fPhone2'))  fields.push({ icon: PHONE_ICON, text: get('fPhone2') });
  if (get('fEmail'))   fields.push({ icon: EMAIL_ICON, text: get('fEmail') });
  if (get('fWebsite')) fields.push({ icon: WEB_ICON,   text: get('fWebsite').replace(/^https?:\/\//, '') });
  if (get('fAddress')) fields.push({ icon: ADDR_ICON,  text: get('fAddress') });

  $('vcFields').innerHTML = fields
    .map(f => `<div class="vcard-field">${f.icon}<span>${f.text}</span></div>`)
    .join('');
}


// ── vCard Generation ───────────────────────────────────────────────────────────
function generateVcf() {
  const get   = (id) => $(id).value.trim();
  const name  = get('fName');
  const parts = name.split(/\s+/);
  const last  = parts.length > 1 ? parts[parts.length - 1] : '';
  const first = parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0] || '';

  const lines = [
    'BEGIN:VCARD', 'VERSION:3.0',
    `N:${last};${first};;;`,
    `FN:${name}`,
  ];
  if (get('fTitle'))    lines.push(`TITLE:${get('fTitle')}`);
  if (get('fCompany'))  lines.push(`ORG:${get('fCompany')}`);
  if (get('fPhone'))    lines.push(`TEL;TYPE=WORK,VOICE:${get('fPhone')}`);
  if (get('fPhone2'))   lines.push(`TEL;TYPE=CELL:${get('fPhone2')}`);
  if (get('fEmail'))    lines.push(`EMAIL;TYPE=INTERNET:${get('fEmail')}`);
  if (get('fWebsite'))  lines.push(`URL:${get('fWebsite')}`);
  if (get('fAddress'))  lines.push(`ADR;TYPE=WORK:;;${get('fAddress')};;;;`);
  if (get('fLinkedIn')) lines.push(`X-SOCIALPROFILE;type=linkedin:${get('fLinkedIn')}`);
  if (get('fNotes'))    lines.push(`NOTE:${get('fNotes')}`);
  lines.push('END:VCARD');
  return lines.join('\r\n') + '\r\n';
}


// ── Export Actions ─────────────────────────────────────────────────────────────
$('btnVcf').addEventListener('click', () => {
  const blob = new Blob([generateVcf()], { type: 'text/vcard;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = ($('fName').value.trim().replace(/\s+/g, '-') || 'contact') + '.vcf';
  a.click();
  URL.revokeObjectURL(url);
  showToast('vCard downloaded!');
});

$('btnCopyText').addEventListener('click', () => {
  const get  = (id) => $(id).value.trim();
  const text = ['fName','fTitle','fCompany','fPhone','fPhone2','fEmail','fWebsite','fAddress','fLinkedIn','fNotes']
    .map(get).filter(Boolean).join('\n');
  navigator.clipboard.writeText(text)
    .then(() => showToast('Copied to clipboard!'))
    .catch(() => showToast('Copy failed — please copy manually.'));
});
