"""Adapter: a backend's cast -> the frontend's character shape.

The web frontend (``static/js/*.js``) expects each character as
``{id, name, stance, is_user, is_host, claim_stance, personal_stakes}`` plus a
``user`` seat. A backend's ``compose()`` returns a ``ComposerState`` whose
``state.cast`` entries carry seat keys (``core_id / core_kind / role / tier /
gate``) and may additionally carry display fields
(``name / stance_label / claim_stance / personal_stakes``).

This adapter is backend-agnostic: it reads display fields straight off each cast
entry, falling back to placeholders when a backend doesn't supply them. It does
NOT import any engine module — the differentiating logic stays out of the shell.
"""

from __future__ import annotations

from manyminds.state import ComposerState

# Fallback display names when a backend's cast entries omit ``name``.
_FALLBACK_NAMES = ["Ada", "Bo", "Cy", "Dane", "Ela", "Finn"]

# room.html has 5 AI seats (one is the host); cap so extra entries don't fall
# off-screen. Fewer than 5 is fine — unused seats hide themselves.
_MAX_AI = 5


def cast_to_characters(state: ComposerState) -> list[dict]:
    """Return ``[user, ai...]`` in the frontend's character shape, reading
    display fields off each cast entry (placeholders when absent)."""
    ai: list[dict] = []
    for i, entry in enumerate(state.cast[:_MAX_AI]):
        ai.append({
            "id": entry["core_id"],
            "core_id": entry["core_id"],
            "name": entry.get("name") or _FALLBACK_NAMES[i % len(_FALLBACK_NAMES)],
            "stance": entry.get("stance_label") or entry.get("role", ""),
            "is_user": False,
            "is_host": i == 0,                 # first seat hosts
            "claim_stance": (entry.get("claim_stance") or "")[:200],
            "personal_stakes": (entry.get("personal_stakes") or "")[:200],
            "tier": entry.get("tier", "allow"),
            "gate": entry.get("gate"),
        })
    user = {
        "id": "user", "core_id": None, "name": "You",
        "stance": "", "is_user": True, "is_host": False,
        "claim_stance": "", "personal_stakes": "",
    }
    return [user] + ai
