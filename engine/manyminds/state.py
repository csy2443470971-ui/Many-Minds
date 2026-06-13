"""Shared state container for the shell.

A backend's ``compose()`` returns a ``ComposerState`` carrying the room's axes
and its seated cast; the web/adapter layer and the demo read off it. Kept
deliberately small and generic — the real engine's richer schema is private.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional, TypedDict


class Axes(TypedDict):
    """Three independent on/off tags a backend may set on the input."""
    phys: bool
    psych: bool
    meta: bool


class CastEntry(TypedDict, total=False):
    """One seated character. ``core_id`` / ``core_kind`` / ``role`` identify the
    seat; the optional display fields are what the frontend renders. A backend
    fills whichever it has; the adapter supplies placeholders for the rest."""
    core_id: str
    core_kind: str
    role: str
    name: str
    stance_label: str
    claim_stance: str
    personal_stakes: str
    tier: str
    gate: Optional[str]


@dataclass
class ComposerState:
    """Single object a backend returns from ``compose()``. State accumulates;
    ``notes`` collects human-readable diagnostics."""
    raw_input: str
    axes: Optional[Axes] = None
    cast: list[CastEntry] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)

    def log(self, msg: str) -> None:
        self.notes.append(msg)
