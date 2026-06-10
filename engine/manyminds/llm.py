"""Thin LLM wrapper + the per-node model routing table (spec §8e).

Routing table (spec §8e):
  NODE 1 / NODE 2        -> cheap classifier (Haiku, or 4o-mini — pick the cheapest)
  NODE 3 / NODE 4        -> none : deterministic code, no model call
  dialogue ordinary turn -> Haiku (NOT 4o-mini) : follows negative constraints better
  dialogue IGNITION turn -> Sonnet, from day one : chemistry (§8c) is the cheap
                            model's hard ceiling; route up now, don't wait for A/B
  golden post-check      -> Haiku self-call : COLD-only; warm-deny unmitigated (§8e limit)

This module exposes ``classify()`` for the two classifier nodes. If no API key is
present (e.g. this sandbox), it returns ``None`` and the caller falls back to a
deterministic rule-based classifier so the ARCHITECTURE GATE runs fully offline.
The fallback is explicitly marked in logs — it is not a substitute for the model.
"""

from __future__ import annotations

import json
import os
from typing import Optional

# spec §8e routing table, as config (not literals scattered in code)
MODEL_ROUTING = {
    "node1_topic_substrate": "claude-haiku-4-5",
    "node2_intent_classifier": "claude-haiku-4-5",
    "node3_niche_planner": None,          # deterministic
    "node4_core_casting": None,           # deterministic
    "dialogue_ordinary_turn": "claude-haiku-4-5",
    "bridge_prompt_generator": "claude-haiku-4-5",
    "subview_composer": "claude-haiku-4-5",   # Phase-2 cast generation (the only Phase-2 spend)
    # Ignition/chemistry turns route UP to the stronger model from day one (spec §8e):
    # mutual-ignition (§8c) is the cheap model's hard ceiling, so predict it and route
    # up now rather than wait for A/B to "discover" Haiku can't.
    "dialogue_ignition_turn": "claude-sonnet-4-5",
    "golden_sentence_postcheck": "claude-haiku-4-5",   # cold-only self-check (spec §8e limit)
}


def _have_key() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY"))


# --- Mistral baseline-probe backend (B-arm experiment only) -------------------------------
# A THIN provider swap at the model-call layer: when MM_TURN_PROVIDER=mistral, generate() sends
# the SAME assembled (system, user) prompt to Mistral's OpenAI-compatible endpoint instead of
# Anthropic. The engine, prompt assembly, and the Anthropic path are untouched (A-arm byte-
# identical). Default (env unset) => Anthropic, exactly as before. classify() is NOT swapped, so
# room setup (axes/knowledge) stays on the same path as the Haiku runs. Mistral Small is not a
# reasoning model, so a plain completion IS the "low/none reasoning_effort" baseline (no CoT).
def _mistral_generate(system: str, user: str, max_tokens: int) -> Optional[str]:
    import urllib.request
    key = os.environ.get("MISTRAL_API_KEY")
    if not key:
        return None
    model = os.environ.get("MM_MISTRAL_MODEL", "mistral-small-latest")
    body = json.dumps({
        "model": model,
        "max_tokens": max_tokens,
        "messages": [{"role": "system", "content": system},
                     {"role": "user", "content": user}],
    }).encode("utf-8")
    req = urllib.request.Request(
        "https://api.mistral.ai/v1/chat/completions", data=body, method="POST",
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        return (data["choices"][0]["message"]["content"] or "").strip() or None
    except Exception:
        return None


def classify(system: str, user: str, route: str) -> Optional[dict]:
    """Return parsed JSON dict from a cheap classifier call, or None if offline.

    The caller MUST handle None with a deterministic fallback (architecture gate
    must run without network). Real wiring uses the Anthropic Messages API.
    """
    if not _have_key():
        return None
    try:
        import anthropic  # imported lazily; optional dependency for offline gate
        client = anthropic.Anthropic()
        model = MODEL_ROUTING.get(route) or "claude-haiku-4-5"
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
    """Return plain text from a cheap-model call, or None if offline.

    Text-generation sibling of ``classify()`` for the dialogue layer (spec §8e
    routing). Callers MUST handle None with their own offline fallback so the
    layer degrades gracefully without an API key (architecture-gate philosophy:
    everything runs offline, the model is an upgrade).
    """
    if os.environ.get("MM_TURN_PROVIDER") == "mistral":   # baseline probe: swap ONLY the backend
        return _mistral_generate(system, user, max_tokens)
    if not _have_key():
        return None
    try:
        import anthropic  # imported lazily; optional dependency
        client = anthropic.Anthropic()
        model = MODEL_ROUTING.get(route) or "claude-haiku-4-5"
        msg = client.messages.create(
            model=model,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        text = "".join(b.text for b in msg.content if getattr(b, "type", "") == "text")
        return text.strip() or None
    except Exception:
        return None
