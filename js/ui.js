/* 
   AuricPlay – ui.js
   DOM rendering engine: views, components,
   player bar updates, fullscreen panel
 */

'use strict';

const UI = (() => {

  /* ─── DOM refs ───────────────────────────────── */
  const qs  = (s, p = document) => p.querySelector(s);
  const qsa = (s, p = document) => [...p.querySelectorAll(s)];

  /* ─── Artwork helper ─────────────────────────── */
  function _artHtml(track, size = 40, extraClass = '') {
    if (track && track.artwork) {
      return `<img src="${track.artwork}" alt="${track.title}" 
               style="width:${size}px;height:${size}px;object-fit:cover;border-radius:6px"
               onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"
               class="${extraClass}"/>
              <span style="display:none;align-items:center;justify-content:center;width:100%;height:100%;font-size:${size*0.55}px">🎵</span>`;
    }
    return `<span style="font-size:${size*0.55}px">🎵</span>`;
  }

  /* ─── Format duration from ms ────────────────── */
  function _dur(ms) { return API.formatDuration(ms); }

  /* ─── Render a track row ─────────────────────── */
  function _trackRowHtml(track, index, currentId, favorites) {
    const isPlaying = currentId === track.id;
    const isLiked   = favorites.has(track.id);
    const artHtml   = _artHtml(track, 40);
    const eqHtml    = isPlaying
      ? `<span class="eq-icon${Player.isPlaying ? '' : ' paused'}">
           <span class="eq-bar"></span><span class="eq-bar"></span>
           <span class="eq-bar"></span><span class="eq-bar"></span>
         </span>`
      : `<span>${index + 1}</span>`;

    return `
      <div class="track-row ${isPlaying ? 'playing' : ''} track-row-enter"
           style="animation-delay:${Math.min(index * 0.03, 0.4)}s"
           data-id="${track.id}" data-index="${index}"
           onclick="App.playTrack(${index})">
        <div class="tr-num">${eqHtml}</div>
        <div class="tr-info">
          <div class="tr-art">${artHtml}<div class="tr-art-overlay">▶</div></div>
          <div class="tr-text">
            <div class="track-title-text">${track.title}</div>
            <div class="track-album-text">${track.album}</div>
          </div>
        </div>
        <div class="tr-artist">${track.artist}</div>
        <div class="tr-genre">${track.genre}</div>
        <div class="tr-dur">${_dur(track.duration)}</div>
        <button class="tr-heart ${isLiked ? 'liked' : ''}"
                onclick="event.stopPropagation(); App.toggleFavoriteById('${track.id}')"
                title="Like">
          ${isLiked ? '♥' : '♡'}
        </button>
      </div>`;
  }

  /* ─── Track table wrapper ─────────────────────── */
  function _trackTable(tracks, currentId, favorites) {
    if (!tracks.length) return '';
    const head = `
      <div class="track-table-head">
        <div class="th center">#</div>
        <div class="th">TITLE</div>
        <div class="th">ARTIST</div>
        <div class="th">GENRE</div>
        <div class="th right">TIME</div>
        <div class="th"></div>
      </div>`;
    const rows = tracks.map((t, i) => _trackRowHtml(t, i, currentId, favorites)).join('');
    return `<div class="track-table">${head}${rows}</div>`;
  }

  /* ─── Skeleton loading rows ───────────────────── */
  function _skeletonRows(n = 8) {
    return Array.from({ length: n }, (_, i) => `
      <div class="track-row" style="pointer-events:none;animation-delay:${i*0.05}s">
        <div class="tr-num"><div class="skeleton" style="width:16px;height:16px;border-radius:4px;margin:auto"></div></div>
        <div class="tr-info">
          <div class="tr-art"><div class="skeleton" style="width:40px;height:40px;border-radius:6px"></div></div>
          <div class="tr-text" style="flex:1">
            <div class="skeleton" style="height:12px;width:70%;margin-bottom:6px"></div>
            <div class="skeleton" style="height:10px;width:45%"></div>
          </div>
        </div>
        <div class="tr-artist"><div class="skeleton" style="height:12px;width:80%"></div></div>
        <div class="tr-genre"><div class="skeleton" style="height:20px;width:60px;border-radius:20px"></div></div>
        <div class="tr-dur"><div class="skeleton" style="height:12px;width:32px;margin-left:auto"></div></div>
        <div></div>
      </div>`).join('');
  }

  /* ─────────────────────────────────────────────
     VIEWS
  ───────────────────────────────────────────── */

  /* HOME VIEW */
  function renderHome(genres) {
    const genreCards = genres.map((g, i) => `
      <div class="genre-card genre-card-enter"
           style="background:${g.color};animation-delay:${i * 0.06}s"
           onclick="App.openGenre('${g.query}', '${g.name}')">
        <div class="genre-card-emoji">${g.emoji}</div>
        <div class="genre-card-title">${g.name}</div>
        <div class="genre-card-count">Tap to explore</div>
      </div>`).join('');

    return `
      <div class="view-enter">
        <div class="view-header">
          <div class="view-title">Good Vibes 🎵</div>
          <div class="view-subtitle">What do you feel like listening to today?</div>
        </div>
        <div class="section-row">
          <div class="section-heading">Browse Genres</div>
          <div class="genre-grid">${genreCards}</div>
        </div>
        <div class="section-row" id="recentSection"></div>
        <div class="section-row" id="favSection"></div>
      </div>`;
  }

  /* GENRE / PLAYLIST VIEW */
  function renderPlaylist(title, subtitle, tracks, currentId, favorites) {
    const table = tracks.length
      ? _trackTable(tracks, currentId, favorites)
      : `<div class="empty-state">
           <div class="empty-icon">🎵</div>
           <div class="empty-title">No tracks found</div>
           <div class="empty-desc">Try a different search or genre.</div>
         </div>`;

    return `
      <div class="view-enter">
        <div class="view-header">
          <div class="view-title">${title}</div>
          ${subtitle ? `<div class="view-subtitle">${subtitle}</div>` : ''}
        </div>
        ${table}
      </div>`;
  }

  /* SEARCH VIEW */
  function renderSearch() {
    return `
      <div class="view-enter">
        <div class="view-header">
          <div class="view-title">Search</div>
          <div class="view-subtitle">Find any song, artist, or album via iTunes</div>
        </div>
        <div class="search-bar-wrap">
          <span class="search-icon">◎</span>
          <input type="text" class="search-input" id="searchInput"
                 placeholder="Search for artists, songs, albums…"
                 oninput="App.handleSearch(this.value)"
                 onkeydown="if(event.key==='Enter') App.submitSearch(this.value)"
                 autocomplete="off" spellcheck="false"/>
        </div>
        <div class="search-status" id="searchStatus">Start typing to search real songs from iTunes</div>
        <div id="searchResults"></div>
      </div>`;
  }

  /* LIBRARY VIEW */
  function renderLibrary(tracks, currentId, favorites) {
    if (!tracks.length) return `
      <div class="view-enter">
        <div class="view-header">
          <div class="view-title">Library</div>
        </div>
        <div class="empty-state">
          <div class="empty-icon">◈</div>
          <div class="empty-title">Your library is empty</div>
          <div class="empty-desc">Play tracks from any genre to build your library.</div>
        </div>
      </div>`;

    return `
      <div class="view-enter">
        <div class="view-header">
          <div class="view-title">Library</div>
          <div class="view-subtitle">${tracks.length} tracks</div>
        </div>
        ${_trackTable(tracks, currentId, favorites)}
      </div>`;
  }

  /* FAVORITES VIEW */
  function renderFavorites(tracks, currentId, favorites) {
    if (!tracks.length) return `
      <div class="view-enter">
        <div class="view-header">
          <div class="view-title">Favorites</div>
        </div>
        <div class="empty-state">
          <div class="empty-icon">♡</div>
          <div class="empty-title">No favorites yet</div>
          <div class="empty-desc">Heart any track to save it here.</div>
        </div>
      </div>`;

    return `
      <div class="view-enter">
        <div class="view-header">
          <div class="view-title">Favorites</div>
          <div class="view-subtitle">${tracks.length} liked songs</div>
        </div>
        ${_trackTable(tracks, currentId, favorites)}
      </div>`;
  }

  /* HISTORY VIEW */
  function renderHistory(tracks, currentId, favorites) {
    if (!tracks.length) return `
      <div class="view-enter">
        <div class="view-header">
          <div class="view-title">History</div>
        </div>
        <div class="empty-state">
          <div class="empty-icon">◷</div>
          <div class="empty-title">Nothing played yet</div>
          <div class="empty-desc">Your recently played tracks will appear here.</div>
        </div>
      </div>`;

    return `
      <div class="view-enter">
        <div class="view-header">
          <div class="view-title">Recently Played</div>
          <div class="view-subtitle">${tracks.length} tracks</div>
        </div>
        ${_trackTable(tracks, currentId, favorites)}
      </div>`;
  }

  /* SETTINGS VIEW */
  function renderSettings(settings) {
    return `
      <div class="view-enter">
        <div class="view-header">
          <div class="view-title">Settings</div>
          <div class="view-subtitle">Customize your AuricPlay experience</div>
        </div>
        
        <div class="settings-grid">
          <!-- Playback Settings -->
          <div class="settings-section">
            <h3 class="settings-section-title">Playback</h3>
            
            <div class="settings-item">
              <div class="settings-item-info">
                <div class="settings-item-label">Crossfade Duration</div>
                <div class="settings-item-desc">Smoothly transition between tracks</div>
              </div>
              <div class="settings-item-control">
                <span id="crossfadeVal">${settings.crossfadeDuration}s</span>
                <input type="range" min="0" max="10" step="1" 
                       value="${settings.crossfadeDuration}" 
                       oninput="App.updateSetting('crossfadeDuration', this.value); document.getElementById('crossfadeVal').textContent = this.value + 's'">
              </div>
            </div>
          </div>

          <!-- Appearance / Library Settings -->
          <div class="settings-section">
            <h3 class="settings-section-title">Library</h3>
            
            <div class="settings-item">
              <div class="settings-item-info">
                <div class="settings-item-label">Sort Library By</div>
                <div class="settings-item-desc">How your songs are organized</div>
              </div>
              <div class="settings-item-control">
                <select onchange="App.updateSetting('sortOrder', this.value)">
                  <option value="default" ${settings.sortOrder === 'default' ? 'selected' : ''}>Date Added</option>
                  <option value="az" ${settings.sortOrder === 'az' ? 'selected' : ''}>Title (A-Z)</option>
                  <option value="za" ${settings.sortOrder === 'za' ? 'selected' : ''}>Title (Z-A)</option>
                  <option value="artist" ${settings.sortOrder === 'artist' ? 'selected' : ''}>Artist Name</option>
                </select>
              </div>
            </div>
          </div>

          <!-- App Info -->
          <div class="settings-section">
            <h3 class="settings-section-title">About</h3>
            <div class="settings-item">
              <div class="settings-item-info">
                <div class="settings-item-label">AuricPlay v1.0</div>
                <div class="settings-item-desc">Premium Web Music Player</div>
              </div>
            </div>
          </div>
        </div>
      </div>`;
  }

  /* ─────────────────────────────────────────────
     PLAYER BAR UPDATES
  ───────────────────────────────────────────── */

  function updatePlayerBar(track, isPlaying, favorites) {
    if (!track) return;

    // Dynamic background
    if (track.artwork) {
      document.body.style.backgroundImage = `url("${track.artwork}")`;
      document.body.style.backgroundSize = "cover";
      document.body.style.backgroundPosition = "center";
      document.body.style.backgroundRepeat = "no-repeat";
      document.body.style.transition = "background-image 0.8s ease-in-out";
    }

    // Art
    const pbArt  = qs('#pbArt');
    if (track.artwork) {
      pbArt.innerHTML = `<img src="${track.artwork}" alt="${track.title}"
                              style="width:48px;height:48px;object-fit:cover"
                              onerror="this.parentNode.innerHTML='<span class=pb-art-placeholder>♪</span>'"/>`;
    } else {
      pbArt.innerHTML = `<span class="pb-art-placeholder">♪</span>`;
    }

    // Title / Artist
    qs('#pbTitle').textContent  = track.title;
    qs('#pbArtist').textContent = track.artist;

    // Heart
    const heart = qs('#pbHeart');
    heart.textContent = favorites.has(track.id) ? '♥' : '♡';
    heart.classList.toggle('liked', favorites.has(track.id));

    // Play button
    const playBtn = qs('#playBtn');
    playBtn.textContent = isPlaying ? '⏸' : '▶';
    playBtn.classList.toggle('is-playing', isPlaying);
  }

  function updateProgress(current, duration) {
    const frac = duration > 0 ? current / duration : 0;
    const pct  = (frac * 100).toFixed(2) + '%';

    const els = ['#pbBarFill', '#fsBarFill'];
    els.forEach(sel => {
      const el = qs(sel);
      if (el) el.style.width = pct;
    });

    qs('#pbCurrentTime').textContent = API.formatTime(current);
    qs('#pbTotalTime').textContent   = API.formatTime(duration);

    const fsCur = qs('#fsCurrent');
    const fsTot = qs('#fsTotal');
    if (fsCur) fsCur.textContent = API.formatTime(current);
    if (fsTot) fsTot.textContent = API.formatTime(duration);
  }

  function updateVolume(volume, muted) {
    const slider = qs('#volSlider');
    if (slider) slider.value = Math.round(volume * 100);
    const muteBtn = qs('#muteBtn');
    if (muteBtn) {
      if (muted || volume === 0)       muteBtn.textContent = '🔇';
      else if (volume < 0.4)           muteBtn.textContent = '🔈';
      else if (volume < 0.75)          muteBtn.textContent = '🔉';
      else                             muteBtn.textContent = '🔊';
    }
  }

  function updateShuffleBtn(isOn) {
    const btn = qs('#shuffleBtn');
    if (btn) btn.classList.toggle('active', isOn);
  }

  function updateRepeatBtn(mode) {
    const btn = qs('#repeatBtn');
    if (!btn) return;
    btn.classList.toggle('active', mode !== 'off');
    btn.textContent = mode === 'one' ? '↻¹' : '↺';
    btn.title = mode === 'off' ? 'Repeat off' : mode === 'one' ? 'Repeat one' : 'Repeat all';
  }

  /* ─────────────────────────────────────────────
     FULLSCREEN PANEL
  ───────────────────────────────────────────── */

  function updateFullscreen(track, isPlaying, upNext, favorites) {
    if (!track) return;

    // Background
    const fsBg = qs('#fsBg');
    if (track.artwork) fsBg.style.backgroundImage = `url(${track.artwork})`;

    // Art
    const fsArt = qs('#fsArt');
    fsArt.classList.toggle('is-playing', isPlaying);
    if (track.artwork) {
      fsArt.innerHTML = `<img src="${track.artwork}" alt="${track.title}"
                              style="width:100%;height:100%;object-fit:cover"
                              onerror="this.parentNode.innerHTML='<span class=fs-art-placeholder>♪</span>'"/>`;
    } else {
      fsArt.innerHTML = `<span class="fs-art-placeholder">♪</span>`;
    }

    qs('#fsTitle').textContent  = track.title;
    qs('#fsArtist').textContent = track.artist;
    qs('#fsGenre').textContent  = track.genre;

    // Play button in fullscreen
    qs('#fsPlayBtn').textContent = isPlaying ? '⏸' : '▶';

    // Up Next list
    const upNextEl = qs('#fsUpNext');
    if (upNextEl) {
      upNextEl.innerHTML = upNext.slice(0, 5).map((t, i) => `
        <div class="up-next-item" onclick="App.playTrackById('${t.id}')">
          <div class="un-art">${t.artwork
            ? `<img src="${t.artwork}" style="width:36px;height:36px;object-fit:cover"
                    onerror="this.parentNode.innerHTML='🎵'"/>`
            : '🎵'
          }</div>
          <div class="un-info">
            <div class="un-title">${t.title}</div>
            <div class="un-artist">${t.artist}</div>
          </div>
        </div>`).join('') || '<div style="color:rgba(255,255,255,0.3);font-size:0.78rem">Queue is empty</div>';
    }
  }

  /* ─────────────────────────────────────────────
     QUEUE SIDEBAR
  ───────────────────────────────────────────── */

  function updateQueue(queue, currentId) {
    const el = qs('#queueList');
    if (!el) return;
    if (!queue.length) {
      el.innerHTML = '<div class="queue-empty">No tracks in queue</div>';
      return;
    }
    el.innerHTML = queue.map((t, i) => `
      <div class="queue-item ${t.id === currentId ? 'playing' : ''}"
           onclick="App.playTrackById('${t.id}')">
        <div class="queue-art">${t.artwork
          ? `<img src="${t.artwork}" style="width:32px;height:32px;object-fit:cover;border-radius:5px"
                  onerror="this.parentNode.innerHTML='🎵'"/>`
          : '🎵'
        }</div>
        <div class="queue-item-info">
          <div class="queue-item-title">${t.title}</div>
          <div class="queue-item-artist">${t.artist}</div>
        </div>
      </div>`).join('');
  }

  /* ─────────────────────────────────────────────
     SEARCH RESULTS
  ───────────────────────────────────────────── */

  function showSearchSkeleton() {
    const el = qs('#searchResults');
    const statusEl = qs('#searchStatus');
    if (el) {
      el.innerHTML = `<div class="track-table">
        <div class="track-table-head">
          <div class="th center">#</div><div class="th">TITLE</div>
          <div class="th">ARTIST</div><div class="th">GENRE</div>
          <div class="th right">TIME</div><div class="th"></div>
        </div>
        ${_skeletonRows(6)}
      </div>`;
    }
    if (statusEl) statusEl.textContent = 'Searching iTunes…';
  }

  function showSearchResults(tracks, query, currentId, favorites) {
    const el = qs('#searchResults');
    const statusEl = qs('#searchStatus');
    if (!el) return;

    if (statusEl) {
      statusEl.textContent = tracks.length
        ? `${tracks.length} results for "${query}"`
        : `No results for "${query}"`;
    }

    el.innerHTML = tracks.length
      ? _trackTable(tracks, currentId, favorites)
      : `<div class="empty-state">
           <div class="empty-icon">◎</div>
           <div class="empty-title">No results</div>
           <div class="empty-desc">Try searching for a different artist or song title.</div>
         </div>`;
  }

  /* ─────────────────────────────────────────────
     NAVIGATION ACTIVE STATE
  ───────────────────────────────────────────── */

  function setActiveNav(view) {
    qsa('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.view === view);
    });
  }

  /* ─────────────────────────────────────────────
     FAVORITES BADGE
  ───────────────────────────────────────────── */

  function updateFavBadge(count) {
    const badge = qs('#favBadge');
    if (!badge) return;
    badge.style.display = count > 0 ? 'inline-block' : 'none';
    badge.textContent   = count;
  }

  /* ─────────────────────────────────────────────
     HOME: inject recent / fav sections
  ───────────────────────────────────────────── */

  function injectHomeRecent(tracks, currentId, favorites) {
    const el = qs('#recentSection');
    if (!el || !tracks.length) return;
    el.innerHTML = `
      <div class="section-heading">Recently Played</div>
      ${_trackTable(tracks.slice(0, 5), currentId, favorites)}`;
  }

  function injectHomeFavs(tracks, currentId, favorites) {
    const el = qs('#favSection');
    if (!el || !tracks.length) return;
    el.innerHTML = `
      <div class="section-heading">Your Favorites</div>
      ${_trackTable(tracks.slice(0, 5), currentId, favorites)}`;
  }

  /* ─────────────────────────────────────────────
     EXPOSE
  ───────────────────────────────────────────── */

  return {
    renderHome,
    renderPlaylist,
    renderSearch,
    renderLibrary,
    renderFavorites,
    renderHistory,
    renderSettings,
    updatePlayerBar,
    updateProgress,
    updateVolume,
    updateShuffleBtn,
    updateRepeatBtn,
    updateFullscreen,
    updateQueue,
    showSearchSkeleton,
    showSearchResults,
    setActiveNav,
    updateFavBadge,
    injectHomeRecent,
    injectHomeFavs,
  };

})();

