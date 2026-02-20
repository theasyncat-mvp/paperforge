# Contributing to Paperforge

Thanks for your interest in contributing to Paperforge! This guide will help you get set up.

## Development Environment

### Prerequisites

- Node.js 18+
- Rust stable toolchain (`rustup default stable`)
- Platform-specific Tauri dependencies — see [Tauri prerequisites](https://tauri.app/start/prerequisites/)

### Setup

```bash
git clone <repo-url>
cd paperforge
npm install
npm run tauri dev
```

## Code Style

### Frontend (React)

- **JavaScript only** — no TypeScript. Use `.jsx` / `.js` extensions.
- **Function components** with hooks. No class components.
- **Tailwind CSS utility classes** for all styling. No component libraries (MUI, Chakra, etc.).
- Keep the UI flat, calm, and professional. No gradients, glassmorphism, or neon effects.

### Backend (Rust)

- Format code with `rustfmt`: `cargo fmt`
- Lint with `clippy`: `cargo clippy`
- All Tauri commands should validate inputs and return clear `Result<T, String>` errors.

## Adding a New Tool

1. **Rust command** — Add a `#[tauri::command]` function in `src-tauri/src/lib.rs` and register it in the `generate_handler![]` macro call inside `run()`.

2. **JS wrapper** — Add a wrapper function in `src/lib/tauri.js`:
   ```js
   export async function myNewTool(arg1, arg2) {
     return invoke("my_new_tool", { arg1, arg2 });
   }
   ```

3. **React component** — Create `src/tools/MyNewTool.jsx`. Follow the existing pattern:
   - File input via `FileDropZone`
   - Options UI
   - "Run" button that calls the wrapper
   - Status display (idle / running / done / error)

4. **Register in sidebar** — Add an entry to the `tools` array in `src/components/ToolSidebar.jsx` and add the component mapping in `src/App.jsx`.

## Pull Requests

- Keep PRs focused on a single change.
- Include a clear description of what changed and why.
- Make sure `cargo clippy` and `cargo fmt --check` pass.
- Test the feature manually with real PDF files.

## Issues

- Search existing issues before creating a new one.
- Include steps to reproduce for bugs.
- For feature requests, describe the use case.
