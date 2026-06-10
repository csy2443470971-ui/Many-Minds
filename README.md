# Many Minds

> **Explore the thoughts you haven't thought yet.**

Many Minds is a place to think *with* minds unlike your own. Drop in a belief or
an open question, and step into a room of unfamiliar perspectives you'd never
reach alone.

Under the hood, a **character composer** reads your prompt, casts a room of
distinct viewpoints (each with its own first principles and blind spots), and
runs a live dialogue between them — so you can watch an idea get pushed from
angles you wouldn't have found on your own.

---

## What's in this repo

| Folder | What it is |
|--------|-----------|
| [`engine/`](engine/) | The **engine** — a Python character composer plus a small web layer that streams a composed room and advances the dialogue turn by turn. |
| [`website/`](website/) | The **marketing site** — the public landing page (`website-final/`). |

For engine details — how the composer is built, what's done, and the honest
gaps — see [`engine/README.md`](engine/README.md).

---

## Quick start (engine)

Requires Python 3.10+.

```bash
cd engine

# 1. Create an isolated environment and install web dependencies
python3 -m venv .venv
source .venv/bin/activate           # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# 2. Run the offline gate (no API key needed)
python manyminds/demo.py

# 3. (Optional) Run the web layer
uvicorn manyminds.web.server:fastapi_app --port 8000
# then open http://127.0.0.1:8000/index.html
```

The composer runs **offline** out of the box. To switch the classifiers and
dialogue turns to live models, provide an API key (see below) — never commit it.

### API keys

The engine optionally calls hosted models. Keys are read from a local
`.env.local` file inside `engine/` and are **never** committed to git:

```bash
# engine/.env.local   (this file is gitignored)
ANTHROPIC_API_KEY=your-key-here
MISTRAL_API_KEY=your-key-here
```

---

## Status

Early stage / work in progress. The engine currently implements the composition
("architecture") layer with a minimal dialogue layer on top; see
[`manyminds/README.md`](manyminds/README.md) for the precise state and known
gaps.

## License

[MIT](LICENSE) © 2026 Sienna
