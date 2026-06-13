"""Public composition entry point.

The real composition graph (NODE 1 topic substrate → NODE 2 intent → NODE 3
niche planner → NODE 4 casting, plus the room-tension checks) is the private
engine and is NOT present in the open-source build. ``compose()`` is therefore
routed through ``core_interface``, which binds the private engine when it is
installed and otherwise the public demo stub — so this module stays importable
and runnable either way.

The original node-wired pipeline lived here as plain ``state -> state`` function
composition; that structure is documented in the README. Only the *call seam*
remains public.
"""

from __future__ import annotations

from .core_interface import compose  # re-exported public seam

__all__ = ["compose"]
