"""Shared low-level text signals (no engine/conductor/dialogue state).

Currently houses the CRUDE oppositional-vs-confirming polarity signal (OBS-11). It has TWO
consumers, which is why it lives here rather than inside conductor.py:
  * the conductor — corrects convergence_speed / friction_present when the polarity-blind
    collision_kind (OBS-9) labels a real rebuttal "confirms";
  * the backchannel layer — opens the prod/hook pressure-function gate (OBS-18), which used to read
    the same dirty collision_kind.

Keeping it in one place means a wordlist change (e.g. addressing the OBS-12 concede-first blind
spot) updates every consumer at once instead of silently missing one.

PARTIAL signal: catches MARKED rebuttals (wait / but you're / that's not / contradiction ...);
misses unmarked reframes and misreads concede-first new-frame turns as agreement (OBS-11/OBS-12).
The opener (first 12 words) is double-weighted — personas are told to open with their own point, so
the opener carries the move.
"""
from __future__ import annotations

import re

_POL_OPP = [re.compile(p, re.I) for p in (
    r"\bwait\b", r"\bhold on\b", r"\bhang on\b", r"\bstop right there\b",
    r"\bthat'?s not\b", r"\bbackwards\b", r"\byou can'?t\b",
    r"\byou'?re (treating|saying|folding|separating|cutting|skating|sliding|describing|betting)\b",
    r"\bbut (you'?re|that'?s|then|the|you|i'?m|it|here'?s)\b",
    r"\b(isn'?t|aren'?t|not) the same\b", r"\bthose aren'?t\b",
    r"\bcontradiction\b", r"\bexcept\b", r"\bcounterexample\b", r"\bno[.,]",
)]
_POL_CONF = [re.compile(p, re.I) for p in (
    r"\byou'?re right\b", r"\byou are right\b", r"\bthat'?s right\b", r"\bthat tracks\b",
    r"\b(martin|maria|ruth|priya|mira|cy|dane|bo|ada|ela)'?s right\b",
    r"\bnaming something real\b", r"\bi won'?t argue\b", r"\bi hear (you|that)\b",
    r"\bexactly\b", r"\bagreed\b", r"\bfair\b", r"^\s*right[.,]",
)]
_POL_GUARD = [re.compile(p, re.I) for p in (
    r"\bno question\b", r"\bno doubt\b", r"\byeah,? and\b", r"\byes,? and\b",
)]


def _polarity_score(text: str) -> int:
    """+ = oppositional, - = confirming. Presence-per-pattern, opener double-weighted, guard -1."""
    t = text or ""
    opener = " ".join(t.split()[:12])
    opp = sum(bool(p.search(t)) for p in _POL_OPP) + sum(bool(p.search(opener)) for p in _POL_OPP)
    conf = sum(bool(p.search(t)) for p in _POL_CONF) + sum(bool(p.search(opener)) for p in _POL_CONF)
    if any(g.search(t) for g in _POL_GUARD):
        opp = max(0, opp - 1)
    return opp - conf


def _is_oppositional(text: str) -> bool:
    return _polarity_score(text) >= 1
