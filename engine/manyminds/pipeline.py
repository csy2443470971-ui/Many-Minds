"""The composer pipeline (spec §1) — four nodes wired linearly.

This is the "linear StateGraph" of the spec, implemented as plain function
composition. Each node is ``ComposerState -> ComposerState``. To swap in a real
LangGraph StateGraph later: register these same callables as nodes and add edges
node1->node2->node3->node4. No node body changes.
"""

from __future__ import annotations

from .checks import enforce_family_diversity, run_room_tension_checks
from .niches import node3_niche_planner
from .nodes import (
    node1_topic_substrate,
    node2_intent_classifier,
    node4_core_casting,
)
from .state import ComposerState


def compose(raw_input: str, *, protect_warm_deny: bool = False) -> ComposerState:
    """Run input -> 5-character cast (spec §1 pipeline overview).

    Pipeline: NODE1 -> NODE2 -> NODE3 -> NODE4 -> family-diversity (§6 node 9)
    -> room-tension checks (§6/§4d).
    """
    state = ComposerState(raw_input=raw_input)
    state = node1_topic_substrate(state)
    state = node2_intent_classifier(state)
    state = node3_niche_planner(state)
    state = node4_core_casting(state, protect_warm_deny=protect_warm_deny)
    state = enforce_family_diversity(state, protect_warm_deny=protect_warm_deny)
    state = run_room_tension_checks(state)
    return state
