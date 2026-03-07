/* 
   AuricPlay – app.js
   Main application: state management, routing,
   event bus, keyboard shortcuts, localStorage
 */

'use strict';

/* 
   EVENT BUS
   Lightweight pub/sub so modules stay decoupled
 */
const Events = (() => {
  const _listeners = {};
  return {
    on(event, cb)  { (_listeners[event] = _listeners[event] || []).push(cb); },
    off(event, cb) { _listeners[event] = (_listeners[event] || []).filter(l => l !== cb); },
    emit(event, data) { (_listeners[event] || []).forEach(cb => cb(data)); },
  };
})();

/**
 * APP STATE + CORE LOGIC
 */
const App = (() => {

  /* ─── State ──────────────────────────────────── */
  const STATE = {
    // Playback
    playlist:    [],      // currently active set of tracks
    currentIndex:-1,      // index into playlist
    currentTrack: null,
    isPlaying:   false,
    shuffleMode: false,
    repeatMode:  'off',   // 'off' | 'one' | 'all'
    shuffleBag:  [],      // for smart shuffle (no repeats)

    // Library
    library:    [],       // all tracks user has encountered
    history:    [],       // recently played (max 50)
    favorites:  new Set(),// track IDs

    // UI
    currentView: 'home',
    isFullscreen:false,
    searchTimer: null,
    genreCache:  {},      // genreQuery → tracks[]

    // User Settings
    settings: {
      crossfadeDuration: 2, // seconds
      sortOrder: 'default',
    },
  };

  /* ─── LocalStorage ───────────────────────────── */
  const LS_KEY = 'AuricPlay_state_v1';

  function _saveState() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        favorites: [...STATE.favorites],
        history:   STATE.history.slice(0, 50),
        library:   STATE.library.slice(0, 200),
        shuffleMode: STATE.shuffleMode,
        repeatMode:  STATE.repeatMode,
        settings:    STATE.settings,
      }));
    } catch (_) {}
  }

  function _loadState() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved.favorites) STATE.favorites = new Set(saved.favorites);
      if (saved.history)   STATE.history   = saved.history;
      if (saved.library)   STATE.library   = saved.library;
      if (saved.shuffleMode !== undefined) STATE.shuffleMode = saved.shuffleMode;
      if (saved.repeatMode)  STATE.repeatMode  = saved.repeatMode;
      if (saved.settings)    STATE.settings    = { ...STATE.settings, ...saved.settings };
    } catch (_) {}
  }

  /* ─── Add track to library (deduplicated) ────── */
  function _addToLibrary(track) {
    if (!track) return;
    if (!STATE.library.find(t => t.id === track.id)) {
      STATE.library.unshift(track);
      if (STATE.library.length > 200) STATE.library.pop();
    }
  }

  /* ─── Add to history ─────────────────────────── */
  function _addToHistory(track) {
    if (!track) return;
    STATE.history = STATE.history.filter(t => t.id !== track.id);
    STATE.history.unshift(track);
    if (STATE.history.length > 50) STATE.history.pop();
  }

  /* ─── Smart shuffle bag ──────────────────────── */
  function _nextShuffleIndex() {
    if (!STATE.shuffleBag.length) {
      STATE.shuffleBag = Array.from({ length: STATE.playlist.length }, (_, i) => i)
        .filter(i => i !== STATE.currentIndex);
    }
    const pick  = Math.floor(Math.random() * STATE.shuffleBag.length);
    const index = STATE.shuffleBag.splice(pick, 1)[0];
    return index;
  }

  /* ─── Core: play a track by index ────────────── */
  async function playTrack(index) {
    if (index < 0 || index >= STATE.playlist.length) return;
    const track = STATE.playlist[index];
    if (!track) return;

    // Use setting (convert s to ms)
    const fadeMs = (STATE.settings.crossfadeDuration || 0) * 1000;
    const ok = await Player.load(track, fadeMs);
    if (!ok) { toast('Preview unavailable for this track.'); return; }

    STATE.currentIndex = index;
    STATE.currentTrack = track;

    await Player.play();
    STATE.isPlaying = true;

    _addToLibrary(track);
    _addToHistory(track);
    _saveState();

    // UI updates
    UI.updatePlayerBar(track, true, STATE.favorites);
    UI.updateQueue(STATE.playlist, track.id);
    _refreshTrackHighlights();

    // Fullscreen (if open)
    if (STATE.isFullscreen) {
      const upNext = _getUpNext();
      UI.updateFullscreen(track, true, upNext, STATE.favorites);
    }

    Visualizer.start();
  }

  /* ─── Play track by track ID ─────────────────── */
  function playTrackById(id) {
    const index = STATE.playlist.findIndex(t => t.id === id);
    if (index !== -1) playTrack(index);
  }

  /* ─── Toggle play/pause ──────────────────────── */
  async function togglePlay() {
    if (!STATE.currentTrack) {
      if (STATE.playlist.length) playTrack(0);
      return;
    }
    STATE.isPlaying = await Player.toggle();
    if (!STATE.isPlaying) Visualizer.stop();
    else Visualizer.start();
    UI.updatePlayerBar(STATE.currentTrack, STATE.isPlaying, STATE.favorites);
    if (STATE.isFullscreen) {
      UI.updateFullscreen(STATE.currentTrack, STATE.isPlaying, _getUpNext(), STATE.favorites);
    }
  }

  /* ─── Next track ──────────────────────────────── */
  function nextTrack() {
    if (!STATE.playlist.length) return;
    let next;
    if (STATE.shuffleMode) next = _nextShuffleIndex();
    else next = (STATE.currentIndex + 1) % STATE.playlist.length;
    playTrack(next);
  }

  /* ─── Previous track ──────────────────────────── */
  function prevTrack() {
    if (!STATE.playlist.length) return;
    // Restart if > 3 seconds into track
    if (Player.currentTime > 3) { Player.seek(0); return; }
    const prev = (STATE.currentIndex - 1 + STATE.playlist.length) % STATE.playlist.length;
    playTrack(prev);
  }

  /* ─── Update Setting ─────────────────────────── */
  function updateSetting(key, val) {
    if (STATE.settings[key] !== undefined) {
      STATE.settings[key] = val;
      _saveState();
      
      // Dynamic updates if needed
      if (key === 'crossfadeDuration') {
        // will be read by player.js on next fade
      }
      
      if (key === 'sortOrder' && STATE.currentView === 'library') {
        navigate('library'); // re-render
      }
    }
  }

  /* ─── Skip 10s ───────────────────────────────── */
  function skipFwd() { Player.seek(Player.currentTime + 10); }
  function skipBack() { Player.seek(Player.currentTime - 10); }

  /* ─── Up Next helper ─────────────────────────── */
  function _getUpNext() {
    const start = STATE.currentIndex + 1;
    const end   = STATE.playlist.length;
    return STATE.playlist.slice(start, Math.min(start + 5, end));
  }

  /* ─── Toggle shuffle ─────────────────────────── */
  function toggleShuffle() {
    STATE.shuffleMode  = !STATE.shuffleMode;
    STATE.shuffleBag   = [];          // reset bag
    UI.updateShuffleBtn(STATE.shuffleMode);
    toast(`Shuffle ${STATE.shuffleMode ? 'on' : 'off'}`);
    _saveState();
  }

  /* ─── Cycle repeat ───────────────────────────── */
  function cycleRepeat() {
    const modes = ['off', 'all', 'one'];
    const next  = modes[(modes.indexOf(STATE.repeatMode) + 1) % modes.length];
    STATE.repeatMode = next;
    UI.updateRepeatBtn(next);
    toast(`Repeat: ${next}`);
    _saveState();
  }

  /* ─── Volume ──────────────────────────────────── */
  function setVolume(vol) {
    Player.setVolume(vol);
  }

  /* ─── Mute ────────────────────────────────────── */
  function toggleMute() {
    Player.toggleMute();
  }

  /* ─── Favorite ────────────────────────────────── */
  function toggleFavorite() {
    if (!STATE.currentTrack) return;
    toggleFavoriteById(STATE.currentTrack.id);
  }

  function toggleFavoriteById(id) {
    const track = STATE.library.find(t => t.id === id)
               || STATE.playlist.find(t => t.id === id);
    if (!track) return;

    if (STATE.favorites.has(id)) {
      STATE.favorites.delete(id);
      toast(`Removed from favorites`);
    } else {
      STATE.favorites.add(id);
      _addToLibrary(track);
      toast(`Added to favorites ♥`);
    }
    UI.updateFavBadge(STATE.favorites.size);
    UI.updatePlayerBar(STATE.currentTrack, STATE.isPlaying, STATE.favorites);
    _refreshTrackHighlights();
    _saveState();
  }

  /* ─── Clear queue ─────────────────────────────── */
  function clearQueue() {
    STATE.playlist = STATE.currentTrack ? [STATE.currentTrack] : [];
    STATE.currentIndex = 0;
    UI.updateQueue(STATE.playlist, STATE.currentTrack?.id);
    toast('Queue cleared');
  }

  /* ─── Toggle fullscreen ───────────────────────── */
  function toggleFullscreen() {
    STATE.isFullscreen = !STATE.isFullscreen;
    const overlay = document.getElementById('fullscreenOverlay');
    overlay.classList.toggle('hidden', !STATE.isFullscreen);
    if (STATE.isFullscreen && STATE.currentTrack) {
      UI.updateFullscreen(STATE.currentTrack, STATE.isPlaying, _getUpNext(), STATE.favorites);
      Visualizer.start();
    } else if (!STATE.isFullscreen) {
      // Keep visualizer running if playing; else stop
      if (!STATE.isPlaying) Visualizer.stop();
    }
  }

  /* ─────────────────────────────────────────────
     NAVIGATION & VIEWS
  ───────────────────────────────────────────── */

  function navigate(view) {
    STATE.currentView = view;
    UI.setActiveNav(view);

    const container = document.getElementById('viewContainer');
    if (!container) return;

    const cid = STATE.currentTrack?.id || null;
    const fav = STATE.favorites;

    switch (view) {
      case 'home':
        container.innerHTML = UI.renderHome(API.getGenres());
        UI.injectHomeRecent(STATE.history, cid, fav);
        UI.injectHomeFavs(
          STATE.library.filter(t => STATE.favorites.has(t.id)), cid, fav
        );
        break;

      case 'search':
        container.innerHTML = UI.renderSearch();
        setTimeout(() => {
          const inp = document.getElementById('searchInput');
          if (inp) inp.focus();
        }, 100);
        break;

      case 'library': {
        let sorted = [...STATE.library];
        const ord = STATE.settings.sortOrder;
        if (ord === 'az') sorted.sort((a,b) => a.title.localeCompare(b.title));
        else if (ord === 'za') sorted.sort((a,b) => b.title.localeCompare(a.title));
        else if (ord === 'artist') sorted.sort((a,b) => a.artist.localeCompare(b.artist));
        
        container.innerHTML = UI.renderLibrary(sorted, cid, fav);
        break;
      }

      case 'favorites':
        container.innerHTML = UI.renderFavorites(
          STATE.library.filter(t => STATE.favorites.has(t.id)), cid, fav
        );
        break;

      case 'history':
        container.innerHTML = UI.renderHistory(STATE.history, cid, fav);
        break;

      case 'settings':
        container.innerHTML = UI.renderSettings(STATE.settings);
        break;
    }
  }

  /* ─── Open a genre ────────────────────────────── */
  async function openGenre(query, name) {
    const container = document.getElementById('viewContainer');
    UI.setActiveNav(''); // no nav active during genre view

    // Show skeleton immediately
    container.innerHTML = `
      <div class="view-enter">
        <div class="view-header">
          <div class="view-title">${name}</div>
          <div class="view-subtitle">Loading from iTunes…</div>
        </div>
        <div class="track-table">
          <div class="track-table-head">
            <div class="th center">#</div><div class="th">TITLE</div>
            <div class="th">ARTIST</div><div class="th">GENRE</div>
            <div class="th right">TIME</div><div class="th"></div>
          </div>
          ${document.getElementById('viewContainer').innerHTML.includes('skeleton')
            ? '' : _renderSkeletons(8)}
        </div>
      </div>`;

    // Inline skeleton (simple)
    container.querySelector('.track-table').innerHTML += '';

    let tracks = STATE.genreCache[query];
    if (!tracks) {
      tracks = await API.getGenreTracks(query, 25);
      STATE.genreCache[query] = tracks;
    }

    STATE.playlist     = tracks;
    STATE.currentIndex = -1;
    STATE.shuffleBag   = [];

    container.innerHTML = UI.renderPlaylist(
      name,
      `${tracks.length} tracks from iTunes`,
      tracks,
      STATE.currentTrack?.id,
      STATE.favorites
    );
    UI.updateQueue(tracks, STATE.currentTrack?.id);
  }

  /* Inline skeleton helper for genre load */
  function _renderSkeletons(n) {
    return Array.from({length:n}).map((_,i) => `
      <div class="track-row" style="pointer-events:none">
        <div class="tr-num"><div class="skeleton" style="width:16px;height:16px;border-radius:4px;margin:auto"></div></div>
        <div class="tr-info">
          <div class="tr-art"><div class="skeleton" style="width:40px;height:40px;border-radius:6px;flex-shrink:0"></div></div>
          <div class="tr-text" style="flex:1;min-width:0">
            <div class="skeleton" style="height:12px;width:70%;margin-bottom:6px"></div>
            <div class="skeleton" style="height:10px;width:45%"></div>
          </div>
        </div>
        <div><div class="skeleton" style="height:12px;width:80%"></div></div>
        <div><div class="skeleton" style="height:20px;width:60px;border-radius:20px"></div></div>
        <div><div class="skeleton" style="height:12px;width:32px;margin-left:auto"></div></div>
        <div></div>
      </div>`).join('');
  }

  /* ─── Search ─────────────────────────────────── */
  let _searchDebounce = null;

  function handleSearch(value) {
    if (_searchDebounce) clearTimeout(_searchDebounce);
    if (!value.trim()) {
      const statusEl = document.getElementById('searchStatus');
      const resultsEl = document.getElementById('searchResults');
      if (statusEl) statusEl.textContent = 'Start typing to search real songs from iTunes';
      if (resultsEl) resultsEl.innerHTML = '';
      return;
    }
    _searchDebounce = setTimeout(() => submitSearch(value), 600);
  }

  async function submitSearch(query) {
    if (!query || !query.trim()) return;
    UI.showSearchSkeleton();
    const tracks = await API.search(query.trim(), 20);
    STATE.playlist     = tracks;
    STATE.currentIndex = -1;
    STATE.shuffleBag   = [];
    UI.showSearchResults(tracks, query, STATE.currentTrack?.id, STATE.favorites);
    UI.updateQueue(tracks, STATE.currentTrack?.id);
  }

  /* ─── Refresh highlights without re-rendering ── */
  function _refreshTrackHighlights() {
    // Update playing class and hearts in current DOM
    document.querySelectorAll('.track-row').forEach(row => {
      const id    = row.dataset.id;
      const idx   = parseInt(row.dataset.index, 10);
      const isNow = id === STATE.currentTrack?.id;
      row.classList.toggle('playing', isNow);

      const numEl = row.querySelector('.tr-num');
      if (numEl && isNow) {
        numEl.innerHTML = `<span class="eq-icon${Player.isPlaying ? '' : ' paused'}">
          <span class="eq-bar"></span><span class="eq-bar"></span>
          <span class="eq-bar"></span><span class="eq-bar"></span>
        </span>`;
      } else if (numEl && !isNow) {
        numEl.innerHTML = `<span>${idx + 1}</span>`;
      }

      const heart = row.querySelector('.tr-heart');
      if (heart) {
        heart.classList.toggle('liked', STATE.favorites.has(id));
        heart.textContent = STATE.favorites.has(id) ? '♥' : '♡';
      }
    });
  }

  /* ─────────────────────────────────────────────
     TOAST
  ───────────────────────────────────────────── */
  let _toastTimer = null;

  function toast(msg, duration = 2200) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
    el.classList.add('show');
    if (_toastTimer) clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.classList.add('hidden'), 300);
    }, duration);
  }

  /* ─────────────────────────────────────────────
     EVENT BUS LISTENERS
  ───────────────────────────────────────────── */

  function _bindEvents() {
    // Player progress
    Events.on('progress', ({ current, duration }) => {
      UI.updateProgress(current, duration);
    });

    // Track ended → next
    Events.on('ended', () => {
      if (STATE.repeatMode === 'one') {
        Player.seek(0);
        Player.play();
      } else {
        nextTrack();
      }
    });

    // Volume change
    Events.on('volume', ({ volume, muted }) => {
      UI.updateVolume(volume, muted);
    });

    // Buffering
    Events.on('buffering', ({ buffering }) => {
      const playBtn = document.getElementById('playBtn');
      if (playBtn && buffering) playBtn.textContent = '…';
      else if (playBtn) playBtn.textContent = STATE.isPlaying ? '⏸' : '▶';
    });

    // Error
    Events.on('error', ({ msg }) => {
      toast(msg);
      nextTrack();
    });

    // Progress bar seek (player bar)
    const pbBar = document.getElementById('pbBarWrap');
    const fsBar = document.getElementById('fsBarWrap');
    if (pbBar) Player.bindProgressBar(pbBar, document.getElementById('pbBarFill'));
    if (fsBar) Player.bindProgressBar(fsBar, document.getElementById('fsBarFill'));
  }

  /* ─────────────────────────────────────────────
     KEYBOARD SHORTCUTS
  ───────────────────────────────────────────── */

  function _bindKeyboard() {
    document.addEventListener('keydown', e => {
      // Ignore if focus is on an input
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;

      switch (e.code) {
        case 'Space':      e.preventDefault(); togglePlay();    break;
        case 'ArrowLeft':  e.preventDefault(); Player.seek(Player.currentTime - 10); break;
        case 'ArrowRight': e.preventDefault(); Player.seek(Player.currentTime + 10); break;
        case 'ArrowUp':    e.preventDefault(); {
          const v = Math.min(1, Player.volume + 0.1);
          setVolume(v);
          document.getElementById('volSlider').value = Math.round(v * 100);
          break;
        }
        case 'ArrowDown':  e.preventDefault(); {
          const v = Math.max(0, Player.volume - 0.1);
          setVolume(v);
          document.getElementById('volSlider').value = Math.round(v * 100);
          break;
        }
        case 'KeyM':       toggleMute();                        break;
        case 'KeyN':       nextTrack();                         break;
        case 'KeyP':       prevTrack();                         break;
        case 'KeyS':       toggleShuffle();                     break;
        case 'KeyR':       cycleRepeat();                       break;
        case 'KeyL':       toggleFavorite();                    break;
        case 'KeyF':       toggleFullscreen();                  break;
        case 'KeyV':       Visualizer.toggleMode();             break;
        case 'Escape':
          if (STATE.isFullscreen) toggleFullscreen();
          break;
      }
    });
  }

  /* ─────────────────────────────────────────────
     INIT
  ───────────────────────────────────────────── */

  function init() {
    // Load persisted state
    _loadState();

    // Bind event bus listeners
    _bindEvents();

    // Bind keyboard shortcuts
    _bindKeyboard();

    // Initialize visualizer
    Visualizer.init();

    // Restore UI from saved state
    UI.updateShuffleBtn(STATE.shuffleMode);
    UI.updateRepeatBtn(STATE.repeatMode);
    UI.updateVolume(Player.volume, Player.isMuted);
    UI.updateFavBadge(STATE.favorites.size);

    // Render home view
    navigate('home');

    // Log
    console.info('%cAuricPlay initialized ✓', 'color:#ff3366;font-weight:bold;font-size:14px');
    console.info(`Favorites: ${STATE.favorites.size} | History: ${STATE.history.length} | Library: ${STATE.library.length}`);
  }

  /* ─── Expose public API ───────────────────────── */
  return {
    init,
    navigate,
    openGenre,
    playTrack,
    playTrackById,
    togglePlay,
    nextTrack,
    prevTrack,
    skipFwd,
    skipBack,
    toggleShuffle,
    cycleRepeat,
    setVolume,
    toggleMute,
    toggleFavorite,
    toggleFavoriteById,
    handleSearch,
    submitSearch,
    clearQueue,
    toggleFullscreen,
    updateSetting,
    toast,
    // expose state for debugging
    get state() { return STATE; },
  };

})();

/* ─── Boot ────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => App.init());

