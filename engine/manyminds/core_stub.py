"""PUBLIC DEMO STUB backend — NOT the real ManyMinds engine.

Purpose
-------
This module lets the open-source shell run end-to-end so anyone can clone the
repo, install requirements, start the web app, and watch the *architecture*
work: a belief comes in, a room of distinct voices is composed and streamed to
the frontend, then the dialogue advances turn by turn until it closes.

What this is NOT
----------------
There is **no real character design, no prompt engineering, and none of the
logic that makes a real room move** here. That is the private engine. The three
voices below are deliberately generic and obviously canned — an optimist, a
skeptic, and a pragmatist that template the user's belief into flat, scripted
lines. Nothing here reflects how the real product works.

Swapping in the real engine: see ``core_interface.py`` — it binds a private
backend if one is importable, otherwise it falls back to this stub.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from manyminds.state import ComposerState  # public state container (kept shell schema)


# --------------------------------------------------------------------------- #
# Toy "voices" — a display name + a generic posture + canned, templated lines.
# These are not real characters; just enough to render three obviously-fake
# demo speakers.
# --------------------------------------------------------------------------- #
@dataclass(frozen=True)
class _DemoVoice:
    cid: str
    name: str
    role: str                 # shown in the UI as the speaker's stance/role
    angle: str                # one-line generic posture toward any belief
    lines: tuple[str, ...]    # canned follow-ups, cycled per turn


DEMO_VOICES: tuple[_DemoVoice, ...] = (
    _DemoVoice(
        "demo-optimist", "Aria", "the optimist",
        "looks for the opening in it",
        ("There's a hopeful reading of this if we let there be one.",
         "I keep noticing what becomes possible here, not just what's at risk.",
         "Say the best case out loud — what would it actually look like?"),
    ),
    _DemoVoice(
        "demo-skeptic", "Boro", "the skeptic",
        "presses on the weak joint",
        ("I'm not sold. Where's the part that could be wrong?",
         "That sounds tidy. What does it cost, and who pays it?",
         "Before we agree, let's find the version of this that fails."),
    ),
    _DemoVoice(
        "demo-pragmatist", "Cleo", "the pragmatist",
        "asks what we'd actually do",
        ("Okay — but concretely, what changes on Monday?",
         "Let's turn that into one thing someone could test.",
         "Strip the theory: what's the smallest real step here?"),
    ),
)

# Demo always runs the same small room. The first voice hosts.
_MAX_TURNS = 6


# --------------------------------------------------------------------------- #
# compose() — build a toy ComposerState. Shows the SHAPE of the flow
# (input -> a small seated room) with trivial, transparent logic so the
# architecture is visible end-to-end. No real composition.
# --------------------------------------------------------------------------- #
def _toy_axes(belief: str) -> dict:
    t = belief.lower()
    return {
        "phys": any(w in t for w in ("money", "build", "system", "work", "tech", "body")),
        "psych": any(w in t for w in ("feel", "fear", "love", "afraid", "alone", "hurt")),
        "meta": any(w in t for w in ("meaning", "why", "should", "real", "truth", "self")),
    }


def compose(belief: str, **_ignored) -> ComposerState:
    """Return a ComposerState seating the three demo voices.

    The stub seats the same three voices every time and tags the state with
    trivial values so the downstream shell (adapter, demo) has data to render.
    It is intentionally input-insensitive beyond a toy axis check.
    """
    state = ComposerState(raw_input=belief)
    state.axes = _toy_axes(belief)            # type: ignore[assignment]
    # Cast entries carry the seat keys PLUS display fields the adapter reads.
    state.cast = [
        {
            "core_id": v.cid,
            "core_kind": "demo",
            "role": v.role,
            "tier": "allow",
            "gate": None,
            # display fields (stub supplies these; a real backend supplies its own)
            "name": v.name,
            "stance_label": v.role,
            "claim_stance": f"({v.name} — demo stub voice; {v.angle})",
            "personal_stakes": "(public demo stub — no real persona)",
        }
        for v in DEMO_VOICES
    ]
    state.log("[stub] PUBLIC DEMO STUB backend — the real engine is private")
    return state


def background_for(axes: Optional[dict]) -> str:
    """A real backend may surface a knowledge background here; the stub has none."""
    return ""


# --------------------------------------------------------------------------- #
# DialogueRoom — a canned, deterministic turn engine. Round-robins the demo
# voices, templates the belief / user input into flat lines, then closes after
# a fixed number of turns. No model call; the real turn engine is private.
# --------------------------------------------------------------------------- #
class DialogueRoom:
    def __init__(self, characters: list[dict], belief: str,
                 knowledge_background: Optional[str] = None) -> None:
        self.belief = belief
        self.characters = characters
        self.ai = [c for c in characters if not c.get("is_user")]
        self.turn_index = 0

    @classmethod
    def from_characters(cls, characters: list[dict], belief: str,
                        knowledge_background: Optional[str] = None) -> "DialogueRoom":
        return cls(characters, belief, knowledge_background)

    def _voice_for(self, char: dict) -> Optional[_DemoVoice]:
        return next((v for v in DEMO_VOICES if v.cid == char.get("core_id")), None)

    def next_turn(self, user_input: Optional[str] = None) -> dict:
        """Advance one turn. Returns the frontend's turn shape:
        ``{speaker_name, response_text, to_user, closing?}``."""
        if not self.ai:
            return {"speaker_name": "Room", "response_text": "(no voices seated)", "to_user": False}

        # Closing after a fixed budget — demonstrates the close path the UI renders.
        if self.turn_index >= _MAX_TURNS:
            host = self.ai[0]["name"]
            return {
                "speaker_name": host,
                "response_text": "That's a good place to pause. Here's where we landed.",
                "to_user": False,
                "closing": self._closing_summary(),
            }

        speaker = self.ai[self.turn_index % len(self.ai)]
        voice = self._voice_for(speaker)
        self.turn_index += 1

        if user_input:
            line = (f"You said: “{user_input.strip()}”. "
                    + (voice.lines[self.turn_index % len(voice.lines)] if voice
                       else "Noted — let's stay with that."))
        elif self.turn_index == 1:
            line = (f"On “{self.belief.strip()}” — "
                    + (voice.angle.capitalize() + "." if voice else "let's open it up."))
        else:
            line = voice.lines[self.turn_index % len(voice.lines)] if voice else "Let's keep going."

        return {"speaker_name": speaker["name"], "response_text": line, "to_user": False}

    def _closing_summary(self) -> dict:
        return {
            "trigger": "turn-budget (demo)",
            "summary": {
                "carryover_claims": [
                    {"kind": "open question", "text": f"What would change your mind about “{self.belief.strip()}”?",
                     "why_it_matters": "The demo stub leaves you with the question, not an answer."},
                ],
                "session_anatomy": {
                    "divergences": ["optimist vs. skeptic framing (canned)"],
                    "convergences": ["all three want a concrete next step (canned)"],
                    "discoveries": ["(the real engine surfaces these; this is a stub)"],
                    "thinking_modes": ["hope", "doubt", "pragmatism"],
                },
            },
        }
