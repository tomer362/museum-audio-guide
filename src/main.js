// ═══════════════════════════════════════════════════════
// MUSEUM AUDIO GUIDE — main.js
// Format: museum-audio-guide/v1
// ═══════════════════════════════════════════════════════

import { ARTIST_COLORS, SPEED_STEPS } from './constants.js';
import { buildLlmPrompt } from './llmPrompt.js';
import { escHtml, escAttr, showToast, typeIcon } from './utils.js';
import {
  ttsCallbacks, ttsMode, initKokoro,
  speak, pauseSpeech, resumeSpeech, stopSpeech,
  isSpeaking, isPaused, getProgress,
} from './tts.js';

// ── App state ──────────────────────────────────────────────────────────────────
let museumData = null;
let filteredArtworks = [];
let currentIndex = -1;
let currentArtworkId = null;
let isPlaying = false;
let activeFloor = 'all';
let playbackRate = 1.0;
let progressTimer = null;
let openModalArtworkId = null;  // which artwork is open in detail modal

// ── TTS callbacks ──────────────────────────────────────────────────────────────
ttsCallbacks.onstart = (duration) => {
  isPlaying = true;
  startProgressTimer();
  updatePlayerUI();
  updateAllCards();
  updateModalPlayBtn();
};
ttsCallbacks.onend = () => {
  isPlaying = false;
  clearInterval(progressTimer);
  document.getElementById('seekbar-fill').style.width = '100%';
  updatePlayerUI();
  updateAllCards();
  updateModalPlayBtn();
  if (document.getElementById('autoplay-cb').checked) {
    setTimeout(playNext, 800);
  }
};
ttsCallbacks.onerror = () => {
  isPlaying = false;
  clearInterval(progressTimer);
  updatePlayerUI();
};
ttsCallbacks.onStatusChange = (msg) => {
  const el = document.getElementById('tts-status');
  if (msg) {
    el.textContent = msg;
    el.style.display = '';
  } else {
    el.style.display = 'none';
  }
};

// ── Artist colour helpers ──────────────────────────────────────────────────────
function artistColor(name) {
  return ARTIST_COLORS[name] || '#888';
}

// ── File loading ───────────────────────────────────────────────────────────────
document.getElementById('btn-load-file').addEventListener('click', () => {
  document.getElementById('file-input').click();
});
document.getElementById('file-input').addEventListener('change', loadFile);

function loadFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      validateAndLoad(data);
    } catch (err) {
      showToast('❌ Invalid JSON file: ' + err.message);
    }
  };
  reader.readAsText(file);
}

function validateAndLoad(data) {
  if (!data.meta || !data.artworks || !Array.isArray(data.artworks)) {
    showToast('❌ Invalid format. Missing meta or artworks array.');
    return;
  }
  museumData = data;
  filteredArtworks = [...museumData.artworks];
  initApp();
}

document.getElementById('btn-reset').addEventListener('click', resetApp);

function resetApp() {
  stopSpeech();
  museumData = null;
  currentIndex = -1;
  currentArtworkId = null;
  isPlaying = false;
  activeFloor = 'all';
  clearInterval(progressTimer);
  document.getElementById('app').classList.remove('visible');
  document.getElementById('splash').style.display = '';
  document.getElementById('player-bar').classList.remove('visible');
  document.getElementById('file-input').value = '';
  closeArtworkModal();
}

// ── App init ───────────────────────────────────────────────────────────────────
function initApp() {
  const meta = museumData.meta;
  document.getElementById('museum-name').textContent = meta.name || 'Museum';
  document.getElementById('museum-meta').textContent =
    [meta.city, meta.established ? 'Est. ' + meta.established : null]
      .filter(Boolean).join(' · ');
  document.title = (meta.name || 'Museum') + ' · Audio Guide';

  buildFloorTabs();
  renderArtworks();

  document.getElementById('splash').style.display = 'none';
  document.getElementById('app').classList.add('visible');

  // Kokoro is loaded automatically on page load; nothing to show here
}

