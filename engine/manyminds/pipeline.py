"""Public composition entry point.

The real composition logic is the private engine and is NOT in the open-source
build. ``compose()`` is routed through ``core_interface``, which binds the private
engine when it is installed and otherwise the public demo stub — so this module
stays importable and runnable either way.
"""

from __future__ import annotations

from .core_interface import compose  # re-exported public seam

__all__ = ["compose"]
