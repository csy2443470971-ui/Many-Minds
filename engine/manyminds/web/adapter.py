"""Adapter: composer cast -> the frontend's character shape.

The web frontend (``static/js/*.js``) expects each character as
``{id, name, stance, is_user, is_host, claim_stance, personal_stakes}`` plus a
``user`` seat. The composer (NODE 4) emits only ``CastEntry``
(``core_id / core_family / niche / tier / gate``) — no display name, no frontend
stance vocabulary, no user/host seat.

v0 STUBS the missing display fields (per the decision to stub rather than extend
the composer): names are placeholders, ``stance`` shows the functional niche, and
the real Core's first principle / formative wound are surfaced as
``claim_stance`` / ``personal_stakes`` when the Core is fully written. Replacing
these stubs with composer-emitted fields is a later task and changes nothing
here but the field sources.
"""

from __future__ import annotations

from manyminds.cores import CORE_POOL
from manyminds.state import ComposerState

_CORE_BY_ID = {c.core_id: c for c in CORE_POOL}

# STUB display names — the composer does not emit names yet (placeholder pool).
_STUB_NAMES = ["Ada", "Bo", "Cy", "Dane", "Ela", "Finn"]

# room.html has 5 AI seats (one is the host); cap so extra cores don't fall
# off-screen. Fewer than 5 is fine — unused seats hide themselves.
_MAX_AI = 5


def cast_to_characters(state: ComposerState) -> list[dict]:
    """Return ``[user, ai...]`` in the frontend's character shape (stubbed
    display fields)."""
    ai: list[dict] = []
    for i, entry in enumerate(state.cast[:_MAX_AI]):
        core = _CORE_BY_ID.get(entry["core_id"])
        if core is not None and not getattr(core, "stub", False):
            claim, stakes = core.first_principle, core.formative_wound
        else:
            claim, stakes = "(stub Core — full persona not written yet)", "(stub)"
        ai.append({
            "id": entry["core_id"],
            "core_id": entry["core_id"],
            "name": _STUB_NAMES[i % len(_STUB_NAMES)],   # STUB
            "stance": entry["niche"],                     # STUB: niche shown as stance
            "is_user": False,
            "is_host": i == 0,                            # STUB: first seat hosts
            "claim_stance": claim[:200],
            "personal_stakes": stakes[:200],
            "tier": entry["tier"],
            "gate": entry["gate"],
        })
    user = {
        "id": "user", "core_id": None, "name": "You",     # STUB display name
        "stance": "", "is_user": True, "is_host": False,
        "claim_stance": "", "personal_stakes": "",
    }
    return [user] + ai