// ── Floor tabs ─────────────────────────────────────────────────────────────────
function buildFloorTabs() {
  const tabs = document.getElementById('floor-tabs');
  tabs.innerHTML = '';

  tabs.appendChild(makeTab('all', '⭐ All', activeFloor === 'all'));
  tabs.appendChild(makeTab('highlights', '✨ Highlights', activeFloor === 'highlights'));

  const floors = museumData.floors || [];
  floors.forEach(f => {
    tabs.appendChild(makeTab('floor_' + f.id, 'Floor ' + f.id + ' — ' + f.name, activeFloor === 'floor_' + f.id));
  });

  if (!floors.length) {
    const floorNums = [...new Set(museumData.artworks.map(a => a.floor).filter(f => f != null))].sort();
    floorNums.forEach(f => {
      tabs.appendChild(makeTab('floor_' + f, 'Floor ' + f, activeFloor === 'floor_' + f));
    });
  }
}

function makeTab(value, label, active) {
  const btn = document.createElement('button');
  btn.className = 'tab' + (active ? ' active' : '');
  btn.textContent = label;
  btn.onclick = () => { activeFloor = value; buildFloorTabs(); renderArtworks(); };
  return btn;
}

// ── Render artworks ────────────────────────────────────────────────────────────
function renderArtworks() {
  if (!museumData) return;
  const query = (document.getElementById('search-input').value || '').toLowerCase().trim();
  let artworks = museumData.artworks;

  if (activeFloor === 'highlights') {
    artworks = artworks.filter(a => a.highlight);
  } else if (activeFloor.startsWith('floor_')) {
    const floorId = parseInt(activeFloor.split('_')[1]);
    artworks = artworks.filter(a => a.floor === floorId);
  }

  if (query) {
    artworks = artworks.filter(a =>
      (a.title || '').toLowerCase().includes(query) ||
      (a.artist || '').toLowerCase().includes(query) ||
      (a.room || '').toLowerCase().includes(query) ||
      (a.wing || '').toLowerCase().includes(query) ||
      (a.tags || []).some(t => t.toLowerCase().includes(query))
    );
  }

  filteredArtworks = artworks;
  currentIndex = currentArtworkId ? filteredArtworks.findIndex(a => a.id === currentArtworkId) : -1;

  const main = document.getElementById('main');

  if (!artworks.length) {
    main.innerHTML = '<div class="empty-state"><div class="icon">🔍</div>No artworks found.</div>';
    return;
  }

  const grouped = {};
  artworks.forEach(a => {
    const key = a.wing || ('Floor ' + (a.floor != null ? a.floor : '?'));
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(a);
  });

  let html = '';
  for (const [section, items] of Object.entries(grouped)) {
    html += `<div class="section-heading">${escHtml(section)}</div>`;
    items.forEach(a => { html += cardHtml(a); });
  }
  main.innerHTML = html;
}

function cardHtml(a) {
  const color = artistColor(a.artist);
  const playing = a.id === currentArtworkId && isPlaying;
  return `
  <div class="artwork-card${playing ? ' playing' : ''}" id="card-${a.id}" data-id="${escAttr(a.id)}">
    <div class="card-color-bar" style="background:${color}"></div>
    <div class="card-body">
      <div class="card-top">
        <div class="card-info">
          <div class="card-title">${a.highlight ? '<span class="highlight-star">★</span>' : ''}${escHtml(a.title)}</div>
          <div class="card-artist">${escHtml(a.artist || '')}${a.medium ? ' · ' + escHtml(a.medium) : ''}</div>
          <div class="card-badges">
            ${a.room ? `<span class="badge room">Room ${escHtml(a.room)}</span>` : ''}
            ${a.year ? `<span class="badge year">${escHtml(a.year)}</span>` : ''}
            ${a.type ? `<span class="badge">${typeIcon(a.type)} ${escHtml(a.type)}</span>` : ''}
          </div>
        </div>
        <button class="btn-play${playing ? ' playing' : ''}" data-play="${escAttr(a.id)}" aria-label="Play audio for ${escAttr(a.title)}">
          ${playing ? '⏸' : '▶'}
        </button>
      </div>
    </div>
  </div>`;
}

