// ── TTS Manager ───────────────────────────────────────────────────────────────
// Tries Kokoro neural TTS (via @huggingface/transformers) first.
// Falls back to the browser's Web Speech API if Kokoro fails or is unavailable.

let kokoroPipeline = null;
let kokoroLoading = false;
let kokoroFailed = false;

// Web Audio context (created lazily, must be unlocked on user gesture)
let audioCtx = null;
let currentSource = null;   // AudioBufferSourceNode
let currentBuffer = null;   // AudioBuffer (full generated audio)
let pausedAt = 0;           // seconds into the buffer where we paused
let playbackStartedAt = 0;  // audioCtx.currentTime when playback (re)started
let bufferDuration = 0;     // total duration of the current buffer in seconds

// Callbacks set by the player
export const ttsCallbacks = {
  onstart: null,
  onend: null,
  onerror: null,
  onStatusChange: null,   // called with a status string for the UI
};

// ── mode: 'kokoro' | 'webspeech' ──────────────────────────────────────────────
export let ttsMode = 'webspeech';

// ── Kokoro init ───────────────────────────────────────────────────────────────
export async function initKokoro() {
  if (kokoroPipeline || kokoroLoading || kokoroFailed) return;
  kokoroLoading = true;
  notify('⏳ Loading AI voice (first time only)…');
  try {
    // Load from CDN so the large library isn't inlined into the single-file HTML build
    const CDN = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.0.1/dist/transformers.min.js';
    const { pipeline, env } = await import(/* @vite-ignore */ CDN);
    // Point ONNX Runtime WASM to the CDN (binary WASM files can't be bundled inline)
    env.backends.onnx.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.21.0/dist/';
    kokoroPipeline = await pipeline(
      'text-to-speech',
      'onnx-community/Kokoro-82M-v1.0',
      { dtype: 'q8', device: 'wasm' }
    );
    ttsMode = 'kokoro';
    kokoroLoading = false;
    notify('✅ AI voice ready');
    setTimeout(() => notify(''), 2500);
  } catch (err) {
    console.warn('[TTS] Kokoro init failed, falling back to Web Speech API:', err);
    kokoroFailed = true;
    kokoroLoading = false;
    ttsMode = 'webspeech';
    notify('');
  }
}

function notify(msg) {
  if (ttsCallbacks.onStatusChange) ttsCallbacks.onStatusChange(msg);
}

// ── Main speak API ─────────────────────────────────────────────────────────────
// startFraction: 0-1, position to start from
export async function speak(text, rate, startFraction) {
  rate = rate || 1.0;
  startFraction = startFraction || 0;

  stopSpeech();

  if (ttsMode === 'kokoro' && kokoroPipeline) {
    await speakKokoro(text, rate, startFraction);
  } else {
    speakWebSpeech(text, rate, startFraction);
  }
}

// ── Kokoro playback ────────────────────────────────────────────────────────────
async function speakKokoro(text, rate, startFraction) {
  notify('⏳ Generating audio…');
  try {
    // Trim text to start at approximate word position
    const words = text.split(/\s+/);
    const startWord = Math.floor(startFraction * words.length);
    const chunk = startWord > 0 ? words.slice(startWord).join(' ') : text;

    const result = await kokoroPipeline(chunk, { speaker_id: 0 });
    notify('');

    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === 'suspended') await audioCtx.resume();

    const samples = result.audio;
    const sampleRate = result.sampling_rate;

    const buffer = audioCtx.createBuffer(1, samples.length, sampleRate);
    buffer.copyToChannel(samples, 0);

    currentBuffer = buffer;
    bufferDuration = buffer.duration;

    // Adjust times to reflect skipped portion
    const skipDuration = startFraction * (bufferDuration / (1 - startFraction + 0.0001));
    pausedAt = 0;

    _playFromOffset(0, rate, startFraction * (skipDuration + bufferDuration));
    if (ttsCallbacks.onstart) ttsCallbacks.onstart(bufferDuration + skipDuration);
  } catch (err) {
    console.error('[TTS] Kokoro speak error:', err);
    notify('⚠️ AI voice error, using browser voice');
    ttsMode = 'webspeech';
    kokoroFailed = true;
    speakWebSpeech(text, rate, startFraction);
  }
}

function _playFromOffset(offsetSeconds, rate, reportedStart) {
  if (currentSource) { try { currentSource.stop(); } catch (_) {} }

  const src = audioCtx.createBufferSource();
  src.buffer = currentBuffer;
  src.playbackRate.value = rate;
  src.connect(audioCtx.destination);
  src.start(0, offsetSeconds);
  currentSource = src;
  playbackStartedAt = audioCtx.currentTime - offsetSeconds / rate;

  src.onended = () => {
    if (src !== currentSource) return; // stale
    currentSource = null;
    pausedAt = 0;
    if (ttsCallbacks.onend) ttsCallbacks.onend();
  };
}

// ── Web Speech API fallback ────────────────────────────────────────────────────
const synth = window.speechSynthesis;
let wsUtter = null;
let wsResumeTimer = null;
let wsDuration = 0;
let wsStartTime = 0;
let wsProgressAtPause = 0;   // saved progress fraction when paused

