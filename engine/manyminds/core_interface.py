"""Backend seam between the public shell and the engine.

The web/runtime shell calls ``compose`` / ``background_for`` / ``DialogueRoom``
through THIS module instead of importing a concrete engine. That keeps the
differentiating engine swappable and absent from the public repo:

  * If a private engine is installed (a ``manyminds._private.backend`` module
    exposing the same three names), it binds here automatically.
  * Otherwise the public demo stub (``manyminds.core_stub``) backs the shell so
    the open-source build runs end-to-end out of the box.

Contract a backend must provide:
    compose(belief: str) -> ComposerState        # seats a room (state.cast/.axes)
    background_for(axes) -> str                   # optional knowledge background
    DialogueRoom.from_characters(chars, belief, knowledge_background=None)
        -> room with .next_turn(user_input=None) -> {speaker_name, response_text,
                                                     to_user, closing?}
"""

from __future__ import annotations

try:  # real engine — intentionally absent from the public repository
    from manyminds._private.backend import (  # type: ignore  # noqa: F401
        compose,
        background_for,
        DialogueRoom,
    )
    BACKEND = "private-engine"
except ImportError:  # public open-source build: fall back to the demo stub
    from manyminds.core_stub import (  # noqa: F401
        compose,
        background_for,
        DialogueRoom,
    )
    BACKEND = "public-demo-stub"

__all__ = ["compose", "background_for", "DialogueRoom", "BACKEND"]
