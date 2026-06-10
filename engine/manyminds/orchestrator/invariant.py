"""Orchestrator routing invariant (spec §11b) — the ONE ✅ hard constraint.

> Over any full room of N turns, every seated character must be addressed at
> least once. addressing_count == 0 at room close is a routing failure, never a
> content problem (spec §11b).

This is pure deterministic logic depending on no model capability or tuning, so
spec §9 promotes it straight to ✅. It is the precondition that makes the
probabilistic selection (§11a, 🟡, not built in v0) safe to experiment with: it
catches the silent-starvation case that looks like normal sampling.

§11c: two kinds of silence. addressing_count==0 => routing (fix here). count>0
but thin => content/Core (the `unresolved` field, §7a). Diagnose count FIRST.
§11d: a voice that spoke then faded (stakes_closed) already cleared count>=1 —
that is legitimate, NOT a violation. The line is at ZERO, not at LOW.
"""

from __future__ import annotations

from dataclasses import dataclass, field


class InvariantViolation(Exception):
    pass


@dataclass
class AddressingTracker:
    """Maintains the canonical per-character addressing_count table (spec §11b).

    This table is THE source of truth for diagnosing silence — regenerated every
    run, never a remembered figure (spec §9 ⚠️, §11b).
    """
    seated: list[str]
    count: dict[str, int] = field(default_factory=dict)

    def __post_init__(self) -> None:
        self.count = {c: 0 for c in self.seated}

    def speaks(self, c: str) -> None:
        self.count[c] = self.count.get(c, 0) + 1

    def addressed(self, c: str) -> None:
        self.count[c] = self.count.get(c, 0) + 1

    def unspoken(self) -> list[str]:
        return [c for c in self.seated if self.count.get(c, 0) == 0]

    def resolve_before_close(self, turns_remaining: int) -> list[str]:
        """Enforce the invariant before room close (spec §11b implementation).

        Returns the list of characters that MUST be force-scheduled into the
        remaining turns. Raises InvariantViolation (fail loud) if there isn't
        room to seat them all — never silently ships a starved room.
        """
        unspoken = self.unspoken()
        if not unspoken:
            return []
        if turns_remaining >= len(unspoken):
            return unspoken  # force these into remaining turns (override probabilistic pick)
        raise InvariantViolation(
            f"INVARIANT_VIOLATION: {len(unspoken)} unspoken char(s) {unspoken} but only "
            f"{turns_remaining} turn(s) left. Routing failure, not content (spec §11b/§11c)."
        )

    def table(self) -> str:
        rows = "\n".join(f"  {c:<28} {self.count.get(c, 0)}" for c in self.seated)
        return f"addressing_count (canonical, this run):\n{rows}"
