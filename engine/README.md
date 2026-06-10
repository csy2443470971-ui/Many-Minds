# ManyMinds — Character Composer (v0, architecture gate)

Fresh rebuild from `manyminds-composer-spec.md` (v2). Implements **spec §10 steps
1–6** — the *architecture gate* (§12d). Does **not** build the dialogue/experience
layer; that is the next, capability-bound phase.

## Run

```bash
python manyminds/demo.py            # 3 reference inputs -> casts + invariant
python tests/test_verdict_replay.py # verdict() snapshot regression (§12a)
python tests/test_niches.py         # niche planner (§5) + routing invariant (§11b)
```

No dependencies required to run the gate offline. `ANTHROPIC_API_KEY` (optional)
switches NODE 1/2 from the offline heuristic to the real Haiku classifier.

## Web layer (v0)

The original Many Minds frontend (landing → buffer → room) now lives under
`manyminds/web/static/` and runs against the **new** composer. Two endpoints in
`manyminds/web/server.py`:

- `POST /session` (SSE) — `compose()` a room, stream one card per seat, then `ready`.
- `POST /turn` — advance the room one turn via the minimal dialogue layer
  (`manyminds/dialogue.py`).

```bash
pip install fastapi uvicorn                              # web deps (the gate itself needs none)
uvicorn manyminds.web.server:fastapi_app --port 8000     # run from the manyminds/ project dir
# open http://127.0.0.1:8000/index.html
```

v0 scope / known stubs (do **not** read as finished):

- **Display fields are stubbed** (`web/adapter.py`): character names are
  placeholders, `stance` shows the functional niche, and `claim_stance` /
  `personal_stakes` surface the Core's first principle / wound. The composer does
  not emit display names yet (decision: stub, don't extend the composer in v0).
- **The dialogue layer is minimal** (`dialogue.py`): round-the-room speaker
  selection honoring the §11b addressing invariant + one model call per turn. No
  moderator / cue / interrupt / closing synthesis — closing is a turn-budget
  trigger with an empty summary. (This is the start of the experience layer the
  gate deferred; it is NOT the legacy orchestrator.)
- Runs offline (placeholder turns) without a key; real turns need `ANTHROPIC_API_KEY`.

## What's built

| spec | item | status |
|---|---|---|
| §1 | linear pipeline, `ComposerState` threaded through 4 nodes | ✅ built |
| §2 | NODE 1 topic_substrate (3 binary axes) | ✅ model + offline fallback |
| §3 | NODE 2 intent_classifier (Walton + stakes) | ✅ model + offline fallback |
| §3c | phase-aware eristic→deliberation | 🟡 detected only, no behavior (flagged) |
| §4 | `verdict()` faithful port + 480-case snapshot lock | ✅ built + frozen |
| §5 | NODE 3 niche_planner (deterministic) | ✅ built |
| §6 | NODE 4 casting (BAN filter, tension pick, 1-Core-1-room) | ✅ built |
| §6 | room-tension check | 🔧 NOT built (hook absent — see gaps) |
| §7a | 2 full Cores w/ `unresolved`; 4 family stubs | ✅ / stubs marked |
| §7b | episodic residue | modeled, **not persisted** (later phase) |
| §8e | model routing table | ✅ as config (dialogue layer not built) |
| §11b | routing invariant (addressing_count ≥ 1) | ✅ built + tested (hard) |
| §11a | probabilistic turn selection | 🟡 NOT built (experience gate) |
| §12b | warm-deny protection flag | ✅ defaults OFF (E/F enter unprotected) |

## Decisions made (so they aren't relitigated)

1. **No LangGraph yet.** Pipeline is plain `state -> state` composition. Spec's
   "linear StateGraph" needs none of LangGraph's value (checkpoint/interrupt/
   concurrency). Nodes are LangGraph-ready: wrap later, zero logic change.
2. **Architecture gate only** (steps 1–6). Experience gate (step 7+) is
   capability-bound and expected to be hard (§12d) — deferred.
3. **2 full Cores + 4 stubs.** Spec mandates starting with 2; stubs let the room
   fill so the §11b invariant can run. Stubs are `stub=True`, not §7c-tested.

## Honest gaps (do NOT read the gate's pass as more than it is)

- **The "10-case verdict replay" is not in the spec.** §4c claims 10/10 but lists
  none, and §9 ⚠️ says no code ever ran. So `test_verdict_replay.py` is a
  **drift-lock snapshot**, not a correctness proof. Provide the 10 canonical cases
  to upgrade it.
- **The 3 "validated casts" are not in the spec.** §10 step 6 says "confirm the
  casts match the validated ones" but none are written down. The demo **prints**
  the casts for inspection; it does **not** assert equality. Provide them to make
  step 6 a real test.
- **Eristic rooms starve.** Eristic niches are family-B-heavy; with one B Core,
  3 of 4 chairs go unfilled. The pool needs **several distinct B Cores**.
- **Meta-rule 4 (inquiry hardness balance) is unenforced.** §4d rule 4 is not
  coded anywhere; the §6 room-tension hook (🔧) is its natural home and is absent.
- **Warm-deny ships OFF (§12b).** A family-E Core meeting an existential-stakes
  user enters **unprotected** in v0. Do not point v0 at emotionally heavy real
  users expecting that fence to hold.

## Next steps (in order)

1. You provide: the 10 verdict cases + the 3 validated casts → upgrade tests from
   drift-lock to correctness assertions.
2. Write the remaining Cores (incl. multiple B Cores) → eristic rooms fill.
3. Add the §6 room-tension hook as a fail-loud check enforcing meta-rule 4.
4. Then (experience gate): §11a probabilistic routing, §8 dialogue layer,
   validate warm-deny (§9 / §12b).