// Delegated card click: clicking the card body opens the detail modal;
// clicking the play button plays/pauses.
document.getElementById('main').addEventListener('click', e => {
  const playBtn = e.target.closest('[data-play]');
  if (playBtn) {
    e.stopPropagation();
    playArtwork(playBtn.dataset.play);
    return;
  }
  const card = e.target.closest('[data-id]');
  if (card) {
    openArtworkModal(card.dataset.id);
  }
});

// ── Speech ─────────────────────────────────────────────────────────────────────
function playArtwork(id) {
  const artwork = museumData.artworks.find(a => a.id === id);
  if (!artwork) return;

  const idx = filteredArtworks.findIndex(a => a.id === id);

  if (currentArtworkId === id && isPlaying) {
    pauseSpeech();
    isPlaying = false;
    clearInterval(progressTimer);
    updatePlayerUI();
    updateAllCards();
    updateModalPlayBtn();
    return;
  }
  if (currentArtworkId === id && !isPlaying && isPaused()) {
    resumeSpeech(playbackRate);
    isPlaying = true;
    updatePlayerUI();
    updateAllCards();
    updateModalPlayBtn();
    return;
  }

  currentIndex = idx;
  startSpeaking(artwork);
}

function startSpeaking(artwork, startFraction) {
  startFraction = startFraction || 0;
  currentArtworkId = artwork.id;

  // Update player bar header info
  document.getElementById('player-bar').classList.add('visible');
  document.getElementById('player-title').textContent = artwork.title;
  document.getElementById('player-artist').textContent =
    (artwork.artist || '') + (artwork.year ? ' · ' + artwork.year : '');
  document.getElementById('seekbar-fill').style.width = (startFraction * 100) + '%';

  // Thumbnail
  const thumbImg = document.getElementById('player-thumb-img');
  const thumbEmoji = document.getElementById('player-thumb-emoji');
  if (artwork.imageUrl) {
    thumbImg.src = artwork.imageUrl;
    thumbImg.style.display = '';
    thumbEmoji.style.display = 'none';
    thumbImg.onerror = () => { thumbImg.style.display = 'none'; thumbEmoji.style.display = ''; };
  } else {
    thumbImg.style.display = 'none';
    thumbEmoji.style.display = '';
  }

  isPlaying = true;
  updatePlayerUI();
  updateAllCards();

  const text = buildSpeechText(artwork);
  speak(text, playbackRate, startFraction);
}

function buildSpeechText(a) {
  const desc = (a.audioDescription || a.description || '').trim();
  const intro = `${a.title}, by ${a.artist}.  `;
  return (desc.toLowerCase().startsWith(a.title.toLowerCase()) ? '' : intro) + desc;
}

document.getElementById('btn-main-play').addEventListener('click', togglePlay);

function togglePlay() {
  if (isPlaying) {
    pauseSpeech();
    isPlaying = false;
    clearInterval(progressTimer);
    updatePlayerUI();
    updateAllCards();
    updateModalPlayBtn();
  } else if (isPaused()) {
    resumeSpeech(playbackRate);
    isPlaying = true;
    updatePlayerUI();
    updateAllCards();
    updateModalPlayBtn();
  } else if (currentArtworkId && museumData) {
    const artwork = museumData.artworks.find(a => a.id === currentArtworkId);
    if (artwork) startSpeaking(artwork);
  }
}

document.getElementById('btn-next').addEventListener('click', playNext);
document.getElementById('btn-prev').addEventListener('click', playPrev);

function playNext() {
  if (!filteredArtworks.length) return;
  currentIndex = (currentIndex + 1) % filteredArtworks.length;
  startSpeaking(filteredArtworks[currentIndex]);
}

