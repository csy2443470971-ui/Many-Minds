# Many Minds — engine (architecture shell)

This is the open architecture shell of Many Minds. It runs end to end on a
**public demo stub** — three placeholder voices and canned turns — so you can see
the framework work without any of the private engine.

## Run it

No API key needed. Everything runs offline on the stub.

```bash
python3 -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Offline demo — compose a room and advance a short dialogue, printed to the console
python manyminds/demo.py

# Web app — the full room experience in the browser
uvicorn manyminds.web.server:fastapi_app --port 8000
# then open http://127.0.0.1:8000/index.html
```

You'll see three placeholder characters (an optimist, a skeptic, a pragmatist)
compose into a room, take turns, and close with a short summary.

## Open vs. private

**Open, here:** the room and turn lifecycle, the server and streaming transport,
the frontend, the state schema, and the demo-stub backend that makes it runnable.

**Private, not in this repo:** the character design and the engine that makes a
room genuinely move. The shell binds a private backend through
[`manyminds/core_interface.py`](manyminds/core_interface.py) when one is present,
and falls back to the demo stub when it isn't.

See the [root README](../README.md) for the project overview.
