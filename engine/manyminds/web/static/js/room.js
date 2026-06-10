  // Batch 4: data layer is server-driven via POST /session and POST /turn.
  // UI rendering (speech bubbles, name labels, profile cards, typing
  // animation, history panel) is preserved from the mock. The only thing
  // that changed is where the turns come from.

  const experience = document.getElementById('experienceScreen');
  const profileCard = document.getElementById('profileCard');
  const profileName = document.getElementById('profileName');
  const profileAge = document.getElementById('profileAge');
  const profileBullets = document.getElementById('profileBullets');
  const profileMood = document.getElementById('profileMood');
  const hostBadge = document.getElementById('hostBadge');
  const historyPanel = document.getElementById('historyPanel');
  const historyToggle = document.getElementById('historyToggle');
  const restButton = document.getElementById('restButton');
  const liveStatusText = document.getElementById('liveStatusText');
  const callCharacterButton = document.getElementById('callCharacterButton');
  const privateConversationButton = document.getElementById('privateConversationButton');
  const compareButton = document.getElementById('compareButton');
  const roomInput = document.getElementById('roomInput');
  const floorButton = document.getElementById('floorButton');
  const sendButton = document.getElementById('sendButton');
  const speechLayer = document.getElementById('speechLayer');
  const roomLog = document.getElementById('roomLog');
  const ignoreButton = document.getElementById('ignoreButton');   // §3d user-facing turn

  // ── Slot positions: the room has 5 fixed AI seats + Me (Sienna) + Friend.
  // We map backend characters into these slots at /session response time.
  // Sienna (user) always sits at the "Me" slot.
  const SLOT_POSITIONS = {
    Me:     { x: 27.1, y: 36.4 },   // Sienna (user)
    Friend: { x: 50.8, y: 55.8 },   // unused server-side; reserved
    slot1:  { x: 35.2, y: 23.4 },   // was "Zi Yu"
    slot2:  { x: 46.4, y: 23.4 },   // was "Emma"
    slot3:  { x: 58.4, y: 25.7 },   // was "Luke" (host slot)
    slot4:  { x: 39.8, y: 52.1 },   // was "Mark"
    slot5:  { x: 67.4, y: 45.7 },   // was "Alex"
  };

  // Built per-session from the /session response. name → SLOT_POSITIONS key.
  // Populated by assignCharacterSlots(); read by placeBubble().
  let characterSlotByName = {};

  // Batch 4 (post-test fix): canonical display name for the user. The backend
  // tries to override the composer's per-room name to "Sienna" inside the
  // orchestrator, but front-end code is the authority for what gets rendered
  // — hardcoding it here means a backend regression can't make Sienna's
  // bubble appear at someone else's position.
  const USER_DISPLAY_NAME = 'Sienna';

  const roomState = {
    started: false,
    paused: false,
    holdingFloor: false,
    closing: false,            // Batch 4: set true once CLOSING summary lands
    sessionId: null,           // Batch 4
    characters: [],            // Batch 4: [{id, name, stance, is_user, is_host}]
    userClaim: '',
    atmosphere: 'intellectual',
    lastSpeaker: null,
    turnIndex: 0,
    timer: null,
    recentSpeakers: [],
    selectedCharacter: null,
    activeBubbles: [],
    lastBubbleAt: 0,
    inFlightTurn: false,       // Batch 4: prevents overlapping /turn requests
    // Batch 4 (post-test fix #1): when true, scheduleNextTurn early-returns
    // so the autonomous loop can't race a user-initiated /turn. Send button
    // sets this true, waits for any in-flight autonomous turn to settle,
    // takes the loop, fires /turn with user_input, clears the flag, resumes.
    userTurnPending: false,
    // Batch 4 (post-test floor fix): handle on the current /turn fetch so
    // claimFloor + sendButton can abort the in-flight request immediately
    // when Sienna interrupts. The orchestrator's server-side processing
    // still completes (the agent's response IS in dialogue_history), but
    // the front-end never renders the abandoned response — so Sienna's
    // pre-bubbles don't get visually wiped by a late-arriving agent bubble.
    currentTurnAbort: null,
    // §3d user-facing turns: a character can turn to address the user. We track
    // the open solicitation, who has already asked (no character re-asks —
    // §3d.1), and the ignore/timeout strike count (two strikes → the room stops
    // turning to the user; further user-facing turns render with no affordance).
    userFacing: null,             // {speaker} while a question to the user is open
    userFacingTimer: null,        // 30s of silence → __TIMEOUT__
    userFacingStrikes: 0,         // ignore/timeout count; ≥2 disables further asks
    userFacingAskedBy: new Set(), // characters who have already turned to the user
  };

  const atmosphereSettings = {
    intellectual: { delay: 0.82 },
    chill:        { delay: 1.18 },
    poetic:       { delay: 1.30 },
  };

  function addRoomLog(label, text) {
    const item = document.createElement('div');
    item.className = 'history-item';
    item.innerHTML = `<strong>${label}:</strong> ${text}`;
    // Batch 4 (post-test ordering fix): chronological order — oldest at top,
    // newest at bottom. Append, then auto-scroll the panel so the freshest
    // entry stays visible without the user having to scroll.
    roomLog.appendChild(item);
    // When trimming, pop the OLDEST (first child) — earlier code popped
    // lastElementChild which assumed newest-at-top ordering.
    while (roomLog.children.length > 200) {
      roomLog.firstElementChild.remove();
    }
    // Auto-scroll to bottom so newest is visible. requestAnimationFrame so
    // the layout settles before we scroll.
    requestAnimationFrame(() => {
      roomLog.scrollTop = roomLog.scrollHeight;
    });
  }

  function escapeHtml(value) {
    return value.replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
  }

  // Plain-text renderer (Batch 4: backend doesn't emit span markup, so the
  // mock's renderStyledText is no longer needed — keep escapeHtml only).
  // Batch 4 (post-test fix #4): slower typing so multi-sentence agent turns
  // feel like speech, not screen-scrape. Default 40ms/char ≈ ~7 chars/sec.
  // Batch 4 (post-test floor fix): cancellable. typeLine registers a cancel
  // handler on the shared roomState.typingCancelHandlers list; calling
  // cancelAllTyping() stops every in-progress typing in place (bubble keeps
  // whatever's already shown — gives the visual impression of "they stopped
  // when Sienna raised her hand").
  function typeLine(target, text, _spansIgnored, speed = 40) {
    let index = 0;
    let cancelled = false;
    const cancelHandler = () => { cancelled = true; };
    if (!roomState.typingCancelHandlers) roomState.typingCancelHandlers = [];
    roomState.typingCancelHandlers.push(cancelHandler);
    target.innerHTML = '';
    return new Promise((resolve) => {
      const cleanup = () => {
        const i = roomState.typingCancelHandlers.indexOf(cancelHandler);
        if (i !== -1) roomState.typingCancelHandlers.splice(i, 1);
        resolve();
      };
      const tick = () => {
        if (cancelled) { cleanup(); return; }
        // "Call for a break" freezes the typing AT ONCE (mid-text), not at the
        // end of the turn. We hold here without advancing while paused, and
        // resume from the same character on Continue.
        if (roomState.paused) { setTimeout(tick, 120); return; }
        target.innerHTML = escapeHtml(text.slice(0, index));
        index += 1;
        if (index <= text.length) {
          setTimeout(tick, speed);
        } else {
          cleanup();
        }
      };
      tick();
    });
  }

  function cancelAllTyping() {
    (roomState.typingCancelHandlers || []).forEach(h => h());
    roomState.typingCancelHandlers = [];
  }

  function placeBubble(bubble, speaker) {
    // speaker is a display name. Resolve via dynamic slot map; fall back to
    // a safe default if the name isn't recognized (shouldn't happen in
    // practice once /session has filled characterSlotByName).
    const slot = characterSlotByName[speaker]
              || characterSlotByName[speaker.replace(/ · host$/, '')]
              || 'slot3';
    const position = SLOT_POSITIONS[slot] || SLOT_POSITIONS.slot3;
    bubble.style.left = `${position.x}%`;
    bubble.style.top  = `${position.y}%`;
    if (position.x < 18) {
      bubble.style.setProperty('--bubble-offset-x', '-10%');
    } else if (position.x > 76) {
      bubble.style.setProperty('--bubble-offset-x', '-85%');
    } else {
      bubble.style.setProperty('--bubble-offset-x', '-50%');
    }
  }

  function fadePreviousBubbles() {
    roomState.activeBubbles.forEach((bubble) => {
      bubble.classList.add('stilled');
      setTimeout(() => {
        bubble.remove();
        roomState.activeBubbles = roomState.activeBubbles.filter(item => item !== bubble);
      }, 1000);
    });
  }

  function pruneBubbles() {
    while (roomState.activeBubbles.length > 3) {
      const oldBubble = roomState.activeBubbles.shift();
      oldBubble.remove();
    }
  }

  function setSpeech(turn) {
    const now = Date.now();
    // Batch 4 (post-test fix #2): chunks of the same speaker preserve earlier
    // bubbles. Only fade when the speaker actually changes (turn.isContinuation
    // means "more text from the same speaker — don't fade what they just said").
    if (!turn.isContinuation) {
      fadePreviousBubbles();
      roomState.speakerStack = [];   // new speaker — start a fresh vertical stack
    }
    roomState.lastBubbleAt = now;
    liveStatusText.textContent = roomState.holdingFloor ? 'Listening' : 'Live';

    const isHumanSpeaker = turn.isUser === true || turn.speaker === USER_DISPLAY_NAME;
    const bubble = document.createElement('div');
    bubble.className = `speech${isHumanSpeaker ? ' user-turn' : ''}${turn.toUser ? ' to-user' : ''}`;
    // Continuation bubbles drop the speaker label (it's a continuation of the
    // previous bubble's speaker) so the eye doesn't re-parse the name.
    // §3d: a turn addressed to the user carries a "→ you" tag so the room reads
    // "this one is for me" — it rides on the name, so only the first bubble.
    const toYouTag = turn.toUser ? '<span class="to-you-tag">→ you</span>' : '';
    const nameHtml = turn.isContinuation
      ? ''
      : `<div class="speech-name">${escapeHtml(turn.speaker)}${toYouTag}</div>`;
    bubble.innerHTML = `${nameHtml}<p></p>`;
    placeBubble(bubble, turn.speaker);
    speechLayer.appendChild(bubble);

    const textTarget = bubble.querySelector('p');

    // No-overlap stacking, PROGRESSIVE: the newest bubble sits at the base
    // (nearest the speaker); older same-speaker bubbles ride above it and are
    // nudged up a little each time THIS bubble grows by a line. A ResizeObserver
    // tracks this bubble's height and re-lifts the older ones live. The .speech
    // transform reads --stack-up; its transition animates each nudge.
    if (!roomState.speakerStack) roomState.speakerStack = [];
    if (roomState.stackObserver) { roomState.stackObserver.disconnect(); roomState.stackObserver = null; }
    if (turn.isContinuation && roomState.speakerStack.length) {
      const GAP = 10;
      const older = roomState.speakerStack.slice();   // oldest..newest, all done typing
      // fixed spacing each older bubble keeps above the GROWING base bubble
      const between = [];
      let acc = 0;
      for (let i = older.length - 1; i >= 0; i--) {
        between[i] = acc;
        acc += older[i].offsetHeight + GAP;
      }
      const relift = () => {
        const baseH = bubble.offsetHeight;
        for (let i = 0; i < older.length; i++) {
          older[i].style.setProperty('--stack-up', (baseH + GAP + between[i]) + 'px');
        }
      };
      relift();
      if (typeof ResizeObserver !== 'undefined') {
        roomState.stackObserver = new ResizeObserver(relift);
        roomState.stackObserver.observe(bubble);
      }
    }
    roomState.speakerStack.push(bubble);

    roomState.activeBubbles.push(bubble);
    pruneBubbles();

    // Batch 4 (post-test fix #4): user typing slightly faster than agents
    // (their words echo what they themselves typed, no need to "read").
    const speed = isHumanSpeaker ? 26 : 40;
    const typingDone = typeLine(textTarget, turn.line, [], speed);
    addRoomLog(turn.speaker, escapeHtml(turn.line));
    roomState.lastSpeaker = turn.speaker;
    roomState.recentSpeakers = [turn.speaker, ...roomState.recentSpeakers.filter(name => name !== turn.speaker)].slice(0, 3);
    return typingDone;
  }

  // Batch 4 (post-test fix #2): split long agent turns into multiple bubbles.
  // < 200 chars → single bubble. Otherwise group sentences into ≤ ~180-char
  // chunks. Renders each chunk via setSpeech with isContinuation flag so
  // earlier chunks stay visible until the next speaker arrives.
  function splitIntoChunks(text) {
    if (!text) return [''];
    if (text.length < 200) return [text];
    const sentences = text.match(/[^.!?\n]+(?:[.!?]+|\n+|$)/g) || [text];
    const chunks = [];
    let current = '';
    for (const s of sentences) {
      const trimmed = s.trim();
      if (!trimmed) continue;
      const proposed = current ? `${current} ${trimmed}` : trimmed;
      if (proposed.length > 180 && current.length > 0) {
        chunks.push(current);
        current = trimmed;
      } else {
        current = proposed;
      }
    }
    if (current) chunks.push(current);
    return chunks.length ? chunks : [text];
  }

  async function setSpeechChunked(turn) {
    const chunks = splitIntoChunks(turn.line || '');
    for (let i = 0; i < chunks.length; i++) {
      // Batch 4 (post-test floor fix): bail if Sienna took the floor mid-
      // chunking. Without this, the remaining chunks would render and
      // fadePreviousBubbles would wipe Sienna's "I have something to say"
      // bubble. Only applies to AI turns (Sienna's own chunks ignore the
      // flag because she's the one rendering them).
      if (!turn.isUser && roomState.holdingFloor) break;
      await setSpeech({
        speaker:        turn.speaker,
        line:           chunks[i],
        isUser:         !!turn.isUser,
        isContinuation: turn.continuation || i > 0,   // turn.continuation: stack on the previous turn (same speaker), don't fade it
        toUser:         !!turn.toUser,                 // §3d: carry the "→ you" marker through chunking
      });
      if (i < chunks.length - 1) {
        // Pause between same-speaker chunks — gives the eye time to land (+1s).
        await new Promise(r => setTimeout(r, 1700));
      }
    }
  }

  // ── §3d user-facing turn ────────────────────────────────────────────────
  // A character can turn from the conversation to address the user directly.
  // The whole affordance is deliberately one element: a single ghost "Ignore"
  // button that pops up by the input bar. Answering is just the normal
  // type-and-Send. Doing nothing for 30s counts as silence. Two ignores or
  // timeouts and the room stops turning to the user (§3d.1). The room flow is
  // never blocked — scripted/agent turns keep streaming while the button waits.
  function armUserFacingTurn(speaker) {
    if (!ignoreButton) return;
    if (roomState.userFacing) return;                       // one solicitation at a time
    if (roomState.userFacingAskedBy.has(speaker)) return;   // §3d.1: a character never re-asks
    roomState.userFacingAskedBy.add(speaker);
    // Two-strike rule: after two ignores/timeouts the turn still renders, but
    // no input affordance appears — the user stays a silent observer (§3d.1).
    if (roomState.userFacingStrikes >= 2) {
      addRoomLog('Room', `${escapeHtml(speaker)} turned to you — left unprompted (you’ve stepped back twice).`);
      return;
    }
    roomState.userFacing = { speaker };
    clearTimeout(roomState.userFacingTimer);
    ignoreButton.classList.add('visible');
    if (roomInput && !roomState.paused) roomInput.focus();  // answer path is ready, no extra UI
    roomState.userFacingTimer = setTimeout(() => resolveUserFacing('__TIMEOUT__'), 30000);
  }

  function resolveUserFacing(response) {
    if (!roomState.userFacing) return;
    const { speaker } = roomState.userFacing;
    clearTimeout(roomState.userFacingTimer);
    roomState.userFacingTimer = null;
    roomState.userFacing = null;
    if (ignoreButton) ignoreButton.classList.remove('visible');

    const ignored  = response === '__IGNORED__';
    const timedOut = response === '__TIMEOUT__';
    if (ignored || timedOut) roomState.userFacingStrikes += 1;

    routeUserResponse(response, speaker);

    // One terse line in the existing history log so ignore / timeout / answer
    // is observable (the button just vanishes otherwise). No floating chrome.
    const verb = ignored ? 'let it pass' : timedOut ? 'stayed quiet' : 'answered';
    addRoomLog('You', `${verb}${speaker ? ` — ${escapeHtml(speaker)} had turned to you` : ''}.`);
    if (roomState.userFacingStrikes === 2) {
      addRoomLog('Room', 'You’ve stepped back twice — the room won’t turn to you again.');
    }
  }

  // Front-end side of the §3d contract. The orchestrator is meant to receive
  // user_response: <text | __IGNORED__ | __TIMEOUT__>. The backend wiring for
  // that lives in the (not-yet-built) dialogue layer, so we don't fabricate an
  // endpoint here — we surface the payload locally. The showcase needs no
  // backend; the live room is left untouched until the orchestrator exists.
  function routeUserResponse(response, speaker) {
    roomState.lastUserResponse = { response, speaker: speaker || null, at: Date.now() };
    console.log('[user_response]', JSON.stringify({ user_response: response, to: speaker || null }));
  }

  // ── Batch 4: assign backend characters to fixed UI slots, then update
  // the DOM name labels + hotspot data-character attributes so the existing
  // click handlers continue to work.
  function assignCharacterSlots(characters) {
    characterSlotByName = {};
    // Sienna sits at "Me". Register BOTH the composer's per-room name AND
    // the canonical USER_DISPLAY_NAME, so any bubble whose speaker is either
    // string resolves to the user slot. Defensive: prevents Sienna's send
    // button (which uses USER_DISPLAY_NAME) from landing the bubble at the
    // host slot when the backend's Sienna override hasn't applied.
    const user = characters.find(c => c.is_user);
    if (user) {
      characterSlotByName[user.name] = 'Me';
      characterSlotByName[USER_DISPLAY_NAME] = 'Me';
    }

    // Host gets slot3 (centre-back of the room)
    const host = characters.find(c => c.is_host);
    if (host) characterSlotByName[host.name] = 'slot3';

    // AI characters fill the remaining slots in order: slot1, slot2, slot4, slot5
    const aiSlotOrder = ['slot1', 'slot2', 'slot4', 'slot5'];
    const ais = characters.filter(c => !c.is_user && !c.is_host);
    ais.forEach((c, i) => {
      if (i < aiSlotOrder.length) characterSlotByName[c.name] = aiSlotOrder[i];
    });

    // Update DOM name labels + hotspot data-character mapping.
    // Strategy: find all .name-label.ai elements in DOM order, assign the
    // first to the host, then the rest to AI characters in order.
    const aiLabels = document.querySelectorAll('.name-label.ai');
    const aiHotspots = document.querySelectorAll('.character-hotspot');
    const orderedAiNames = []
      .concat(host ? [host.name] : [])
      .concat(ais.map(c => c.name));
    aiLabels.forEach((label, i) => {
      const name = orderedAiNames[i];
      if (name) {
        label.textContent = name;
        const slot = characterSlotByName[name];
        const pos = SLOT_POSITIONS[slot];
        if (pos) {
          label.style.left = `${pos.x}%`;
          label.style.top  = `${pos.y}%`;
        }
      } else {
        label.style.display = 'none';
      }
    });
    aiHotspots.forEach((hotspot, i) => {
      const name = orderedAiNames[i];
      if (name) {
        hotspot.dataset.character = name;
        const slot = characterSlotByName[name];
        const pos = SLOT_POSITIONS[slot];
        if (pos) {
          hotspot.style.left = `${pos.x}%`;
          hotspot.style.top  = `${pos.y + 1.5}%`;  // hotspot slightly below label
        }
      } else {
        hotspot.style.display = 'none';
      }
    });

    // Me label always renders the canonical USER_DISPLAY_NAME — never the
    // composer's per-room random pick — so the room shows "Sienna" even if
    // the backend regresses on its server-side name override.
    const meLabel = document.querySelector('.name-label.human');
    if (meLabel) meLabel.textContent = USER_DISPLAY_NAME;
  }

  // ── Batch 4: server-driven turn loop. Each /turn returns one agent turn.
  // We schedule the next one after the typing animation finishes (so the
  // user actually gets to read each line). closing=true halts the loop.
  async function scheduleNextTurn() {
    if (roomState.showcase) return;   // showcase replays a hardcoded transcript, not /turn
    if (roomState.paused || roomState.holdingFloor || roomState.closing) return;
    // Batch 4 (post-test fix #1): yield the loop to a user-initiated turn.
    // sendButton sets userTurnPending so the autonomous loop can't race it.
    if (roomState.userTurnPending) return;
    if (roomState.inFlightTurn) return;  // dedup; prevent overlapping requests

    roomState.inFlightTurn = true;
    // Batch 4 (post-test floor fix): expose an abort handle so claimFloor /
    // sendButton can cancel the fetch when Sienna interrupts. The server
    // still completes the orchestrator turn (it's in dialogue_history); the
    // front end just doesn't render the response.
    roomState.currentTurnAbort = new AbortController();
    try {
      const res = await fetch('/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: roomState.sessionId }),
        signal: roomState.currentTurnAbort.signal,
      });
      if (!res.ok) {
        liveStatusText.textContent = 'Error';
        console.error('POST /turn failed', res.status, await res.text());
        return;
      }
      const data = await res.json();
      // Bail early if Sienna took the floor between the fetch and the render.
      if (roomState.holdingFloor || roomState.userTurnPending) return;
      // Batch 4 (post-test fix #2): chunk long responses into multiple bubbles.
      await setSpeechChunked({
        speaker: data.speaker_name,
        line:    data.response_text,
        isUser:  false,
        toUser:  !!data.to_user,   // §3d: orchestrator flags a turn aimed at the user
      });
      // §3d: pop the "Ignore" affordance when the orchestrator addressed the
      // user. No-op until the (not-yet-built) dialogue layer sets to_user.
      if (data.to_user) armUserFacingTurn(data.speaker_name);
      if (data.closing) {
        roomState.closing = true;
        renderClosingSummary(data.closing);
        return;
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        // Intentional abort (Sienna interrupted). Silent — no error banner.
        return;
      }
      console.error('POST /turn error', err);
      liveStatusText.textContent = 'Error';
      return;
    } finally {
      roomState.inFlightTurn = false;
      roomState.currentTurnAbort = null;
    }
    // Batch 4 (post-test fix #3): slower inter-turn pacing — gives the room
    // breath. 2400ms × atmosphere ≈ 2.0s intellectual / 2.8s chill / 3.1s poetic.
    const atm = atmosphereSettings[roomState.atmosphere] || atmosphereSettings.intellectual;
    roomState.timer = setTimeout(scheduleNextTurn, Math.round(2400 * atm.delay));
  }

  function clearScheduledTurn() {
    clearTimeout(roomState.timer);
  }

  // ── Batch 4: render the once-per-session closing summary as a bubble in
  // a distinct style. Simple structured render — front-end-design pass is
  // a separate concern, not part of this batch.
  function renderClosingSummary(closing) {
    fadePreviousBubbles();
    liveStatusText.textContent = 'Closed';
    const summary = closing.summary || {};
    const claims = summary.carryover_claims || [];
    const anatomy = summary.session_anatomy || {};

    const div = document.createElement('div');
    div.className = 'speech closing-summary';
    div.style.left = '50%';
    div.style.top = '38%';
    div.style.setProperty('--bubble-offset-x', '-50%');
    div.style.maxWidth = '520px';
    div.style.background = 'rgba(255,255,255,0.96)';
    div.style.border = '1px solid rgba(0,0,0,0.12)';
    div.style.borderRadius = '14px';
    div.style.padding = '18px 22px';
    div.style.boxShadow = '0 18px 48px rgba(0,0,0,0.18)';
    div.style.fontSize = '14px';
    div.style.lineHeight = '1.45';
    div.style.zIndex = '5';

    let html = `<div class="speech-name" style="font-weight:600;margin-bottom:8px">
                  Closing summary <span style="color:#888;font-weight:400">
                  · trigger: ${escapeHtml(closing.trigger || '')}</span>
                </div>`;

    html += `<div style="margin-bottom:10px">
              <div style="font-weight:600;margin-bottom:4px">Carry-over claims</div>
              <ul style="margin:0;padding-left:18px">`;
    claims.forEach(c => {
      html += `<li style="margin-bottom:4px">
                 <em>${escapeHtml(c.kind || '')}</em> — ${escapeHtml(c.text || '')}
                 <div style="color:#666;font-size:12.5px">${escapeHtml(c.why_it_matters || '')}</div>
               </li>`;
    });
    html += `</ul></div>`;

    const block = (label, items) => {
      if (!items || items.length === 0) return '';
      let h = `<div style="margin-top:8px"><div style="font-weight:600">${label}</div><ul style="margin:2px 0 0;padding-left:18px">`;
      items.forEach(t => { h += `<li>${escapeHtml(t)}</li>`; });
      h += `</ul></div>`;
      return h;
    };
    html += block('Divergences',    anatomy.divergences);
    html += block('Convergences',   anatomy.convergences);
    html += block('Discoveries',    anatomy.discoveries);
    html += block('Thinking modes', anatomy.thinking_modes);

    div.innerHTML = html;
    speechLayer.appendChild(div);
    roomState.activeBubbles.push(div);
    addRoomLog('Closing', escapeHtml(`trigger=${closing.trigger}, claims=${claims.length}`));
  }

  // ── Batch 4: bootstrap the session against the backend, render the
  // opening dialogue inline, then start the autonomous /turn loop.
  async function startRoom() {
    roomState.atmosphere = sessionStorage.getItem('manyMinds.atmosphere') || 'intellectual';
    roomState.userClaim  = sessionStorage.getItem('manyMinds.claim')
                         || "I don't think humans can love one person forever.";
    // Show the thought the user brought in, on the far-left card.
    const _uic = document.getElementById('userInputText');
    if (_uic) _uic.textContent = roomState.userClaim;
    roomState.started = true;
    roomState.paused = false;
    roomState.holdingFloor = false;
    roomState.closing = false;
    roomState.turnIndex = 0;
    roomState.recentSpeakers = [];
    roomState.activeBubbles = [];
    roomState.lastBubbleAt = 0;
    clearScheduledTurn();
    speechLayer.innerHTML = '';
    roomLog.innerHTML = '';
    experience.classList.remove('paused', 'holding-floor');
    floorButton.classList.remove('active');
    floorButton.textContent = 'I have something to say';
    restButton.textContent = 'Call for a break';
    liveStatusText.textContent = 'Connecting…';

    // Invite-mode UI removed in Batch 4 (no backend equivalent yet).
    document.querySelectorAll('.invite-only').forEach((el) => {
      el.classList.add('is-hidden');
    });

    // Batch 4 buffer page: if buffer.html already ran the /session SSE and
    // stashed the ready payload in sessionStorage, use it directly and skip
    // our own SSE call. Keeps room.html as the fallback path for direct
    // navigation to /room.html (no buffer step), so nothing breaks if
    // someone bookmarks the room URL.
    const cachedSessionId = sessionStorage.getItem('manyMinds.sessionId');
    if (cachedSessionId) {
      try {
        roomState.sessionId  = cachedSessionId;
        roomState.characters = JSON.parse(sessionStorage.getItem('manyMinds.characters') || '[]');
        const openingTurns   = JSON.parse(sessionStorage.getItem('manyMinds.openingTurns') || '[]');

        assignCharacterSlots(roomState.characters);
        liveStatusText.textContent = 'Live';

        for (const turn of openingTurns) {
          await setSpeechChunked({
            speaker: turn.speaker_name,
            line:    turn.response_text,
            isUser:  false,
          });
        }
      } finally {
        // One-shot — clear so a tab reload doesn't try to reuse a dead session.
        sessionStorage.removeItem('manyMinds.sessionId');
        sessionStorage.removeItem('manyMinds.characters');
        sessionStorage.removeItem('manyMinds.openingTurns');
      }
      scheduleNextTurn();
      return;
    }

    // No cached payload — fall through to the original SSE-driven path
    // (direct navigation to room.html, or a future code path that doesn't
    // use the buffer page). Up to 2 attempts: first composer_hard_fail
    // triggers silent retry; otherwise structured error card.
    let success = false;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const outcome = await runSessionStream();
      if (outcome === 'success') { success = true; break; }
      if (outcome === 'composer_hard_fail' && attempt === 1) {
        liveStatusText.textContent = 'Trying a different angle…';
        clearTransitionalCards();
        continue;
      }
      // Terminal failure: composer_hard_fail on retry, or any other error.
      const message = (outcome === 'composer_hard_fail')
        ? 'This topic was hard to find real disagreement on. Try rephrasing or pick a different belief.'
        : (outcome && outcome.message)
          || "Couldn't start the room. Please try again.";
      showStructuredError(message);
      return;
    }
    if (!success) return;
    scheduleNextTurn();
  }

  // ── Batch 4 (SSE): consume the /session event stream.
  // Returns 'success' | 'composer_hard_fail' | {message}.
  async function runSessionStream() {
    let res;
    try {
      res = await fetch('/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          belief: roomState.userClaim,
          atmosphere: roomState.atmosphere,
        }),
      });
    } catch (err) {
      console.error('startRoom network error', err);
      return { message: "Couldn't reach the server. Is it running?" };
    }
    if (!res.ok || !res.body) {
      return { message: `Couldn't start the room (HTTP ${res.status}).` };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let outcome = null;
    let readyData = null;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE events are separated by blank lines (\n\n). Drain complete blocks.
      let sep;
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const block = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const evt = parseSseBlock(block);
        if (!evt) continue;

        if (evt.type === 'stage') {
          liveStatusText.textContent = evt.data.message || 'Working…';
        } else if (evt.type === 'character') {
          renderCharacterCard(evt.data);
        } else if (evt.type === 'ready') {
          readyData = evt.data;
        } else if (evt.type === 'error') {
          if (evt.data.error === 'composer_hard_fail') {
            outcome = 'composer_hard_fail';
          } else {
            outcome = { message: evt.data.message || 'Server error.' };
          }
        }
      }
    }

    if (outcome) return outcome;
    if (!readyData) return { message: 'Stream ended without a ready event.' };

    // ── Apply the ready payload: lock slot assignments + render opening
    roomState.sessionId  = readyData.session_id;
    roomState.characters = readyData.characters || [];
    assignCharacterSlots(roomState.characters);
    fadeTransitionalCards();
    liveStatusText.textContent = 'Live';
    for (const turn of (readyData.opening_turns || [])) {
      await setSpeechChunked({
        speaker: turn.speaker_name,
        line:    turn.response_text,
        isUser:  false,
      });
    }
    return 'success';
  }

  function parseSseBlock(block) {
    const lines = block.split('\n');
    let type = 'message';
    const dataLines = [];
    for (const line of lines) {
      if (line.startsWith('event:')) type = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
    }
    if (!dataLines.length) return null;
    try { return { type, data: JSON.parse(dataLines.join('\n')) }; }
    catch (e) { console.warn('SSE parse failed', e, block); return null; }
  }

  // ── Batch 4 (SSE): show a transient intro card for each character as the
  // composer streams them in. Slot assignment is provisional here; the
  // authoritative DOM update happens in assignCharacterSlots() once the
  // 'ready' event arrives with the full ordered character list.
  function renderCharacterCard(char) {
    // Reserve a slot so the card appears at the right on-screen position.
    let slot;
    if (char.is_user)      slot = 'Me';
    else if (char.is_host) slot = 'slot3';
    else {
      const aiOrder = ['slot1', 'slot2', 'slot4', 'slot5'];
      const taken = new Set(Object.values(characterSlotByName));
      slot = aiOrder.find(s => !taken.has(s)) || 'slot4';
    }
    characterSlotByName[char.name] = slot;

    const pos = SLOT_POSITIONS[slot];
    if (!pos) return;

    const card = document.createElement('div');
    card.className = 'character-intro-card';
    card.innerHTML = `
      <div style="font-weight:600">${escapeHtml(char.name)}</div>
      <div style="font-size:12px;color:#888;margin-top:2px">${
        char.is_host ? 'Host' :
        char.is_user ? 'You' :
        escapeHtml(char.stance || 'Participant')
      }</div>
    `;
    Object.assign(card.style, {
      position:      'absolute',
      left:          `${pos.x}%`,
      top:           `${pos.y}%`,
      transform:     'translate(-50%, -110%)',
      background:    'rgba(255,255,255,0.96)',
      border:        '1px solid rgba(0,0,0,0.08)',
      borderRadius:  '10px',
      padding:       '8px 14px',
      fontSize:      '13px',
      color:         '#222',
      boxShadow:     '0 6px 22px rgba(0,0,0,0.16)',
      opacity:       '0',
      transition:    'opacity 0.5s ease',
      zIndex:        '4',
      pointerEvents: 'none',
      whiteSpace:    'nowrap',
    });
    speechLayer.appendChild(card);
    requestAnimationFrame(() => { card.style.opacity = '1'; });

    if (!roomState.transitionalCards) roomState.transitionalCards = [];
    roomState.transitionalCards.push(card);
    addRoomLog(char.name, char.is_host ? 'joined as host' : (char.is_user ? 'is you' : 'joined the room'));
  }

  function fadeTransitionalCards() {
    (roomState.transitionalCards || []).forEach(card => {
      card.style.opacity = '0';
      setTimeout(() => card.remove(), 500);
    });
    roomState.transitionalCards = [];
  }

  function clearTransitionalCards() {
    (roomState.transitionalCards || []).forEach(card => card.remove());
    roomState.transitionalCards = [];
    // Reset provisional slot reservations so the retry can re-assign cleanly.
    characterSlotByName = {};
  }

  // ── Batch 4 (post-test fix): structured failure card. Used when /session
  // can't return a usable room (composer hard-fail after retry, or network
  // failure). Replaces opaque "Error" status text with a readable message
  // so the user knows what to do (rephrase or pick another belief).
  function showStructuredError(message) {
    liveStatusText.textContent = 'Failed';
    fadePreviousBubbles();
    const div = document.createElement('div');
    div.className = 'speech';
    div.style.left = '50%';
    div.style.top = '40%';
    div.style.setProperty('--bubble-offset-x', '-50%');
    div.style.maxWidth = '440px';
    div.style.background = 'rgba(255,255,255,0.96)';
    div.style.border = '1px solid rgba(0,0,0,0.12)';
    div.style.borderRadius = '12px';
    div.style.padding = '16px 20px';
    div.style.boxShadow = '0 12px 32px rgba(0,0,0,0.16)';
    div.style.fontSize = '14px';
    div.style.lineHeight = '1.5';
    div.style.color = '#222';
    div.style.zIndex = '5';
    div.innerHTML = `<div style="font-weight:600;margin-bottom:6px">Couldn't start the room</div>
                     <div>${escapeHtml(message)}</div>
                     <div style="margin-top:10px;font-size:12.5px;color:#666">
                       <a href="index.html" style="color:#666;text-decoration:underline">Back to start</a>
                     </div>`;
    speechLayer.appendChild(div);
    roomState.activeBubbles.push(div);
  }

  // ── Profile card click handlers (preserved from mock).
  // Now reads name from data-character (set by assignCharacterSlots) and
  // shows a minimal card — backend doesn't yet expose stake/interrupt/
  // challenges, so we display stance + name + the call-character buttons.
  document.querySelectorAll('.character-hotspot').forEach((hotspot) => {
    hotspot.addEventListener('click', () => {
      const name = hotspot.dataset.character;
      const char = roomState.characters.find(c => c.name === name);
      if (!char) return;
      profileName.textContent = char.name;
      profileAge.textContent = char.role
        || (char.is_host ? 'Room host' : (char.stance || 'Participant'));
      // Render richer profile fields when the character carries them (the
      // showcase, or a future composer that emits bullets); otherwise blank.
      profileBullets.innerHTML = '';
      if (Array.isArray(char.bullets)) {
        for (const b of char.bullets) {
          const li = document.createElement('li');
          li.textContent = b;
          profileBullets.appendChild(li);
        }
      }
      profileMood.textContent = char.mood
        || (char.is_host
          ? 'Holds the room and keeps the question alive.'
          : `Stance: ${char.stance || 'unknown'}`);
      hostBadge.style.display = char.is_host ? 'inline-flex' : 'none';
      roomState.selectedCharacter = char.name;

      const rect = hotspot.getBoundingClientRect();
      const cardWidth = 176;
      const cardHeight = 190;
      callCharacterButton.dataset.character = char.name;
      privateConversationButton.dataset.character = char.name;

      let left = rect.left + rect.width + 12;
      let top  = rect.top - 12;
      if (left + cardWidth > window.innerWidth - 28) left = rect.left - cardWidth - 12;
      if (top + cardHeight > window.innerHeight - 28) top = window.innerHeight - cardHeight - 28;
      if (top < 28) top = 28;
      profileCard.style.left = `${left}px`;
      profileCard.style.top  = `${top}px`;
      profileCard.classList.add('visible');
    });
  });

  document.querySelector('.back-button').addEventListener('click', () => {
    clearScheduledTurn();
    roomState.started = false;
    experience.classList.remove('paused');
    experience.classList.remove('holding-floor');
    window.location.href = 'index.html';
    profileCard.classList.remove('visible');
    floorButton.textContent = 'I have something to say';
    restButton.textContent = 'Call for a break';
    liveStatusText.textContent = 'Live';
  });

  experience.addEventListener('click', (event) => {
    if (!event.target.closest('.character-hotspot') && !event.target.closest('.profile-card')) {
      profileCard.classList.remove('visible');
    }
  });

  historyToggle.addEventListener('click', () => {
    historyPanel.classList.toggle('collapsed');
    historyToggle.textContent = historyPanel.classList.contains('collapsed') ? '▤' : '−';
  });

  restButton.addEventListener('click', () => {
    const isPaused = experience.classList.toggle('paused');
    roomState.paused = isPaused;
    if (isPaused) clearScheduledTurn();
    restButton.textContent = isPaused ? 'Continue' : 'Call for a break';
    liveStatusText.textContent = isPaused ? 'Break' : 'Live';
    if (!isPaused && !roomState.closing) scheduleNextTurn();
  });

  // Invite-mode compare button: disabled in Batch 4.
  compareButton.addEventListener('click', () => { /* no-op (invite mode unsupported) */ });

  callCharacterButton.addEventListener('click', () => {
    const character = callCharacterButton.dataset.character;
    claimFloor(`${character}, `);
    profileCard.classList.remove('visible');
  });

  privateConversationButton.addEventListener('click', () => {
    const character = privateConversationButton.dataset.character;
    claimFloor(`${character}, can I ask you privately: `);
  });

  // Batch 4 (post-test floor fix): claimFloor renders two pre-bubbles —
  //   1. Sienna's "I have something to say" at the user slot.
  //   2. A short acknowledgment from the last AI speaker.
  // Any in-progress agent typing is cancelled in place (the bubble keeps
  // whatever's typed so far; it'll fade as the new bubbles arrive). No
  // backend call — these are pure UI affordances, not part of the dialogue
  // history the orchestrator sees.
  const FLOOR_ACKS = ['Sure.', 'Go ahead.', "I'm listening.", 'Yeah, go.', 'Please.'];

  async function claimFloor(prefix = '') {
    if (roomState.paused) return;
    if (roomState.closing) return;
    if (roomState.holdingFloor) return;  // already holding; ignore double-press

    // Set holdingFloor BEFORE the abort/drain so scheduleNextTurn won't
    // re-arm a timer, and setSpeechChunked exits its loop at the next
    // chunk boundary instead of fading Sienna's pre-bubbles.
    roomState.holdingFloor = true;
    clearScheduledTurn();
    cancelAllTyping();
    // Abort any in-flight autonomous /turn fetch. Response (if it arrives
    // anyway) gets dropped on the floor — server still has it in dialogue
    // history, so the next agent reads it; user just doesn't see it.
    if (roomState.currentTurnAbort) {
      try { roomState.currentTurnAbort.abort(); } catch (_) {}
    }
    // Drain: wait for the in-flight turn's catch/finally to run, and for
    // any mid-render setSpeechChunked to break out at the next chunk.
    // Each iteration re-cancels typing in case a new chunk just kicked off.
    const drainDeadline = Date.now() + 2500;
    while (roomState.inFlightTurn && Date.now() < drainDeadline) {
      cancelAllTyping();
      await new Promise(r => setTimeout(r, 60));
    }
    clearScheduledTurn();

    experience.classList.add('holding-floor');
    floorButton.classList.add('active');
    floorButton.textContent = 'Never Mind. Continue.';
    liveStatusText.textContent = 'Listening';

    if (prefix && !roomInput.value.trim()) {
      roomInput.value = prefix;
    }
    roomInput.focus();

    // (1) Sienna's "I have something to say" bubble.
    await setSpeech({
      speaker: USER_DISPLAY_NAME,
      line:    'I have something to say.',
      isUser:  true,
    });

    // (2) Brief ack from the most recent AI speaker (if any, and not Sienna
    // herself). If the user clicks the floor before any agent has spoken,
    // there's no one to acknowledge — just leave Sienna's bubble alone.
    const lastAi = roomState.lastSpeaker;
    if (lastAi && lastAi !== USER_DISPLAY_NAME) {
      await new Promise(r => setTimeout(r, 350));
      const ack = FLOOR_ACKS[Math.floor(Math.random() * FLOOR_ACKS.length)];
      await setSpeech({
        speaker: lastAi,
        line:    ack,
        isUser:  false,
      });
    }
  }

  floorButton.addEventListener('click', () => {
    if (roomState.holdingFloor) {
      // "Never Mind. Continue." — fade the pre-bubbles and resume the loop.
      clearScheduledTurn();
      roomState.holdingFloor = false;
      experience.classList.remove('holding-floor');
      floorButton.classList.remove('active');
      floorButton.textContent = 'I have something to say';
      liveStatusText.textContent = 'Live';
      fadePreviousBubbles();
      if (!roomState.closing) scheduleNextTurn();
      return;
    }
    claimFloor();
  });

  // §3d: the single "Ignore" affordance. Low-emphasis by design — clicking it
  // lets the room continue without an answer (counts as one strike). Native
  // <button>, so Tab → Enter works for keyboard users.
  if (ignoreButton) {
    ignoreButton.addEventListener('click', () => resolveUserFacing('__IGNORED__'));
  }

  // ── Batch 4: Send. Renders Sienna's bubble immediately, then POSTs /turn
  // with user_input. The backend writes Sienna to history, arms user_anchor,
  // registers any user→agent cue, and the returned turn is the agent that
  // engaged with her utterance. Then resume the autonomous loop.
  // Batch 4 (post-test fix #1): sendButton uses userTurnPending to safely
  // steal the loop from the autonomous /turn loop. Old bug: a silent bail
  // on `if (roomState.inFlightTurn) return;` made Sienna's bubble render
  // but the /turn with user_input never fire (~50% of clicks during a
  // typical turn cycle). New flow:
  //   1) Mark userTurnPending → autonomous scheduleNextTurn early-returns.
  //   2) Cancel any pending autonomous timer.
  //   3) Wait for any in-flight autonomous fetch+typing to settle.
  //   4) Render Sienna's bubble (chunked if long).
  //   5) POST /turn with user_input — guaranteed serialized.
  //   6) Render the agent's response.
  //   7) Clear userTurnPending, resume autonomous loop.
  sendButton.addEventListener('click', async () => {
    const value = roomInput.value.trim();
    if (!value) return;
    // §3d: if a character had turned to the user, typing + Send IS the answer
    // (no strike). Resolve it before the normal send path renders the bubble.
    if (roomState.userFacing) resolveUserFacing(value);
    if (roomState.showcase) {
      // Showcase: no backend — hand the line to the replay scheduler (R1–R5).
      cancelAllTyping();
      roomState.holdingFloor = false;
      experience.classList.remove('holding-floor');
      floorButton.classList.remove('active');
      floorButton.textContent = 'I have something to say';
      roomInput.value = '';
      roomState.pendingUserInput = value;
      return;
    }
    if (!roomState.sessionId) return;
    if (roomState.closing) return;
    if (roomState.userTurnPending) return;  // dedup double-clicks

    roomState.userTurnPending = true;
    clearScheduledTurn();
    // Batch 4 (post-test send fix): cancel any in-progress agent typing
    // RIGHT NOW. Without this, the agent that was mid-bubble when Send was
    // clicked keeps typing to completion (could be 5-10s on a long chunk),
    // and Sienna sees nothing happen until then. cancelAllTyping mirrors
    // what claimFloor does for the floor button — same asymmetry was a bug
    // for one and a feature for the other.
    cancelAllTyping();
    // Abort any in-flight autonomous /turn fetch — same reasoning as
    // claimFloor's abort. Response is in server-side dialogue_history
    // either way; front-end just drops the render.
    if (roomState.currentTurnAbort) {
      try { roomState.currentTurnAbort.abort(); } catch (_) {}
    }
    roomState.holdingFloor = false;
    experience.classList.remove('holding-floor');
    floorButton.classList.remove('active');
    floorButton.textContent = 'I have something to say';
    liveStatusText.textContent = 'Live';
    roomInput.value = '';

    // (3) Wait for any in-flight autonomous turn (fetch + typing) to settle.
    //     userTurnPending blocks NEW autonomous turns; this loop drains the
    //     one already in progress. With cancelAllTyping above, the typing
    //     portion of the in-flight turn resolves immediately, so this loop
    //     mostly just waits for the fetch (which can't be aborted) to land.
    while (roomState.inFlightTurn) {
      await new Promise(r => setTimeout(r, 80));
    }
    // Re-clear in case the autonomous loop re-armed a timer between the
    // initial clear and the in-flight drain.
    clearScheduledTurn();

    try {
      // (4) Render Sienna's bubble (chunked: rare for user input to be long,
      //     but the same path covers it cleanly). Uses USER_DISPLAY_NAME so
      //     placeBubble's slot lookup always resolves to the user's seat.
      await setSpeechChunked({ speaker: USER_DISPLAY_NAME, line: value, isUser: true });

      // (5) POST /turn with user_input — orchestrator runs on_user_input
      //     (arms anchor + classifies direction + registers cue), then the
      //     next agent turn.
      roomState.inFlightTurn = true;
      let data;
      try {
        const res = await fetch('/turn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: roomState.sessionId, user_input: value }),
        });
        if (!res.ok) {
          liveStatusText.textContent = 'Error';
          console.error('POST /turn (with user_input) failed', res.status, await res.text());
          return;
        }
        data = await res.json();
      } finally {
        roomState.inFlightTurn = false;
      }

      // (6) Render agent response (chunked).
      await setSpeechChunked({
        speaker: data.speaker_name,
        line:    data.response_text,
        isUser:  false,
      });
      if (data.closing) {
        roomState.closing = true;
        renderClosingSummary(data.closing);
        return;
      }
    } catch (err) {
      console.error('sendButton handler error', err);
      liveStatusText.textContent = 'Error';
      return;
    } finally {
      // (7) Release the loop.
      roomState.userTurnPending = false;
    }
    scheduleNextTurn();
  });

  roomInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      sendButton.click();
    }
  });

  // ── Showcase mode (room_showcase.html). Replays a hardcoded transcript
  // through the SAME render paths the live room uses (assignCharacterSlots,
  // setSpeechChunked, the profile-card click handler). No backend. It also
  // accepts USER input under a few deterministic rules (no model):
  //   R1  Send renders the user's line as a bubble.
  //   R2  If the line names a seated character, THAT character replies (to you).
  //   R3  If no name is found, the HOST replies (and nudges you to name someone).
  //   R4  After the reply, the scripted conversation continues at the next turn.
  //   R5  Sending cancels in-progress typing so you're not left waiting.
  function _scSleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  // Beat between turns; bail early when the user has sent something (R5).
  async function _scBeat(ms) {
    let t = 0;
    while (t < ms) {
      if (roomState.pendingUserInput != null) return;
      await _scSleep(120);
      t += 120;
    }
  }

  // R2: the seated character the user named (by display name or id), or null.
  function _scDetectCalled(text, characters) {
    const t = (text || '').toLowerCase();
    for (const c of characters) {
      if (c.is_user) continue;
      const name = (c.name || '').toLowerCase();
      if (name && t.includes(name)) return c;
      if (c.id && t.includes(String(c.id).toLowerCase())) return c;
    }
    return null;
  }

  function _scHost(characters) {
    return characters.find((c) => c.is_host && !c.is_user)
        || characters.find((c) => !c.is_user)
        || null;
  }

  // R1–R3: render the user's bubble, then the chosen responder's reply.
  async function _scUserTurn(text, data) {
    await setSpeechChunked({ speaker: USER_DISPLAY_NAME, line: text, isUser: true });
    await _scSleep(450);
    const named = _scDetectCalled(text, roomState.characters);
    const responder = named || _scHost(roomState.characters);
    if (!responder) return;
    const replies = data.cueReplies || {};
    const reply = named
      ? (replies[responder.name]
          || `You're asking me directly. ${responder.role ? '(' + responder.role + ') ' : ''}Here's where I sit.`)
      : (data.defaultReply
          || replies[responder.name]
          || "Nobody named — call one of us by name and I'll hand you straight to them.");
    await setSpeechChunked({ speaker: responder.name, line: reply, isUser: false });
    await _scSleep(1000);
  }

  async function startShowcase(data) {
    roomState.showcase = true;
    roomState.atmosphere = 'intellectual';
    roomState.userClaim = data.belief || '';
    roomState.characters = data.characters || [];
    roomState.pendingUserInput = null;
    roomState.scriptIdx = 0;
    roomState.started = true;
    // §3d: fresh user-facing state for this run.
    roomState.userFacing = null;
    roomState.userFacingStrikes = 0;
    roomState.userFacingAskedBy = new Set();
    clearTimeout(roomState.userFacingTimer);
    if (ignoreButton) ignoreButton.classList.remove('visible');

    const uic = document.getElementById('userInputText');
    if (uic) uic.textContent = roomState.userClaim;

    document.querySelectorAll('.invite-only').forEach((el) => el.classList.add('is-hidden'));
    assignCharacterSlots(roomState.characters);
    speechLayer.innerHTML = '';
    roomLog.innerHTML = '';
    liveStatusText.textContent = 'Showcase';

    const turns = data.turns || [];
    while (true) {
      while (roomState.paused || roomState.holdingFloor) { await _scSleep(150); }
      if (roomState.pendingUserInput != null) {            // a user message is waiting
        const text = roomState.pendingUserInput;
        roomState.pendingUserInput = null;
        await _scUserTurn(text, data);                     // R1–R3
        continue;                                          // R4: then the next scripted turn
      }
      if (roomState.scriptIdx < turns.length) {
        const turn = turns[roomState.scriptIdx++];
        // Consecutive turns from the same speaker stack (don't fade) — e.g. a
        // long turn followed by that same person's quieter coda (T23→T24). A
        // turn addressed to the user is never a continuation (it needs its own
        // name + "→ you" tag).
        const cont = !turn.toUser && turn.speaker === roomState.lastSpeaker;
        await setSpeechChunked({ speaker: turn.speaker, line: turn.text, isUser: !!turn.isUser, continuation: cont, toUser: !!turn.toUser });
        if (turn.toUser) armUserFacingTurn(turn.speaker);   // §3d: the single "Ignore" pops up
        await _scBeat(2400);   // +1s gap between turns
      } else {
        liveStatusText.textContent = 'Showcase · your turn — type, name someone to call on them';
        await _scSleep(300);
      }
    }
  }

  if (window.__MM_SHOWCASE__) {
    startShowcase(window.__MM_SHOWCASE__);
  } else {
    startRoom();
  }
