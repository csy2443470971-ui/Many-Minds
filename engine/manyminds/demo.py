"""Architecture-gate demo (spec §10 step 6, §12d).

Runs the three reference inputs through the composer and prints each cast plus
the §11b addressing invariant exercised over a mock turn schedule.

⚠️ This is the ARCHITECTURE gate, not the experience gate (§12d). It confirms the
pipeline produces a structurally-correct cast. It does NOT test dialogue quality.

⚠️ "confirm the casts match the validated ones" (spec §10 step 6) is NOT asserted
here: the spec never enumerates the validated casts (§9 ⚠️ — no code was ever run).
Until Sienna provides them, this prints the casts for human inspection rather than
asserting equality. Treating an unspecified expectation as "passed" would be a lie.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from manyminds.pipeline import compose  # noqa: E402
from manyminds.orchestrator.invariant import AddressingTracker  # noqa: E402

REFERENCE_INPUTS = {
    "insomnia": "I can't sleep, I'm scared I'm going to get scooped on my research.",
    "satoshi": "If Satoshi had never published the bitcoin whitepaper, would decentralized money exist anyway?",
    "feminism": "I think feminism's narrative went off track somewhere and I want to argue about it.",
    "good_conversation": "What makes a good conversation? I want to find new hypotheses.",
    "deliberation_relational": "My partner wants to move to another country and I have to decide whether to go with them.",
}


def show(label: str, raw: str) -> None:
    print("=" * 74)
    print(f"INPUT [{label}]: {raw}")
    print("-" * 74)
    st = compose(raw)
    print(f"axes={st.axes}  walton={st.walton}  stakes={st.stakes}"
          + (f"  phase_shift={st.phase_shift}" if st.phase_shift else ""))
    print(f"niches ({len(st.niches)}): " + ", ".join(
        f"{n['niche']}[{n['source'][0]}]" for n in st.niches))
    print("CAST:")
    if not st.cast:
        print("  (empty — see notes; v0 pool is 2 full Cores + 4 stubs)")
    for c in st.cast:
        gate = f"  GATE: {c['gate']}" if c["tier"] == "gate" else ""
        print(f"  {c['niche']:<26} <- {c['core_id']:<22} ({c['core_family']}/{c['tier']}){gate}")

    # exercise the §11b invariant over a naive schedule (round-robin stand-in)
    seated = [c["core_id"] for c in st.cast]
    if seated:
        tr = AddressingTracker(seated=seated)
        total = max(len(seated), 8)
        for i in range(total - 1):           # leave 1 turn to demonstrate force-fill
            tr.speaks(seated[i % len(seated)])
        forced = tr.resolve_before_close(turns_remaining=1)
        print(tr.table())
        if forced:
            print(f"  invariant force-scheduled: {forced}")
    # surface room-tension / pool warnings (§6, §4d, §12c fail-loud)
    warnings = [n for n in st.notes if "⚠️" in n]
    if warnings:
        print("WARNINGS:")
        for w in warnings:
            print(f"  {w}")
    print()


def main() -> None:
    for label, raw in REFERENCE_INPUTS.items():
        show(label, raw)
    print("Architecture gate ran. NOTE: cast-equality vs validated casts NOT asserted "
          "(casts not in spec — Sienna to provide).")


if __name__ == "__main__":
    main()
