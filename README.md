# 📇 CardScan

> Scan a business card → extract contact details → export a `.vcf` file to your phone. **Runs 100% in your browser. No cloud. No subscription. No data ever leaves your device.**

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## ✨ Features

- 📷 **Live camera capture** or drag-and-drop image upload
- 🔍 **On-device OCR** via [Tesseract.js](https://github.com/naptha/tesseract.js) — no API key needed
- 🧠 **Smart field parsing** — auto-extracts name, title, company, phone(s), email, website, address, LinkedIn
- ✏️ **Editable review step** — correct any OCR errors before exporting
- 💾 **vCard (.vcf) export** — open on iPhone or Android to save the contact instantly
- 📋 **Copy as text** — paste anywhere
- 🌙 **Dark / light mode** with system preference detection
- ♿ **Accessible** — keyboard navigable, ARIA labels, reduced-motion support

## 🚀 Getting Started

### Option 1 — Just open the file

```bash
git clone https://github.com/SapiensWilson/cardscan.git
cd cardscan
open index.html   # macOS
# or double-click index.html in Finder / Explorer
```

No build step. No npm install. Just open `index.html` in Chrome or Safari.

### Option 2 — Serve locally (needed for camera on some browsers)

```bash
npx serve .
# or
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## 📱 Using on Mobile

1. Put `index.html` in iCloud Drive / Google Drive
2. Open it in Safari (iOS) or Chrome (Android)
3. Tap **Use Camera** to photograph the card directly
4. Download the `.vcf` and tap it to import

## 🗂️ Project Structure

```
cardscan/
├── index.html        # App shell & markup
├── style.css         # All styles (design tokens, layout, components)
├── app.js            # App logic (OCR, parsing, vCard generation)
└── README.md
```

## 🔒 Privacy

This app intentionally has no backend. Tesseract.js loads once from a CDN (`jsdelivr.net`) and then runs entirely in your browser tab. Your card images are never uploaded anywhere.

## 🛠️ Roadmap

- [ ] Offline support via Service Worker (PWA)
- [ ] Multiple card history / session log
- [ ] Improved OCR pre-processing (contrast boost, deskew)
- [ ] QR code detection fallback
- [ ] Direct iOS Contacts API integration (via web share / shortcuts)
- [ ] Batch scan mode

## 🤝 Contributing

Pull requests welcome! Please open an issue first to discuss larger changes.

## 📄 License

[MIT](LICENSE) — Wilson Richardson
