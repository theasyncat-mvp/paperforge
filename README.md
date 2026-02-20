# Paperforge

**Asyncat's Local-First PDF Toolkit**

A desktop app built with Tauri + Rust + React that provides core PDF tools entirely offline. No data ever leaves your machine.

## Features

- **Merge PDFs** — Combine multiple PDFs into one, with drag-to-reorder.
- **Split PDF** — Extract page ranges into separate files.
- **Compress PDF** — Reduce file size with Light / Balanced / Strong compression levels.
- **Reorder / Delete Pages** — Rearrange or remove pages from a PDF.
- **Images to PDF** — Convert multiple images (PNG/JPG) into a single PDF.
- **PDF to Images** — Export each page of a PDF as PNG or JPG.
- **Compare PDFs** — Basic comparison of two PDFs (page counts, text content differences).

## Tech Stack

| Layer    | Technology                                    |
| -------- | --------------------------------------------- |
| Desktop  | [Tauri 2](https://tauri.app)                  |
| Backend  | Rust — lopdf, printpdf, image                 |
| Frontend | Vite, React 19, Tailwind CSS 4                |
| Icons    | lucide-react                                  |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) (v18+)
- [Rust](https://rustup.rs) (stable toolchain)
- Tauri prerequisites for your platform — see [Tauri docs](https://tauri.app/start/prerequisites/)

### Development

```bash
npm install
npm run tauri dev
```

### Production Build

```bash
npm run tauri build
```

The built app will be in `src-tauri/target/release/bundle/`.

## Architecture

```
src/                    # React frontend
  App.jsx               # Main layout and tool routing
  components/           # Shared UI components
    TopBar.jsx          # Header with title and theme toggle
    ToolSidebar.jsx     # Navigation sidebar
    FileDropZone.jsx    # Drag-and-drop file selector
    ThemeToggle.jsx     # Dark/light mode toggle
  tools/                # One component per tool
    MergeTool.jsx
    SplitTool.jsx
    CompressTool.jsx
    ReorderTool.jsx
    ImagesToPdfTool.jsx
    PdfToImagesTool.jsx
    CompareTool.jsx
  lib/
    tauri.js            # Typed wrappers for Tauri invoke calls

src-tauri/              # Rust backend
  src/
    lib.rs              # All Tauri commands (merge, split, compress, etc.)
    main.rs             # Binary entry point
  Cargo.toml            # Rust dependencies
  tauri.conf.json       # Tauri app configuration
```

## License

MIT