function speakWebSpeech(text, rate, startFraction) {
  if (synth.onvoiceschanged !== undefined && !synth.getVoices().length) {
    synth.onvoiceschanged = () => speakWebSpeech(text, rate, startFraction);
    return;
  }

  const words = text.split(/\s+/);
  const startWord = Math.floor(startFraction * words.length);
  const chunk = startWord > 0 ? words.slice(startWord).join(' ') : text;

  const utter = new SpeechSynthesisUtterance(chunk);
  utter.lang = 'en-US';
  utter.rate = rate;
  utter.pitch = 1.0;
  utter.volume = 1.0;
  utter.voice = _bestWebSpeechVoice();
  wsUtter = utter;

  const fullDuration = _estimateDuration(text, rate);
  wsDuration = fullDuration;
  wsStartFraction = startFraction;

  utter.onstart = () => {
    wsStartTime = Date.now() - startFraction * fullDuration;
    if (ttsCallbacks.onstart) ttsCallbacks.onstart(fullDuration);
    // iOS keep-alive
    clearInterval(wsResumeTimer);
    wsResumeTimer = setInterval(() => {
      if (synth.speaking && !synth.paused) { synth.pause(); synth.resume(); }
    }, 10000);
  };
  utter.onend = () => {
    clearInterval(wsResumeTimer);
    wsUtter = null;
    if (ttsCallbacks.onend) ttsCallbacks.onend();
  };
  utter.onerror = () => {
    clearInterval(wsResumeTimer);
    wsUtter = null;
    if (ttsCallbacks.onerror) ttsCallbacks.onerror();
  };

  synth.speak(utter);
}

// ── Pause / Resume / Stop ─────────────────────────────────────────────────────
export function pauseSpeech() {
  if (ttsMode === 'kokoro' && currentSource && audioCtx) {
    pausedAt = (audioCtx.currentTime - playbackStartedAt) * (currentSource.playbackRate ? currentSource.playbackRate.value : 1);
    try { currentSource.stop(); } catch (_) {}
    currentSource = null;
  } else {
    wsProgressAtPause = getProgress();  // snapshot progress before pause advances
    synth.pause();
    clearInterval(wsResumeTimer);
  }
}

export function resumeSpeech(rate) {
  if (ttsMode === 'kokoro' && currentBuffer && audioCtx) {
    _playFromOffset(Math.min(pausedAt, currentBuffer.duration - 0.01), rate || 1.0, null);
    if (ttsCallbacks.onstart) ttsCallbacks.onstart(bufferDuration);
  } else {
    synth.resume();
    wsStartTime = Date.now() - (wsProgressAtPause * wsDuration);
    if (ttsCallbacks.onstart) ttsCallbacks.onstart(wsDuration);
    clearInterval(wsResumeTimer);
    wsResumeTimer = setInterval(() => {
      if (synth.speaking && !synth.paused) { synth.pause(); synth.resume(); }
    }, 10000);
  }
}

export function stopSpeech() {
  if (ttsMode === 'kokoro') {
    if (currentSource) { try { currentSource.stop(); } catch (_) {} currentSource = null; }
    pausedAt = 0;
    currentBuffer = null;
  } else {
    synth.cancel();
    clearInterval(wsResumeTimer);
    wsUtter = null;
  }
}

// ── State queries ─────────────────────────────────────────────────────────────
export function isSpeaking() {
  if (ttsMode === 'kokoro') return !!currentSource;
  return synth.speaking && !synth.paused;
}

export function isPaused() {
  if (ttsMode === 'kokoro') return !currentSource && currentBuffer !== null && pausedAt > 0;
  return synth.paused;
}

// Returns 0-1 progress fraction
export function getProgress() {
  if (ttsMode === 'kokoro') {
    if (!currentBuffer) return 0;
    if (currentSource && audioCtx) {
      const elapsed = (audioCtx.currentTime - playbackStartedAt) * (currentSource.playbackRate ? currentSource.playbackRate.value : 1);
      return Math.min(1, elapsed / bufferDuration);
    }
    return Math.min(1, pausedAt / bufferDuration);
  } else {
    if (!wsDuration) return 0;
    const elapsed = Date.now() - wsStartTime;
    return Math.min(1, elapsed / wsDuration);
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function _estimateDuration(text, rate) {
  const words = text.split(/\s+/).length;
  return (words / (150 * rate)) * 60 * 1000;
}

function _bestWebSpeechVoice() {
  const voices = synth.getVoices();
  const preferred = [
    'Google US English', 'Google UK English Female', 'Google UK English Male',
    'Microsoft Aria', 'Microsoft Jenny', 'Microsoft Guy', 'Microsoft Zira',
    'Samantha', 'Karen', 'Moira', 'Daniel', 'Allison', 'Ava', 'Susan',
  ];
  for (const name of preferred) {
    const v = voices.find(v => v.name.includes(name) && v.lang.startsWith('en'));
    if (v) return v;
  }
  const onlineEnUS = voices.find(v => !v.localService && (v.lang === 'en-US' || v.lang === 'en_US'));
  if (onlineEnUS) return onlineEnUS;
  const enUS = voices.find(v => v.lang === 'en-US' || v.lang === 'en_US');
  if (enUS) return enUS;
  return voices.find(v => v.lang.startsWith('en')) || null;
}

// Pre-load voices on page load for Web Speech API
if (synth.onvoiceschanged !== undefined) synth.onvoiceschanged = () => synth.getVoices();
synth.getVoices();
