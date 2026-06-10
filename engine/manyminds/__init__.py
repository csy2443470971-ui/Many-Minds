"""ManyMinds character composer — architecture gate (spec §10 steps 1–6)."""
from .pipeline import compose
from .state import ComposerState
__all__ = ["compose", "ComposerState"]