function playPrev() {
  if (!filteredArtworks.length) return;
  currentIndex = (currentIndex - 1 + filteredArtworks.length) % filteredArtworks.length;
  startSpeaking(filteredArtworks[currentIndex]);
}

// ── Speed control ──────────────────────────────────────────────────────────────
document.getElementById('btn-speed').addEventListener('click', cycleSpeed);

function cycleSpeed() {
  const idx = SPEED_STEPS.indexOf(playbackRate);
  playbackRate = SPEED_STEPS[(idx + 1) % SPEED_STEPS.length];
  document.getElementById('btn-speed').textContent = playbackRate + '×';
  if ((isPlaying || isPaused()) && currentArtworkId && museumData) {
    const artwork = museumData.artworks.find(a => a.id === currentArtworkId);
    if (artwork) {
      const fraction = getProgress();
      startSpeaking(artwork, fraction);
    }
  }
}

// ── Progress bar ───────────────────────────────────────────────────────────────
function startProgressTimer() {
  clearInterval(progressTimer);
  progressTimer = setInterval(() => {
    const pct = getProgress() * 100;
    document.getElementById('seekbar-fill').style.width = Math.min(pct, 100) + '%';
    if (pct >= 100) clearInterval(progressTimer);
  }, 300);
}

function setupSeekBar() {
  const bar = document.getElementById('player-seekbar');
  let dragging = false;

  function getFrac(clientX) {
    const rect = bar.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }
  function preview(f) { document.getElementById('seekbar-fill').style.width = (f * 100) + '%'; }

  bar.addEventListener('mousedown', e => {
    if (!currentArtworkId) return;
    dragging = true; bar.classList.add('seeking');
    clearInterval(progressTimer); preview(getFrac(e.clientX));
  });
  document.addEventListener('mousemove', e => { if (dragging) preview(getFrac(e.clientX)); });
  document.addEventListener('mouseup', e => {
    if (!dragging) return; dragging = false; bar.classList.remove('seeking');
    seekTo(getFrac(e.clientX));
  });
  bar.addEventListener('touchstart', e => {
    if (!currentArtworkId) return; e.preventDefault();
    dragging = true; bar.classList.add('seeking');
    clearInterval(progressTimer); preview(getFrac(e.touches[0].clientX));
  }, { passive: false });
  document.addEventListener('touchmove', e => { if (dragging) preview(getFrac(e.touches[0].clientX)); });
  document.addEventListener('touchend', e => {
    if (!dragging) return; dragging = false; bar.classList.remove('seeking');
    seekTo(getFrac(e.changedTouches[0].clientX));
  });
}

function seekTo(fraction) {
  if (!currentArtworkId || !museumData) return;
  const artwork = museumData.artworks.find(a => a.id === currentArtworkId);
  if (artwork) startSpeaking(artwork, fraction);
}

// ── UI helpers ─────────────────────────────────────────────────────────────────
function updatePlayerUI() {
  const btn = document.getElementById('btn-main-play');
  btn.textContent = isPlaying ? '⏸' : '▶';
}

function updateAllCards() {
  renderArtworks();
}

