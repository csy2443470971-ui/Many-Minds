"""Offline demo — runs the public shell end to end on the demo-stub backend.

Composes a room for a few sample beliefs, prints the seated voices, then advances
a short dialogue and prints the close. No API key, no network: the stub backs
everything. This shows the architecture (compose -> room -> turn loop -> close);
the real characters and the engine that makes them move are private.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from manyminds.pipeline import compose                       # noqa: E402
from manyminds.core_interface import DialogueRoom, BACKEND    # noqa: E402
from manyminds.web.adapter import cast_to_characters          # noqa: E402

SAMPLE_BELIEFS = [
    "Humans can't love one person forever.",
    "If Satoshi had never published the whitepaper, decentralized money would exist anyway.",
    "A good conversation changes what you came in believing.",
]


def show(belief: str) -> None:
    print("=" * 74)
    print(f"BELIEF: {belief}")
    print("-" * 74)
    state = compose(belief)
    characters = cast_to_characters(state)

    print("ROOM:")
    for c in characters:
        who = "you" if c["is_user"] else ("host" if c.get("is_host") else c.get("stance", ""))
        print(f"  {c['name']:<8} {who}")

    print("DIALOGUE:")
    room = DialogueRoom.from_characters(characters, belief)
    for _ in range(8):
        turn = room.next_turn()
        print(f"  {turn['speaker_name']}: {turn['response_text']}")
        if turn.get("closing"):
            print(f"  [closing — trigger: {turn['closing']['trigger']}]")
            break
    print()


def main() -> None:
    print(f"ManyMinds demo — backend: {BACKEND}\n")
    for belief in SAMPLE_BELIEFS:
        show(belief)
    print("Demo ran on the public stub. The real engine is private.")


if __name__ == "__main__":
    main()
