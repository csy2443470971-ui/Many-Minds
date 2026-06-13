"""FastAPI web layer for the Many Minds shell.

Two endpoints + a static mount, wired to the backend through ``core_interface``:

  POST /session  (SSE)  belief/atmosphere -> stage / character* / ready (or error)
  POST /turn            session_id [+ user_input] -> one dialogue turn (+ closing)
  GET  /<static>        the frontend (index.html, room.html, css, js, ...)

Run from the ``engine/`` project dir:

    uvicorn manyminds.web.server:fastapi_app --port 8000
    # then open http://127.0.0.1:8000/index.html

or simply:

    python -m manyminds.web.server          # uvicorn on 127.0.0.1:8000

No API key required: the public demo stub backs everything offline.
"""

from __future__ import annotations

import asyncio
import json
import sys
import uuid
from pathlib import Path
from typing import Optional

# Make the inner ``manyminds`` package importable when run as a script.
_PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from manyminds.pipeline import compose
from manyminds.core_interface import DialogueRoom, background_for, BACKEND
from manyminds.llm import generate
from manyminds.web.adapter import cast_to_characters

_STATIC_DIR = Path(__file__).resolve().parent / "static"

fastapi_app = FastAPI(title="ManyMinds", version="v0-web")

# In-memory session store (process lifetime). session_id -> {room, characters, belief}
_SESSIONS: dict[str, dict] = {}


class SessionRequest(BaseModel):
    belief: str
    atmosphere: str = "intellectual"


class TurnRequest(BaseModel):
    session_id: str
    user_input: Optional[str] = None


class BridgePromptsRequest(BaseModel):
    keywords: list[str]
    bridge_input: str = ""


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def _offline_bridge_prompts(keywords: list[str], bridge_input: str = "") -> list[str]:
    ks = set(keywords)
    if {"Nuclear", "Climate", "Waste", "Future Generations"} & ks:
        return [
            "Build nuclear now, or let heat do the killing?",
            "Is it more ethical to leave future people a hotter planet or a radioactive inheritance managed by institutions that may not survive?",
            "Should climate urgency let governments ask the public to trust waste plans that outlive every leader who approved them?",
        ]
    if {"Google", "Capital", "Public Markets", "Monopoly"} & ks:
        return [
            "Who should own the doorway to knowing?",
            "When a company becomes the interface for human curiosity, should its control belong to founders, investors, users, or public institutions?",
            "If Google had never gone public, would the internet be less extractive or just less accountable?",
        ]
    return [
        "Who benefits when the real conflict is hidden inside a tidy question?",
        "What kind of future becomes impossible when the safest choice and the most honest choice are no longer the same?",
        "Who benefits when a public dilemma is framed as a technical problem instead of a moral conflict?",
    ]


def _parse_prompt_list(raw: Optional[str]) -> list[str]:
    if not raw:
        return []
    text = raw.strip()
    text = text.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        return []
    if isinstance(parsed, dict):
        parsed = parsed.get("prompts", [])
    if not isinstance(parsed, list):
        return []
    return [str(item).strip() for item in parsed if str(item).strip()][:3]


@fastapi_app.post("/session")
async def create_session(req: SessionRequest):
    """Compose a room from the belief and stream it as the frontend expects:
    a ``stage`` notice, one ``character`` event per seat, then ``ready`` (or an
    ``error`` event if no room could be seated)."""

    async def stream():
        try:
            yield _sse("stage", {"stage": "composing",
                                 "message": "Imagining who would be in the room..."})
            state = await asyncio.to_thread(compose, req.belief)
            characters = cast_to_characters(state)
            ai = [c for c in characters if not c["is_user"]]
            if not ai:
                yield _sse("error", {
                    "error": "composer_hard_fail",
                    "message": "Couldn't seat a room for this input. Try rephrasing.",
                })
                return

            for c in characters:
                yield _sse("character", c)
                await asyncio.sleep(0.4)   # paced so the buffer page can render cards

            yield _sse("stage", {"stage": "preparing",
                                 "message": "The conversation is about to begin..."})

            knowledge_bg = background_for(state.axes)
            room = DialogueRoom.from_characters(
                characters, req.belief, knowledge_background=knowledge_bg)
            session_id = uuid.uuid4().hex[:12]
            _SESSIONS[session_id] = {
                "room": room, "characters": characters, "belief": req.belief,
                "axes": state.axes,   # axes the backend tagged (diagnostic)
            }
            yield _sse("ready", {
                "session_id": session_id,
                "user_belief": req.belief,
                "atmosphere": req.atmosphere,
                "characters": characters,
                "opening_turns": [],   # v0: the /turn loop produces every turn
            })
        except Exception as e:   # noqa: BLE001 — surface any failure as an SSE error
            import traceback
            traceback.print_exc()
            yield _sse("error", {"error": "internal_error",
                                 "message": f"{type(e).__name__}: {str(e)[:200]}"})

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@fastapi_app.post("/turn")
async def run_turn(req: TurnRequest):
    """Advance one room by a single turn. The dialogue layer call may hit the
    model, so it runs in a thread to keep the event loop free."""
    sess = _SESSIONS.get(req.session_id)
    if not sess:
        raise HTTPException(status_code=404, detail=f"session {req.session_id} not found")
    room: DialogueRoom = sess["room"]
    return await asyncio.to_thread(room.next_turn, req.user_input)


@fastapi_app.post("/bridge-prompts")
async def generate_bridge_prompts(req: BridgePromptsRequest):
    """Generate three specific, high-tension room inputs from selected seeds."""
    keywords = [kw.strip() for kw in req.keywords if kw.strip()][:4]
    if len(keywords) < 2:
        raise HTTPException(status_code=400, detail="Select at least two keywords")

    system = (
        "You generate Many Minds room inputs. Return ONLY JSON: "
        "{\"prompts\":[\"...\",\"...\",\"...\"]}. Generate exactly three concrete "
        "standalone user inputs with varied length: one can be very short and sharp, "
        "one medium, one more developed. They must be high-potential, discussable, "
        "specific, and a little controversial. Do not simply list or restate the "
        "supplied keywords. Reveal the conflict, tradeoff, hidden cost, or legitimacy "
        "problem between them."
    )
    user = json.dumps({
        "selected_keywords": keywords,
        "bridge_seed": req.bridge_input,
        "avoid": [
            "generic questions",
            "tag listing",
            "phrases like connect A and B",
            "abstract summaries without a concrete stake",
        ],
    }, ensure_ascii=False)

    raw = await asyncio.to_thread(
        generate, system, user, "bridge_prompt_generator", max_tokens=520)
    prompts = _parse_prompt_list(raw) or _offline_bridge_prompts(keywords, req.bridge_input)
    return {"prompts": prompts[:3], "source": "llm" if raw else "fallback"}


# Static mount LAST so /session and /turn take precedence over the catch-all.
fastapi_app.mount("/", StaticFiles(directory=str(_STATIC_DIR), html=True), name="static")


def main() -> None:
    import uvicorn
    print(f"ManyMinds web (v0) — backend: {BACKEND} -> http://127.0.0.1:8000/index.html")
    if BACKEND == "public-demo-stub":
        print("  NOTE: running the PUBLIC DEMO STUB (toy voices, canned turns). "
              "The real engine is private.")
    uvicorn.run(fastapi_app, host="127.0.0.1", port=8000, log_level="info")


if __name__ == "__main__":
    main()
