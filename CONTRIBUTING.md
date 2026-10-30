# Contributing to Lumina

Thank you for your interest in contributing to Lumina. Lumina is a free, open-source desktop app for translating manga, manhwa, and manhua with local ONNX models.

## Development Setup

### Prerequisites

- **Node.js** (v18+)
- **Python** 3.13
- Git

### Setup Steps

```sh
# 1. Clone repository
git clone https://github.com/lumina-tl/lumina.git
cd lumina

# 2. Python backend environment
python -m venv venv
venv\Scripts\pip install -r python\requirements.txt   # Windows
# source venv/bin/activate && pip install -r python/requirements.txt  # macOS / Linux

# 3. Frontend dependencies & build
npm install
npm run build

# 4. Start development
npm start
```

The Electron main process manages and launches the Python backend automatically.

## Architecture

- **`src/main/`** — Electron main process: window lifecycle, backend spawn/kill, file I/O, secret vault.
- **`src/preload.ts`** — Context-isolated IPC bridge between main and renderer.
- **`src/renderer/`** — UI, Konva canvas engine, pipeline state, settings, and modal windows.
- **`src/shared/`** — Shared TypeScript types and IPC contract (`src/shared/bridge.ts`).
- **`python/`** — FastAPI backend server (`python/main.py`) running ONNX Runtime inference and translation providers.

## Git Workflow & Branching

1. Fork repository to your GitHub account.
2. Clone fork locally and create topic branch:
   ```sh
   git checkout -b feat/your-feature-name
   # or
   git checkout -b fix/your-bug-fix
   ```
3. Keep changes focused and surgical. Avoid unrelated formatting or style changes.
4. Verify build and types before pushing:
   ```sh
   npm run build
   ```
5. Push to fork and submit Pull Request against `main` branch.

## Commit Message Guidelines

Use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat(scope): ...` for new features
- `fix(scope): ...` for bug fixes
- `docs(scope): ...` for documentation changes
- `refactor(scope): ...` for code restructuring without behavior changes
- `chore(scope): ...` for dependencies, build, or release maintenance

Examples:
- `feat(export): add PDF export functionality`
- `fix(canvas): prevent transformer anchor from triggering brush stroke`

## Porting & Attribution Policy

When porting features or fixes from community forks or third-party repositories:

1. **Credit original author in commit message** using git `Co-authored-by` trailer:
   ```text
   feat(export): add PDF export support

   Adapted from B0bul0/lumina@3a8a81e

   Co-authored-by: B0bul0 <author-email-or-github-noreply>
   ```
2. **Mention source in Pull Request description** under the Credits / Attribution section.
3. **Credit contributor in [CHANGELOG.md](./CHANGELOG.md)** when recording release notes.

## Submitting Pull Requests

- Use PR template provided in repository.
- Describe what was changed and why.
- Confirm manual test steps performed.
