// Community — static prototype.
// Three post types: reflection (share only), live room (watch only),
// invitation (join to start a room). Plus a filter and a sidebar.
(function () {
  // ---------------------------------------------------------------------------
  // Data
  // ---------------------------------------------------------------------------
  const posts = [
    {
      type: "live",
      id: "lv-attention",
      title: "Who really owns your attention?",
      timeAgo: "now",
      input: "Who owns your attention?",
      room: { title: "The Attention Economy", color: "#63f0bd" },
      inside: [
        { name: "Noor A.", color: "#63f0bd" },
        { name: "Kai L.", color: "#ff6250" },
        { name: "Wren M.", color: "#a886ff" }
      ],
      watching: 38
    },
    {
      type: "reflection",
      id: "p-google",
      author: "Lena O.", avatarColor: "#ff6250", timeAgo: "2h",
      title: "The IPO was never a finance story",
      reflection: "I walked in sure it was about money. I left realizing it was about who gets to decide what the internet is for.",
      cover: "linear-gradient(135deg,#ff6250,#ffb38a 55%,#a886ff)",
      from: "Google Without IPO",
      likes: 54
    },
    {
      type: "invite",
      id: "iv-age",
      host: { name: "Ada N.", color: "#6fe0c0" },
      timeAgo: "4h",
      title: "Looking for 3 minds: should we age?",
      prompt: "Should we choose to stop aging if we could?",
      room: { title: "Should We Age?", color: "#6fe0c0" },
      roomCode: "age7q2",
      waiting: 2
    },
    {
      type: "reflection",
      id: "p-love",
      author: "Mira K.", avatarColor: "#a886ff", timeAgo: "3d",
      title: "What 'forever' was actually protecting",
      reflection: "I came in to argue nobody loves forever. I left more curious about what the word was trying to keep safe.",
      cover: "linear-gradient(135deg,#a886ff,#f0a6ff 60%,#63f0bd)",
      from: "Can Love Last Forever?",
      likes: 120
    },
    {
      type: "live",
      id: "lv-freewill",
      title: "Is free will just a useful story?",
      timeAgo: "now",
      input: "Do we actually have free will?",
      room: { title: "Free Will on Trial", color: "#f2c778" },
      inside: [
        { name: "Theo M.", color: "#f2c778" },
        { name: "Sol P.", color: "#63f0bd" }
      ],
      watching: 22
    },
    {
      type: "invite",
      id: "iv-privacy",
      host: { name: "Theo M.", color: "#f2a64d" },
      timeAgo: "1d",
      title: "Open room — is privacy already over?",
      prompt: "Is privacy already a lost cause?",
      room: { title: "Privacy's End", color: "#f2a64d" },
      roomCode: "prv5x8",
      waiting: 1
    }
  ];

  const relays = [
    {
      id: "relay-consent",
      title: "Who consents to the future?",
      links: [
        { contributor: "Daanish R.", avatarColor: "#d8ff36", keyword: "Future Generations",
          question: "Do we have the right to hand risk to people who can't consent?" },
        { contributor: "Lena O.", avatarColor: "#ff6250", keyword: "Consent",
          question: "If they can't consent, is acting in their interest care — or just power?" },
        { contributor: "Mira K.", avatarColor: "#a886ff", keyword: "Memory",
          question: "Who gets remembered as having decided — and does memory let the future forgive us?" }
      ]
    },
    {
      id: "relay-attention",
      title: "What is attention worth?",
      links: [
        { contributor: "Sol P.", avatarColor: "#63f0bd", keyword: "Attention",
          question: "If attention is the scarce resource, who is allowed to spend yours?" },
        { contributor: "Ravi N.", avatarColor: "#f2c778", keyword: "Trust",
          question: "Can you trust a system that profits when your attention is misspent?" }
      ]
    }
  ];

  const relayPalette = ["Power", "Care", "Scale", "Time", "Inheritance", "Myth", "Body", "Money", "Silence", "Risk"];
  const relayTemplates = [
    "What happens to {prev} once {next} enters the room?",
    "If {next} is the real stake, does {prev} still matter as much?",
    "Where does {prev} end and {next} begin?",
    "Can you hold {prev} and {next} at the same time?",
    "What does {next} quietly ask of {prev}?"
  ];
  const YOU_COLOR = "#d8a85f";

  const FILTERS = [
    { key: "all", label: "All" },
    { key: "reflection", label: "Reflections" },
    { key: "live", label: "Live" },
    { key: "invite", label: "Invites" }
  ];

  let currentRelay = 0;
  let currentFilter = "all";
  let bqConfirmTimer = null;

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }
  function initials(name) {
    return name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  }
  function inviteLink(code) {
    return `${location.href.replace(/[^/]*$/, "index.html")}?room=${code}`;
  }
  function avatarStack(people) {
    return `<span class="iv-stack">${people
      .map((m) => `<span class="iv-av" style="background:${m.color}">${initials(m.name)}</span>`)
      .join("")}</span>`;
  }

  // ---------------------------------------------------------------------------
  // Filter
  // ---------------------------------------------------------------------------
  function renderFilter() {
    const el = document.getElementById("feedFilter");
    if (!el) return;
    el.innerHTML = FILTERS.map((f) =>
      `<button class="filter-tab${f.key === currentFilter ? " active" : ""}" type="button" data-filter="${f.key}">${f.label}</button>`
    ).join("");
    el.querySelectorAll("[data-filter]").forEach((b) =>
      b.addEventListener("click", () => { currentFilter = b.dataset.filter; renderFilter(); renderFeed(); }));
  }

  // ---------------------------------------------------------------------------
  // Feed — three post types
  // ---------------------------------------------------------------------------
  function reflectionMarkup(p, i, delay) {
    const media = p.cover ? `<div class="post-cover" style="background:${p.cover}"></div>` : "";
    const from = p.from ? `<div class="post-from">From <em>${escapeHtml(p.from)}</em></div>` : "";
    return `
      <article class="post" style="animation-delay:${delay}ms">
        <div class="post-body">
          <div class="post-byline">
            <span class="post-avatar" style="background:${p.avatarColor}">${initials(p.author)}</span>
            <span class="post-author">${escapeHtml(p.author)}</span>
            <span class="post-sep">·</span>
            <span class="post-time">${escapeHtml(p.timeAgo)}</span>
          </div>
          <h2 class="post-title">${escapeHtml(p.title)}</h2>
          <p class="post-dek">${escapeHtml(p.reflection)}</p>
          ${from}
          <div class="post-react">
            <button class="react-like" type="button" data-like="${i}">
              <span class="like-icon">♡</span> <span class="like-count">${p.likes}</span>
            </button>
            <button class="react-save" type="button" data-save="${i}">Save</button>
          </div>
        </div>
        ${media}
      </article>`;
  }

  function liveMarkup(p, i, delay) {
    return `
      <article class="live-post" style="animation-delay:${delay}ms">
        <div class="lp-top">
          <span class="live-badge"><span class="live-dot"></span> Live</span>
          <span class="lp-room"><span class="post-room-dot" style="background:${p.room.color}"></span>${escapeHtml(p.room.title)}</span>
        </div>
        <h2 class="live-title">${escapeHtml(p.title)}</h2>
        <div class="live-meta">
          ${avatarStack(p.inside)}
          <span class="live-meta-text">${p.inside.length} inside · ${p.watching} watching</span>
        </div>
        <div class="post-actions">
          <button class="watch-btn" type="button" data-watch="${i}">Step in to watch</button>
          <span class="live-note">Watch only — you can't join the conversation</span>
        </div>
      </article>`;
  }

  function inviteMarkup(p, i, delay) {
    const pend = Array.from({ length: p.waiting }).map(() => `<span class="iv-av iv-pend"></span>`).join("");
    return `
      <article class="invite-post" style="animation-delay:${delay}ms">
        <div class="invite-top">
          <span class="invite-tag">Invitation</span>
          <span class="invite-by">${escapeHtml(p.host.name)} · ${escapeHtml(p.timeAgo)}</span>
        </div>
        <h2 class="invite-title">${escapeHtml(p.title)}</h2>
        <p class="invite-prompt">“${escapeHtml(p.prompt)}”</p>
        <div class="post-room">
          <span class="post-room-dot" style="background:${p.room.color}"></span>
          <span class="post-room-title">${escapeHtml(p.room.title)}</span>
        </div>
        <div class="invite-waiting">
          <span class="iv-stack">
            <span class="iv-av" style="background:${p.host.color}">${initials(p.host.name)}</span>
            ${pend}
          </span>
          <span class="iv-wait-text">${p.waiting} waiting to join</span>
        </div>
        <div class="post-actions">
          <button class="cc-step" type="button" data-join="${i}">Join the room</button>
          <button class="cc-invite" type="button" data-invite="${i}">Copy invite</button>
        </div>
      </article>`;
  }

  function renderFeed() {
    const feed = document.getElementById("communityFeed");
    if (!feed) return;
    const list = posts.filter((p) => currentFilter === "all" || p.type === currentFilter);
    feed.innerHTML = list.map((p, n) => {
      const i = posts.indexOf(p);
      const delay = n * 55;
      if (p.type === "live") return liveMarkup(p, i, delay);
      if (p.type === "invite") return inviteMarkup(p, i, delay);
      return reflectionMarkup(p, i, delay);
    }).join("") || `<p class="feed-empty">Nothing here yet.</p>`;

    feed.querySelectorAll("[data-watch]").forEach((b) =>
      b.addEventListener("click", () => stepIn(posts[+b.dataset.watch].input)));
    feed.querySelectorAll("[data-join]").forEach((b) =>
      b.addEventListener("click", () => stepIn(posts[+b.dataset.join].prompt)));
    feed.querySelectorAll("[data-invite]").forEach((b) =>
      b.addEventListener("click", () => copyInvite(b, posts[+b.dataset.invite].roomCode)));
    feed.querySelectorAll("[data-like]").forEach((b) =>
      b.addEventListener("click", () => toggleLike(b, posts[+b.dataset.like])));
    feed.querySelectorAll("[data-save]").forEach((b) =>
      b.addEventListener("click", () => toggleSave(b, posts[+b.dataset.save])));
  }

  function toggleLike(btn, p) {
    p.liked = !p.liked;
    p.likes += p.liked ? 1 : -1;
    btn.classList.toggle("liked", p.liked);
    btn.querySelector(".like-icon").textContent = p.liked ? "♥" : "♡";
    btn.querySelector(".like-count").textContent = p.likes;
  }

  function toggleSave(btn, p) {
    p.saved = !p.saved;
    btn.classList.toggle("saved", p.saved);
    btn.textContent = p.saved ? "Saved" : "Save";
  }

  function stepIn(claim) {
    try {
      sessionStorage.setItem("manyMinds.mode", "single");
      sessionStorage.setItem("manyMinds.claim", claim);
      sessionStorage.setItem("manyMinds.atmosphere", "intellectual");
      sessionStorage.removeItem("manyMinds.friendClaim");
      sessionStorage.removeItem("manyMinds.contrast");
    } catch (e) {}
    window.location.href = "buffer.html";
  }

  async function copyInvite(btn, code) {
    const link = inviteLink(code);
    try {
      await navigator.clipboard.writeText(link);
    } catch (e) {
      const tmp = document.createElement("textarea");
      tmp.value = link; document.body.appendChild(tmp); tmp.select();
      try { document.execCommand("copy"); } catch (e2) {}
      tmp.remove();
    }
    const original = btn.textContent;
    btn.textContent = "Copied!";
    btn.classList.add("copied");
    window.setTimeout(() => { btn.textContent = original; btn.classList.remove("copied"); }, 1600);
  }

  // ---------------------------------------------------------------------------
  // Sidebar — Living question (relay) + Happening now
  // ---------------------------------------------------------------------------
  function renderRelay(opts) {
    const band = document.getElementById("relayBand");
    if (!band) return;
    const r = relays[currentRelay];
    const last = r.links[r.links.length - 1];
    const newKw = opts && opts.added;
    const chain = r.links.map((lk, idx) => {
      const isNew = idx === r.links.length - 1 && newKw;
      return `<span class="side-kw${isNew ? " is-new" : ""}" title="added by ${escapeHtml(lk.contributor)}">${escapeHtml(lk.keyword)}</span>` +
        (idx < r.links.length - 1 ? `<span class="side-arr">→</span>` : "");
    }).join("");
    const others = relays.map((rr, i) => (i === currentRelay ? "" :
      `<button class="side-relay-switch" type="button" data-relay="${i}">${escapeHtml(rr.title)}</button>`)).join("");

    band.innerHTML = `
      <div class="side-head"><span class="relay-tag">Build a question · together</span></div>
      <p class="bq-note">Everyone adds one word. The question keeps rewriting itself.</p>
      <p class="bq-example" aria-hidden="true">
        <span class="bq-ex-chip">Risk</span> ＋ <span class="bq-ex-chip">Consent</span> ＝ <em>“who consents to the risk?”</em>
      </p>
      <p class="bq-confirm" id="bqConfirm" hidden></p>
      <div class="bq-current">
        <span class="bq-label">The question right now</span>
        <p class="side-relay-q" id="bqQuestion">${escapeHtml(last.question)}</p>
      </div>
      <div class="bq-words">
        <span class="bq-label">Words people added</span>
        <div class="side-chain">${chain}</div>
      </div>
      <button class="relay-add-btn" type="button" id="relayAddBtn">Add a word →</button>
      <div class="relay-palette" id="relayPalette" hidden></div>
      ${others ? `<div class="side-others"><span class="side-others-label">More questions</span>${others}</div>` : ""}`;

    if (newKw) {
      const conf = band.querySelector("#bqConfirm");
      conf.innerHTML = `You added “${escapeHtml(newKw)}”. The question became 👇`;
      conf.hidden = false;
      clearTimeout(bqConfirmTimer);
      bqConfirmTimer = window.setTimeout(() => { conf.hidden = true; }, 2500);
    }

    const addBtn = band.querySelector("#relayAddBtn");
    const palette = band.querySelector("#relayPalette");
    addBtn.addEventListener("click", () => {
      if (palette.hidden) {
        palette.innerHTML = relayPalette
          .map((k) => `<button class="relay-pick" type="button" data-kw="${escapeHtml(k)}">${escapeHtml(k)}</button>`).join("");
        palette.hidden = false;
        palette.querySelectorAll("[data-kw]").forEach((b) =>
          b.addEventListener("click", () => addWord(b.dataset.kw)));
      } else {
        palette.hidden = true;
      }
    });
    band.querySelectorAll("[data-relay]").forEach((b) =>
      b.addEventListener("click", () => { currentRelay = Number(b.dataset.relay); renderRelay(); }));
  }

  function addWord(keyword) {
    const r = relays[currentRelay];
    const prev = r.links[r.links.length - 1].keyword;
    const tpl = relayTemplates[r.links.length % relayTemplates.length];
    const question = tpl.replace("{prev}", prev).replace("{next}", keyword);
    r.links.push({ contributor: "You", avatarColor: YOU_COLOR, keyword, question });
    renderRelay({ added: keyword });
  }

  function renderHappening() {
    const el = document.getElementById("sideInvites");
    if (!el) return;
    const items = posts.filter((p) => p.type === "live" || p.type === "invite");
    el.innerHTML =
      `<div class="side-head"><span class="side-label">Happening now</span></div>` +
      items.map((p) => {
        const i = posts.indexOf(p);
        const isLive = p.type === "live";
        const sub = isLive ? `${p.watching} watching` : `${p.waiting} waiting`;
        return `
          <button class="side-active" type="button" data-jump="${i}" data-type="${p.type}">
            <span class="side-tdot ${isLive ? "is-live" : "is-invite"}"></span>
            <span class="side-invite-body">
              <span class="side-invite-title">${escapeHtml(p.room.title)}</span>
              <span class="side-invite-sub">${isLive ? "Live" : "Invite"} · ${sub}</span>
            </span>
          </button>`;
      }).join("");
    el.querySelectorAll("[data-jump]").forEach((b) =>
      b.addEventListener("click", () => {
        currentFilter = b.dataset.type;
        renderFilter();
        renderFeed();
        window.scrollTo({ top: 0, behavior: "smooth" });
      }));
  }

  function init() {
    renderFilter();
    renderFeed();
    renderRelay();
    renderHappening();
  }

  if (document.readyState !== "loading") init();
  else document.addEventListener("DOMContentLoaded", init);
})();
