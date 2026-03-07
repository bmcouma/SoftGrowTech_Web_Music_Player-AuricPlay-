/* 
   AuricPlay – player.js
   Audio engine: playback, volume, crossfade,
   progress tracking, Web Audio API setup
 */

'use strict';

const Player = (() => {

  /* ─── Internal state ─────────────────────────── */
  const audio       = document.getElementById('audioEl');
  let   _volume     = 0.8;
  let   _isMuted    = false;
  let   _prevVol    = 0.8;
  let   _duration   = 0;
  let   _progressId = null;

  // Web Audio API nodes
  let   _audioCtx   = null;
  let   _analyser   = null;
  let   _gainNode   = null;
  let   _sourceNode = null;
  let   _webAudioOk = false;

  /* ─── Init Web Audio API (once) ──────────────── */
  function _initWebAudio() {
    if (_audioCtx) return;
    try {
      _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      _analyser = _audioCtx.createAnalyser();
      _analyser.fftSize = 512;
      _analyser.smoothingTimeConstant = 0.8;
      _gainNode = _audioCtx.createGain();
      _gainNode.gain.value = _volume;

      // Connect the HTML audio element to Web Audio graph
      _sourceNode = _audioCtx.createMediaElementSource(audio);
      _sourceNode.connect(_analyser);
      _analyser.connect(_gainNode);
      _gainNode.connect(_audioCtx.destination);

      _webAudioOk = true;
      console.info('[AuricPlay Player] Web Audio API initialized.');
    } catch (err) {
      console.warn('[AuricPlay Player] Web Audio API unavailable (CORS or browser restriction). Using CSS visualizer fallback.', err.message);
      _webAudioOk = false;
    }
  }

  /* ─── Resume AudioContext on user gesture ────── */
  function _resumeContext() {
    if (_audioCtx && _audioCtx.state === 'suspended') {
      _audioCtx.resume().catch(() => {});
    }
  }

  /* ─── Smooth fade (volume tween) ─────────────── */
  function _fadeTo(targetVol, durationMs = 200) {
    return new Promise(resolve => {
      const startVol   = audio.volume;
      const steps      = 20;
      const stepTime   = durationMs / steps;
      const volStep    = (targetVol - startVol) / steps;
      let   stepCount  = 0;

      const tick = setInterval(() => {
        stepCount++;
        const newVol = Math.min(1, Math.max(0, audio.volume + volStep));
        audio.volume = newVol;
        if (_gainNode) _gainNode.gain.value = newVol;
        if (stepCount >= steps) {
          clearInterval(tick);
          audio.volume = targetVol;
          resolve();
        }
      }, stepTime);
    });
  }

  /* ─── Load a track ───────────────────────────── */
  async function load(track, fadeDurationMs = 250) {
    if (!track || !track.previewUrl) {
      console.error('[AuricPlay Player] No preview URL for track:', track);
      return false;
    }
    // Crossfade out
    if (!audio.paused && audio.currentTime > 0) {
      await _fadeTo(0, fadeDurationMs);
    }
    audio.pause();
    audio.currentTime = 0;

    // Set new source
    audio.src  = track.previewUrl;
    audio.load();

    // Restore volume
    audio.volume = _isMuted ? 0 : _volume;
    if (_gainNode) _gainNode.gain.value = audio.volume;

    return true;
  }

  /* ─── Play ───────────────────────────────────── */
  async function play() {
    _resumeContext();
    try {
      await audio.play();
      _startProgressLoop();
      return true;
    } catch (err) {
      console.error('[AuricPlay Player] Play error:', err.message);
      return false;
    }
  }

  /* ─── Pause ──────────────────────────────────── */
  function pause() {
    audio.pause();
    _stopProgressLoop();
  }

  /* ─── Toggle ─────────────────────────────────── */
  async function toggle() {
    if (audio.paused) return play();
    else { pause(); return false; }
  }

  /* ─── Seek ───────────────────────────────────── */
  function seek(seconds) {
    if (isNaN(audio.duration)) return;
    audio.currentTime = Math.max(0, Math.min(audio.duration, seconds));
    Events.emit('progress', { current: audio.currentTime, duration: audio.duration });
  }

  /* ─── Seek by fraction [0–1] ─────────────────── */
  function seekFraction(frac) {
    if (isNaN(audio.duration)) return;
    seek(frac * audio.duration);
  }

  /* ─── Volume ─────────────────────────────────── */
  function setVolume(vol) {
    _volume = Math.min(1, Math.max(0, vol));
    if (!_isMuted) {
      audio.volume = _volume;
      if (_gainNode) _gainNode.gain.value = _volume;
    }
    Events.emit('volume', { volume: _volume, muted: _isMuted });
  }

  /* ─── Mute toggle ────────────────────────────── */
  function toggleMute() {
    _isMuted = !_isMuted;
    if (_isMuted) {
      _prevVol = _volume;
      audio.volume = 0;
      if (_gainNode) _gainNode.gain.value = 0;
    } else {
      audio.volume = _volume;
      if (_gainNode) _gainNode.gain.value = _volume;
    }
    Events.emit('volume', { volume: _volume, muted: _isMuted });
  }

  /* ─── Get frequency data for visualizer ─────── */
  function getFrequencyData() {
    if (!_webAudioOk || !_analyser) return null;
    const buf = new Uint8Array(_analyser.frequencyBinCount);
    _analyser.getByteFrequencyData(buf);
    return buf;
  }

  /* ─── Simulated frequency data (CSS fallback) ─ */
  function getSimulatedFrequencyData(numBins = 64) {
    const t = audio.currentTime;
    const buf = new Uint8Array(numBins);
    for (let i = 0; i < numBins; i++) {
      const freq  = (i / numBins);
      const noise = Math.random() * 30;
      // Simulate a music-like envelope: bass heavy, treble falls off
      const envelope = freq < 0.2 ? 1.0 : freq < 0.5 ? 0.75 : 0.4;
      buf[i] = Math.min(255, Math.abs(
        Math.sin(t * 2.1 + i * 0.25) * 120 * envelope +
        Math.sin(t * 3.7 + i * 0.6)  * 60  * envelope +
        Math.cos(t * 1.3 + i * 0.9)  * 40  * envelope +
        noise
      ));
    }
    return buf;
  }

  /* ─── Progress loop ──────────────────────────── */
  function _startProgressLoop() {
    _stopProgressLoop();
    _progressId = setInterval(() => {
      if (!audio.paused && !isNaN(audio.duration)) {
        Events.emit('progress', {
          current:  audio.currentTime,
          duration: audio.duration,
          fraction: audio.currentTime / audio.duration,
        });
      }
    }, 200);
  }

  function _stopProgressLoop() {
    if (_progressId) { clearInterval(_progressId); _progressId = null; }
  }

  /* ─── Audio element event listeners ─────────── */
  audio.addEventListener('loadedmetadata', () => {
    _duration = audio.duration;
    _initWebAudio();    // connect Web Audio after metadata loaded
    Events.emit('loaded', { duration: audio.duration });
  });

  audio.addEventListener('ended', () => {
    _stopProgressLoop();
    Events.emit('ended', {});
  });

  audio.addEventListener('error', (e) => {
    console.error('[AuricPlay Player] Audio error:', e);
    Events.emit('error', { msg: 'Track failed to load. Skipping.' });
  });

  audio.addEventListener('waiting', () => Events.emit('buffering', { buffering: true }));
  audio.addEventListener('canplay',  () => Events.emit('buffering', { buffering: false }));

  /* ─── Seek from progress bar click ───────────── */
  function bindProgressBar(el, fillEl) {
    el.addEventListener('click', e => {
      const rect = el.getBoundingClientRect();
      seekFraction((e.clientX - rect.left) / rect.width);
    });
  }

  /* ─── Expose ─────────────────────────────────── */
  return {
    load,
    play,
    pause,
    toggle,
    seek,
    seekFraction,
    setVolume,
    toggleMute,
    getFrequencyData,
    getSimulatedFrequencyData,
    bindProgressBar,
    get isPlaying()  { return !audio.paused; },
    get currentTime(){ return audio.currentTime; },
    get duration()   { return audio.duration || 0; },
    get volume()     { return _volume; },
    get isMuted()    { return _isMuted; },
    get webAudioOk() { return _webAudioOk; },
  };

})();

