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

This is the open **architecture shell**. It runs end to end out of the box on a
public demo stub — a real room lifecycle, streaming transport, turn loop, and
closing summary — so you can see the framework work with three placeholder voices.

The layer that makes the characters genuinely irreducible — the character core
design, the casting logic, the conductor that governs how a room moves — is
closed. The shell binds a private engine when present and falls back to the demo
stub when it isn't.

| Folder | What it is |
|--------|-----------|
| [`engine/`](engine/) | The **architecture shell** — a Python pipeline plus a small web layer that streams a composed room and advances the dialogue turn by turn, running on a public demo stub. |

---

## Quick start

Requires Python 3.10+.

```bash
cd engine

# 1. Create an isolated environment and install dependencies
python3 -m venv .venv
source .venv/bin/activate           # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# 2. Run the offline gate (no API key needed)
python manyminds/demo.py

# 3. (Optional) Run the web layer
uvicorn manyminds.web.server:fastapi_app --port 8000
# then open http://127.0.0.1:8000/index.html
```

The shell runs **offline** out of the box with placeholder characters. No API key
is needed to see the architecture work.

---

## Status

Early stage / work in progress. This repo is the open architecture shell. The
differentiating engine — character cores, casting, conductor, grounding — is
developed privately and not included here.

## Roadmap

The next phase distills the validated character design into a dedicated
fine-tuned model, moving the irreducibility that is presently orchestrated
through prompts into the weights themselves. This is post-funding work — it needs
training resources and data scale, not more design.

## Talk

If you want to understand the character design philosophy in depth, or discuss
working together, reach out.

## License

[MIT](LICENSE) © 2026 Sienna