// ── Artwork detail modal ───────────────────────────────────────────────────────
function openArtworkModal(id) {
  const artwork = museumData && museumData.artworks.find(a => a.id === id);
  if (!artwork) return;
  openModalArtworkId = id;

  document.getElementById('artwork-modal-title').textContent = artwork.title;
  document.getElementById('artwork-modal-artist').textContent =
    (artwork.artist || '') + (artwork.year ? ' · ' + artwork.year : '');

  // Badges
  let badges = '';
  if (artwork.room) badges += `<span class="badge room">Room ${escHtml(artwork.room)}</span>`;
  if (artwork.medium) badges += `<span class="badge">${escHtml(artwork.medium)}</span>`;
  if (artwork.type) badges += `<span class="badge">${typeIcon(artwork.type)} ${escHtml(artwork.type)}</span>`;
  document.getElementById('artwork-modal-badges').innerHTML = badges;

  // Image
  const img = document.getElementById('artwork-modal-img');
  const placeholder = document.getElementById('artwork-modal-img-placeholder');
  if (artwork.imageUrl) {
    img.src = artwork.imageUrl;
    img.alt = artwork.title;
    img.style.display = '';
    placeholder.style.display = 'none';
    img.onerror = () => { img.style.display = 'none'; placeholder.style.display = ''; };
  } else {
    img.style.display = 'none';
    placeholder.style.display = '';
    placeholder.textContent = typeIcon(artwork.type);
  }

  // Description
  document.getElementById('artwork-modal-desc').textContent =
    artwork.audioDescription || artwork.description || 'No description available.';

  updateModalPlayBtn();
  document.getElementById('artwork-modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeArtworkModal() {
  document.getElementById('artwork-modal').classList.add('hidden');
  document.body.style.overflow = '';
  openModalArtworkId = null;
}

function updateModalPlayBtn() {
  const btn = document.getElementById('artwork-modal-play-btn');
  if (!btn) return;
  const isThisPlaying = openModalArtworkId === currentArtworkId && isPlaying;
  btn.textContent = isThisPlaying ? '⏸ Pause' : '▶ Play';
  btn.className = 'modal-play-btn' + (isThisPlaying ? ' playing' : '');
}

document.getElementById('artwork-modal-close').addEventListener('click', closeArtworkModal);
document.getElementById('artwork-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('artwork-modal')) closeArtworkModal();
});
document.getElementById('artwork-modal-play-btn').addEventListener('click', () => {
  if (openModalArtworkId) playArtwork(openModalArtworkId);
});
// Also open modal when clicking the player thumbnail/title
document.getElementById('player-track-info').addEventListener('click', () => {
  if (currentArtworkId) openArtworkModal(currentArtworkId);
});
document.getElementById('player-thumb').addEventListener('click', () => {
  if (currentArtworkId) openArtworkModal(currentArtworkId);
});

// ── LLM prompt modal ──────────────────────────────────────────────────────────
document.getElementById('btn-ai-modal').addEventListener('click', openLlmModal);
document.getElementById('llm-modal-close').addEventListener('click', closeLlmModal);
document.getElementById('llm-modal-close2').addEventListener('click', closeLlmModal);
document.getElementById('llm-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('llm-modal')) closeLlmModal();
});
document.getElementById('llm-museum-name').addEventListener('input', updateLlmPrompt);
document.getElementById('btn-copy-prompt').addEventListener('click', copyLlmPrompt);

function openLlmModal() {
  document.getElementById('llm-museum-name').value = '';
  document.getElementById('llm-prompt-out').value = '';
  document.getElementById('btn-copy-prompt').disabled = true;
  document.getElementById('llm-modal').classList.remove('hidden');
  setTimeout(() => document.getElementById('llm-museum-name').focus(), 80);
}

function closeLlmModal() {
  document.getElementById('llm-modal').classList.add('hidden');
}

function updateLlmPrompt() {
  const name = document.getElementById('llm-museum-name').value.trim();
  const btn = document.getElementById('btn-copy-prompt');
  if (!name) { document.getElementById('llm-prompt-out').value = ''; btn.disabled = true; return; }
  document.getElementById('llm-prompt-out').value = buildLlmPrompt(name);
  btn.disabled = false;
}

function copyLlmPrompt() {
  const text = document.getElementById('llm-prompt-out').value;
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('btn-copy-prompt');
    const orig = btn.textContent;
    btn.textContent = '✅ Copied!';
    setTimeout(() => { btn.textContent = orig; }, 2000);
  }).catch(() => showToast('⚠️ Copy failed — please select the text above and copy manually.'));
}

// ── Search ─────────────────────────────────────────────────────────────────────
document.getElementById('search-input').addEventListener('input', renderArtworks);

// ── Init ───────────────────────────────────────────────────────────────────────
setupSeekBar();
// Start loading the AI voice immediately in the background on page load
initKokoro();
