// Buffer page.
// Starts character composing as soon as the page loads. The user can choose a
// room while the backend works; after selection, profile cards arrive in the
// selected room. For the current visual demo, DEMO_MODE paces mock cards every
// 5s. Flip DEMO_MODE to false to consume the existing /session SSE stream.

(async function () {
  const DEMO_MODE = true;
  const DEMO_CARD_INTERVAL_MS = 5000;
  const PAUSE_BEFORE_REDIRECT_MS = 900;

  const rooms = [
    {
      id: 'hearth',
      name: 'Hearth Library',
      vibe: 'warm, bookish, a little dangerous',
      image: 'assets/pixel-room-reference.png',
    },
    {
      id: 'salon',
      name: 'Velvet Salon',
      vibe: 'slow arguments under amber lamps',
      image: 'assets/room-salon.png',
    },
    {
      id: 'greenhouse',
      name: 'Glasshouse',
      vibe: 'fresh air for complicated thoughts',
      image: 'assets/room-greenhouse.png',
    },
    {
      id: 'observatory',
      name: 'Rooftop Observatory',
      vibe: 'night sky, city noise, sharp ideas',
      image: 'assets/room-observatory.png',
    },
  ];

  const demoCharacters = [
    {
      name: 'Mira',
      title: 'Urban sociologist of neighborhood trust',
      bullets: [
        'Tracks who gets left out',
        'Reads policy through daily life',
      ],
      stance: 'conflicted',
      claim_stance: 'Sees the useful part of your belief, but keeps tugging at the cost.',
      personal_stakes: 'Has watched tidy answers make messy people feel invisible.',
    },
    {
      name: 'Jonah',
      title: 'Product lead for civic software',
      bullets: [
        'Asks what users actually do',
        'Spots the adoption bottleneck',
      ],
      stance: 'defends',
      claim_stance: 'Wants to make the strongest version of the idea before anyone attacks it.',
      personal_stakes: 'Gets impatient when nuance becomes an excuse to never choose.',
    },
    {
      name: 'Leah',
      title: 'Behavioral scientist of belief change',
      bullets: [
        'Tests what would change minds',
        'Separates evidence from story',
      ],
      stance: 'rejects',
      claim_stance: 'Pushes against the premise and asks what evidence would actually change it.',
      personal_stakes: 'Has been burned by confident systems that ignored lived texture.',
    },
    {
      name: 'Rafi',
      title: 'Infrastructure operations analyst',
      bullets: [
        'Maps the practical bottleneck',
        'Checks who pays the cost',
      ],
      stance: 'indifferent',
      claim_stance: 'Keeps asking whether this belief matters in practice or only sounds important.',
      personal_stakes: 'Trusts boring constraints more than beautiful theories.',
    },
    {
      name: 'Sol',
      title: 'Conversation designer for hard topics',
      bullets: [
        'Keeps disagreement usable',
        'Turns tension into questions',
      ],
      stance: 'host',
      is_host: true,
      claim_stance: 'Keeps the room moving without letting anyone flatten the question.',
      personal_stakes: 'Here to make the conversation feel alive, not merely correct.',
    },
  ];

  const els = {
    roomPickerStage: document.getElementById('roomPickerStage'),
    callingStage: document.getElementById('callingStage'),
    roomPickerGrid: document.getElementById('roomPickerGrid'),
    roomChangeButton: document.getElementById('roomChangeButton'),
    roomSwitchPanel: document.getElementById('roomSwitchPanel'),
    roomPreviewModal: document.getElementById('roomPreviewModal'),
    roomPreviewImage: document.getElementById('roomPreviewImage'),
    previewUseButton: document.getElementById('previewUseButton'),
    previewCloseButton: document.getElementById('previewCloseButton'),
    enterRoomButton: document.getElementById('enterRoomButton'),
    cardsContainer: document.getElementById('bufferCards'),
    subtitle: document.getElementById('bufferSubtitle'),
    progress: document.getElementById('bufferProgress'),
  };

  const belief = sessionStorage.getItem('manyMinds.claim');
  const atmosphere = sessionStorage.getItem('manyMinds.atmosphere') || 'intellectual';

  const state = {
    cards: [],
    readyData: null,
    expectedCards: demoCharacters.length,
    selectedRoom: null,
    startedCallingUi: false,
    composerPromise: null,
    composerResult: null,
    previewRoom: null,
    finished: false,
  };

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function trim(text, max) {
    if (!text) return '';
    const s = String(text).trim();
    if (s.length <= max) return s;
    const cut = s.slice(0, max);
    const sp = cut.lastIndexOf(' ');
    return (sp > max * 0.6 ? cut.slice(0, sp) : cut) + '...';
  }

  function roleTextFor(character) {
    if (character.title) return character.title;
    if (character.is_user) return 'You';
    if (character.is_host) return 'Host';
    const prettyStance = {
      defends: 'Defends',
      rejects: 'Rejects',
      conflicted: 'Conflicted',
      indifferent: 'Pragmatist',
      host: 'Host',
    };
    return prettyStance[character.stance] || character.stance || 'Participant';
  }

  function cardBulletsFor(character) {
    const source = Array.isArray(character.bullets)
      ? character.bullets
      : [
          character.bullet_1,
          character.bullet_2,
          character.claim_stance,
          character.personal_stakes,
        ];
    const bullets = source
      .filter(Boolean)
      .map((text) => trim(text, 54))
      .slice(0, 2);

    while (bullets.length < 2) {
      bullets.push(bullets.length === 0 ? 'Brings a distinct angle' : 'Keeps the room honest');
    }
    return bullets;
  }

  function zoomIcon() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="7"/><path d="m20 20-4.2-4.2"/><path d="M11 8v6"/><path d="M8 11h6"/></svg>';
  }

  function renderRoomOptions(container, mode) {
    container.innerHTML = '';
    rooms.forEach((room) => {
      const option = document.createElement('div');
      option.className = 'room-option';
      option.dataset.roomId = room.id;
      option.style.setProperty('--room-image', `url('${room.image}')`);
      option.innerHTML = `
        <button class="room-option-main" type="button" aria-label="${escapeHtml(room.name)}: ${escapeHtml(room.vibe)}">
          <span class="room-option-content">
            <span class="room-option-name">${escapeHtml(room.name)}</span>
            <span class="room-option-vibe">${escapeHtml(room.vibe)}</span>
          </span>
        </button>
        <button class="room-zoom-button" type="button" aria-label="Preview ${escapeHtml(room.name)}" title="Preview">
          ${zoomIcon()}
        </button>
      `;
      option.querySelector('.room-option-main').addEventListener('click', () => {
        if (mode === 'switch') {
          applyRoom(room);
          closeRoomSwitchPanel();
        } else {
          selectRoom(room);
        }
      });
      option.querySelector('.room-zoom-button').addEventListener('click', () => openRoomPreview(room));
      container.appendChild(option);
    });
    updateSelectedRoomMarkers();
  }

  function renderRoomPicker() {
    renderRoomOptions(els.roomPickerGrid, 'pick');
    renderRoomOptions(els.roomSwitchPanel, 'switch');
  }

  function updateSelectedRoomMarkers() {
    document.querySelectorAll('.room-option').forEach((option) => {
      option.classList.toggle('selected', option.dataset.roomId === state.selectedRoom?.id);
    });
  }

  function applyRoom(room) {
    state.selectedRoom = room;
    document.documentElement.style.setProperty('--selected-room-image', `url('${room.image}')`);
    document.body.classList.add('room-selected');
    sessionStorage.setItem('manyMinds.roomChoice', JSON.stringify(room));
    updateSelectedRoomMarkers();
  }

  function selectRoom(room) {
    if (state.startedCallingUi) return;
    state.startedCallingUi = true;
    applyRoom(room);
    els.roomPickerStage.classList.remove('active');
    els.callingStage.classList.add('active');
    startCardReveal();
  }

  function openRoomPreview(room) {
    state.previewRoom = room;
    els.roomPreviewImage.style.setProperty('--preview-room-image', `url('${room.image}')`);
    els.previewUseButton.textContent = state.startedCallingUi ? 'Switch to this room' : 'Use this room';
    els.roomPreviewModal.classList.add('open');
    els.roomPreviewModal.setAttribute('aria-hidden', 'false');
  }

  function closeRoomPreview() {
    els.roomPreviewModal.classList.remove('open');
    els.roomPreviewModal.setAttribute('aria-hidden', 'true');
  }

  function usePreviewRoom() {
    if (!state.previewRoom) return;
    if (state.startedCallingUi) {
      applyRoom(state.previewRoom);
      closeRoomSwitchPanel();
    } else {
      selectRoom(state.previewRoom);
    }
    closeRoomPreview();
  }

  function toggleRoomSwitchPanel() {
    const isOpen = els.roomSwitchPanel.classList.toggle('open');
    els.roomChangeButton.setAttribute('aria-expanded', String(isOpen));
  }

  function closeRoomSwitchPanel() {
    els.roomSwitchPanel.classList.remove('open');
    els.roomChangeButton.setAttribute('aria-expanded', 'false');
  }

  function resetCards() {
    state.cards = [];
    els.cardsContainer.innerHTML = '';
    els.enterRoomButton.classList.remove('visible');
    updateProgress();
  }

  function addCard(character) {
    if (state.cards.length > 0) {
      markCardHere(state.cards[state.cards.length - 1]);
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'buffer-card-wrapper';

    const label = document.createElement('div');
    label.className = 'buffer-card-label';
    label.textContent = 'Calling';

    const card = document.createElement('div');
    card.className = 'buffer-card';
    card.dataset.initial = (character.name || '?').trim().slice(0, 1).toUpperCase();

    const nameEl = document.createElement('div');
    nameEl.className = 'buffer-card-name';
    nameEl.textContent = character.name || '?';

    const roleEl = document.createElement('div');
    roleEl.className = 'buffer-card-role';
    roleEl.textContent = roleTextFor(character);

    const headEl = document.createElement('div');
    headEl.className = 'buffer-card-head';
    headEl.appendChild(nameEl);
    headEl.appendChild(roleEl);
    card.appendChild(headEl);

    const bulletsEl = document.createElement('ul');
    bulletsEl.className = 'buffer-card-bullets';
    cardBulletsFor(character).forEach((bullet) => {
      const li = document.createElement('li');
      li.textContent = bullet;
      bulletsEl.appendChild(li);
    });

    const bodyEl = document.createElement('div');
    bodyEl.className = 'buffer-card-body';
    bodyEl.appendChild(bulletsEl);
    card.appendChild(bodyEl);

    wrapper.appendChild(label);
    wrapper.appendChild(card);
    els.cardsContainer.appendChild(wrapper);

    state.cards.push({ wrapper, label, character });
    state.expectedCards = Math.max(state.expectedCards, state.cards.length);

    requestAnimationFrame(() => wrapper.classList.add('visible'));
    updateProgress();
  }

  function markCardHere(cardEntry) {
    if (!cardEntry || cardEntry.wrapper.classList.contains('here')) return;
    cardEntry.label.textContent = 'Arrived';
    cardEntry.wrapper.classList.add('here');
    updateProgress();
  }

  function markAllHere() {
    state.cards.forEach(markCardHere);
  }

  function countHere() {
    return state.cards.filter(c => c.wrapper.classList.contains('here')).length;
  }

  function updateProgress() {
    if (!els.progress) return;
    const here = countHere();
    if (state.cards.length === 0) {
      els.progress.textContent = '';
      els.progress.classList.remove('ready');
    } else if (here >= state.expectedCards && state.readyData) {
      els.progress.textContent = 'The conversation is ready';
      els.progress.classList.add('ready');
    } else {
      els.progress.textContent = `${here} of ${state.expectedCards} minds here`;
      els.progress.classList.remove('ready');
    }
  }

  function showError(message, isTerminal = false) {
    state.finished = true;
    els.cardsContainer.innerHTML = '';
    els.enterRoomButton.classList.remove('visible');
    const div = document.createElement('div');
    div.className = 'buffer-error';
    div.innerHTML = `
      <h3>${isTerminal ? "Couldn't start the room" : "Couldn't bring the room together"}</h3>
      <p>${escapeHtml(message)}</p>
      <p><a href="index.html">Back to start</a></p>
    `;
    els.cardsContainer.appendChild(div);
    if (els.subtitle) els.subtitle.style.display = 'none';
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

  function createDemoReadyData(characters) {
    return {
      session_id: `demo-${Date.now()}`,
      characters,
      opening_turns: [],
    };
  }

  async function startDemoComposer() {
    // Simulates the backend composing immediately while the user chooses a room.
    await new Promise(r => setTimeout(r, 1200));
    return createDemoReadyData(demoCharacters);
  }

  async function runStream() {
    if (!belief) {
      return { message: 'No belief was entered. Please go back to the start.', terminal: true };
    }

    let res;
    try {
      res = await fetch('/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          belief,
          atmosphere,
          room: state.selectedRoom ? state.selectedRoom.id : null,
        }),
      });
    } catch (err) {
      console.error('buffer fetch error', err);
      return { message: "Couldn't reach the server. Is it running?" };
    }
    if (!res.ok || !res.body) {
      return { message: `Server error (HTTP ${res.status}).` };
    }

    const streamedCharacters = [];
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let outcome = null;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      let sep;
      while ((sep = buf.indexOf('\n\n')) !== -1) {
        const block = buf.slice(0, sep);
        buf = buf.slice(sep + 2);
        const evt = parseSseBlock(block);
        if (!evt) continue;

        if (evt.type === 'character') {
          streamedCharacters.push(evt.data);
        } else if (evt.type === 'ready') {
          outcome = evt.data;
          outcome.characters = outcome.characters || streamedCharacters;
        } else if (evt.type === 'error') {
          if (evt.data.error === 'composer_hard_fail') {
            return 'composer_hard_fail';
          }
          return { message: evt.data.message || 'Server error.' };
        }
      }
    }

    if (!outcome) return { message: "The room didn't come together. Please try again." };
    return outcome;
  }

  async function startComposer() {
    if (DEMO_MODE) return startDemoComposer();

    for (let attempt = 1; attempt <= 2; attempt++) {
      const outcome = await runStream();
      if (outcome === 'composer_hard_fail' && attempt === 1) continue;
      if (outcome === 'composer_hard_fail') {
        return {
          message: 'This topic was hard to find real disagreement on. Try rephrasing or pick a different belief.',
          terminal: true,
        };
      }
      return outcome;
    }
    return { message: "Couldn't bring the room together." };
  }

  async function startCardReveal() {
    resetCards();

    const result = await state.composerPromise;
    state.composerResult = result;

    if (result && result.message) {
      showError(result.message, result.terminal);
      return;
    }

    const characters = Array.isArray(result.characters) && result.characters.length
      ? result.characters
      : demoCharacters;

    state.readyData = result;
    state.expectedCards = characters.length;
    updateProgress();

    for (const character of characters) {
      if (state.finished) return;
      addCard(character);
      await new Promise(r => setTimeout(r, DEMO_CARD_INTERVAL_MS));
    }

    markAllHere();
    updateProgress();
    showEnterRoomButton();
  }

  function showEnterRoomButton() {
    window.setTimeout(() => {
      els.enterRoomButton.classList.add('visible');
    }, PAUSE_BEFORE_REDIRECT_MS);
  }

  function enterRoom() {
    if (!state.readyData) return;
    sessionStorage.setItem('manyMinds.sessionId', state.readyData.session_id);
    sessionStorage.setItem('manyMinds.characters', JSON.stringify(state.readyData.characters));
    sessionStorage.setItem('manyMinds.openingTurns', JSON.stringify(state.readyData.opening_turns || []));
    window.location.href = 'room.html';
  }

  renderRoomPicker();
  els.roomChangeButton.addEventListener('click', toggleRoomSwitchPanel);
  els.enterRoomButton.addEventListener('click', enterRoom);
  els.previewCloseButton.addEventListener('click', closeRoomPreview);
  els.previewUseButton.addEventListener('click', usePreviewRoom);
  els.roomPreviewModal.addEventListener('click', (event) => {
    if (event.target === els.roomPreviewModal) closeRoomPreview();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    closeRoomPreview();
    closeRoomSwitchPanel();
  });
  state.composerPromise = startComposer();
})();
