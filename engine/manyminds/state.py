"""Shared state + core value types.

Maps to spec §1 (ComposerState), §4 (Verdict/Tier), §6 (CastEntry).

Design note (LangGraph): the spec calls for a "linear StateGraph". We deliberately
do NOT depend on langgraph yet. Each node is a pure ``state -> state`` callable
(see manyminds/pipeline.py). Wrapping these in a real StateGraph later is a thin
adapter and requires zero changes to node logic. Nothing here imports langgraph.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Literal, Optional, TypedDict


Walton = Literal["persuasion", "inquiry", "discovery", "deliberation", "eristic"]
Stakes = Literal["information", "identity", "relational", "existential"]

# spec §3d — the user's role in the room, FIXED by Walton type (no user override).
UserRole = Literal["defender", "observer", "explorer", "decision-owner", "expresser"]

# §3d table: Walton type -> user_role. Deterministic; NODE 2 sets state.user_role.
USER_ROLE_BY_WALTON: dict[str, UserRole] = {
    "persuasion": "defender",          # strong: characters push the user directly
    "inquiry": "observer",             # low: user occasionally cross-referenced
    "discovery": "explorer",           # medium-soft: "does this angle land?"
    "deliberation": "decision-owner",  # medium-soft: facts only the user knows
    "eristic": "expresser",            # medium: space to vent; light invitations
}

# §11a — per-turn probability a turn is user-facing, by user_role. 🟡 starting
# values; tune at real-room stage. ENFORCED BY THE ORCHESTRATOR RUNNER (not built in
# v0); also subject to §3d.1 silence drop-off. Config here, not literals in routing.
USER_FACING_PROB: dict[str, float] = {
    "defender": 0.30, "decision-owner": 0.15, "explorer": 0.15,
    "expresser": 0.10, "observer": 0.03,
}


class Axes(TypedDict):
    """Three independent binary axes (spec §2). on/off only — never a score."""
    phys: bool
    psych: bool
    meta: bool


class Niche(TypedDict):
    niche: str
    source: Literal["topic", "stakes"]


class Tier(str, Enum):
    """Three safety tiers (spec §4)."""
    ALLOW = "allow"
    GATE = "gate"
    BAN = "ban"


@dataclass(frozen=True)
class Verdict:
    """Result of the safety lookup (spec §4). ``gate`` is the entry condition
    text when tier == GATE, else None."""
    tier: Tier
    reason: str
    gate: Optional[str] = None


class CastEntry(TypedDict):
    """One seated character (spec §6)."""
    core_id: str
    core_family: str          # A..F (growable, see families.py)
    niche: str
    tier: str                 # "allow" | "gate"
    gate: Optional[str]       # entry condition if tier == "gate"


@dataclass
class ComposerState:
    """Single shared object threaded through all four nodes (spec §1).

    State accumulates; nothing is discarded — later nodes read earlier tags.
    """
    raw_input: str
    axes: Optional[Axes] = None
    walton: Optional[Walton] = None
    stakes: Optional[Stakes] = None
    user_role: Optional[UserRole] = None       # spec §3d — set by NODE 2 from walton
    phase_shift: Optional[str] = None          # e.g. "eristic->deliberation" (spec §3c, 🟡)
    niches: list[Niche] = field(default_factory=list)
    cast: list[CastEntry] = field(default_factory=list)
    # diagnostics, not part of the spec's TypedDict but useful for the gate
    notes: list[str] = field(default_factory=list)

    def log(self, msg: str) -> None:
        self.notes.append(msg)
