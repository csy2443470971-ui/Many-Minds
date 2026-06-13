"""Thin LLM wrapper — optional hosted-model calls for the shell.

Used only by the shell's optional helpers (e.g. bridge-prompt generation). With
no API key present, ``classify()`` / ``generate()`` return ``None`` and callers
fall back to offline behavior, so the whole shell runs without network. Keys are
read from the environment and never stored.
"""

from __future__ import annotations

import json
import os
from typing import Optional

_DEFAULT_MODEL = "claude-haiku-4-5"

# Route label -> model. Callers pass a label for readability; unknown labels use
# the default. Add entries as the shell grows; the demo stub needs none of this.
MODEL_ROUTING = {
    "bridge_prompt_generator": _DEFAULT_MODEL,
}


def _have_key() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY"))


def classify(system: str, user: str, route: str) -> Optional[dict]:
    """Parsed JSON dict from a hosted model, or ``None`` if no key / on error.
    The caller MUST handle ``None`` with an offline fallback."""
    if not _have_key():
        return None
    try:
        import anthropic  # imported lazily; optional dependency
        client = anthropic.Anthropic()
        model = MODEL_ROUTING.get(route) or _DEFAULT_MODEL
        msg = client.messages.create(
            model=model,
            max_tokens=512,
            system=system + "\n\nRespond with ONLY a JSON object, no prose, no markdown.",
            messages=[{"role": "user", "content": user}],
        )
        text = "".join(b.text for b in msg.content if getattr(b, "type", "") == "text")
        text = text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        return json.loads(text)
    except Exception:
        return None


def generate(system: str, user: str, route: str, *, max_tokens: int = 512) -> Optional[str]:
    """Plain text from a hosted model, or ``None`` if no key / on error.
    The caller MUST handle ``None`` with an offline fallback."""
    if not _have_key():
        return None
    try:
        import anthropic  # imported lazily; optional dependency
        client = anthropic.Anthropic()
        model = MODEL_ROUTING.get(route) or _DEFAULT_MODEL
        msg = client.messages.create(
            model=model, max_tokens=max_tokens, system=system,
            messages=[{"role": "user", "content": user}],
        )
        text = "".join(b.text for b in msg.content if getattr(b, "type", "") == "text")
        return text.strip() or None
    except Exception:
        return None
