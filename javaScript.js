'use strict';

const API_BASE = window.NEXTUBE_API_BASE || localStorage.getItem('nx_api_base') || 'http://localhost:5000/api';

const app = {
  user: null,
  videos: [],
  pending: [],
  reports: [],
  users: [],
  comments: {},
  current: null,
  adminTab: 'pending',
  movieFilter: 'all',
  movieSearch: '',
  movieSort: 'rating',
  section: localStorage.getItem('nx_section') || 'movie',
  homeType: localStorage.getItem('nx_section') || 'movie',
  searchQuery: '',
  searchType: localStorage.getItem('nx_section') || 'movie',
  searchSort: 'relevance',
};

const $ = (id) => document.getElementById(id);
const qs = (sel, root = document) => root.querySelector(sel);
const qsa = (sel, root = document) => [...root.querySelectorAll(sel)];
const routes = new Set(['home', 'movies', 'creators', 'watchlist', 'later', 'history', 'search', 'upload', 'admin']);

function token() {
  return localStorage.getItem('nx_token') || '';
}

async function api(path, options = {}) {
  const isForm = options.body instanceof FormData;
  const headers = { ...(isForm ? {} : { 'Content-Type': 'application/json' }), ...(options.headers || {}) };
  if (token()) headers.Authorization = `Bearer ${token()}`;
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function fmtNum(n = 0) {
  n = Number(n || 0);
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return `${n}`;
}

function fmtRuntime(sec = 0) {
  sec = Number(sec || 0);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h) return `${h}h ${m}m`;
  return `${m || 1}m`;
}

function fmtDate(value) {
  const date = new Date(value || Date.now());
  const days = Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function toast(message, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  $('toastRegion').appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(8px)';
    setTimeout(() => el.remove(), 240);
  }, 3200);
}

function normalizeVideo(v) {
  return {
    ...v,
    views: Number(v.views || 0),
    likes: Number(v.likes || 0),
    dislikes: Number(v.dislikes || 0),
    duration: Number(v.duration || 0),
    category: String(v.category || 'movie').toLowerCase(),
    contentKind: v.contentKind || 'creator-video',
    playable: v.playable !== false && !!v.url,
    year: v.year || '',
    genre: v.genre || v.category || '',
    director: v.director || v.creatorName || '',
    cast: Array.isArray(v.cast) ? v.cast : [],
    rating: v.rating || '',
    maturity: v.maturity || '',
    emoji: v.emoji || '▶',
    creatorColor: v.creatorColor || '#334155',
    creatorAvatar: v.creatorAvatar || (v.title || 'N').charAt(0),
    date: v.date || new Date().toISOString(),
    tags: Array.isArray(v.tags) ? v.tags : [],
    thumbnail: String(v.thumbnail || '').trim(),
  };
}

function watchlist() {
  try { return JSON.parse(localStorage.getItem('nx_watchlist') || '[]'); }
  catch (_) { return []; }
}

function storedList(key) {
  try { return JSON.parse(localStorage.getItem(key) || '[]'); }
  catch (_) { return []; }
}

function saveStoredList(key, ids) {
  localStorage.setItem(key, JSON.stringify([...new Set(ids)]));
  renderSavedCounts();
}

function watchLater() {
  return storedList('nx_watch_later');
}

function historyList() {
  return storedList('nx_history');
}

function addWatchLater(id) {
  const ids = watchLater();
  if (!ids.includes(id)) ids.unshift(id);
  saveStoredList('nx_watch_later', ids.slice(0, 100));
  toast('Added to Watch Later', 'success');
}

function addHistory(id) {
  saveStoredList('nx_history', [id, ...historyList().filter((x) => x !== id)].slice(0, 100));
}

function saveWatchlist(ids) {
  localStorage.setItem('nx_watchlist', JSON.stringify([...new Set(ids)]));
  renderSavedCounts();
}

function isSaved(id) {
  return watchlist().includes(id);
}

function addSaved(id) {
  const ids = watchlist();
  if (!ids.includes(id)) ids.push(id);
  saveWatchlist(ids);
  toast('Saved to Watchlist', 'success');
}

function removeSaved(id) {
  saveWatchlist(watchlist().filter((x) => x !== id));
  toast('Removed from Watchlist', 'info');
}

function renderWatchlistCounts() {
  const count = watchlist().length;
  if ($('navWatchlistCount')) $('navWatchlistCount').textContent = `${count} saved`;
}

function renderSavedCounts() {
  renderWatchlistCounts();
  if ($('navLaterCount')) $('navLaterCount').textContent = `${watchLater().length} queued`;
  if ($('navHistoryCount')) $('navHistoryCount').textContent = `${historyList().length} watched`;
}

function sectionLabel(kind = app.section) {
  return kind === 'movie' ? 'Movies' : 'Videos';
}

function sectionRoute(kind = app.section) {
  return kind === 'movie' ? 'movies' : 'creators';
}

function sectionItems(kind = app.section) {
  return app.videos.filter((v) => v.contentKind === kind);
}

function posterStyle(video) {
  const image = video.thumbnail ? `;--poster-image:url('${String(video.thumbnail).replace(/'/g, '%27')}')` : '';
  return `--poster-color:${video.creatorColor || '#334155'}${image}`;
}

function metaPills(video) {
  const items = [
    video.year || fmtDate(video.date),
    video.genre || video.category,
    video.duration ? fmtRuntime(video.duration) : '',
    video.rating ? `${video.rating}/100` : '',
    video.maturity || '',
  ].filter(Boolean);
  return items.map((item) => `<span class="meta-pill">${item}</span>`).join('');
}

function mediaCard(video, mode = 'poster') {
  const el = document.createElement('article');
  el.className = `media-card ${video.contentKind === 'movie' ? 'movie' : 'creator'}`;
  el.innerHTML = `
    <button class="poster-thumb" style="${posterStyle(video)}" data-open>
      <strong>${video.title}</strong>
      <small>${video.year || video.creatorName || video.category}</small>
    </button>
    <div class="media-body">
      <span class="section-kicker">${video.contentKind === 'movie' ? 'Movie' : 'Video'}</span>
      <h3>${video.title}</h3>
      <p>${(video.description || '').slice(0, mode === 'poster' ? 90 : 160)}${(video.description || '').length > 90 ? '...' : ''}</p>
      <div class="media-meta">${metaPills(video)}</div>
      <div class="card-actions">
        <button class="glass-button" data-open><span class="action-icon">${video.playable ? '▶' : 'ⓘ'}</span>${video.playable ? 'Play' : 'Details'}</button>
        <button class="glass-button" data-save><span class="action-icon">＋</span>${isSaved(video.id) ? 'Saved' : 'Save'}</button>
        <button class="glass-button" data-later><span class="action-icon">⏱</span>Later</button>
      </div>
    </div>`;
  qsa('[data-open]', el).forEach((btn) => btn.addEventListener('click', () => openVideo(video)));
  qs('[data-save]', el).addEventListener('click', () => isSaved(video.id) ? removeSaved(video.id) : addSaved(video.id));
  qs('[data-later]', el).addEventListener('click', () => addWatchLater(video.id));
  return el;
}

function smartCard(video) {
  const el = document.createElement('article');
  el.className = 'smart-card';
  el.innerHTML = `
    <div class="smart-thumb" style="${posterStyle(video)}"><strong>${video.emoji}</strong></div>
    <div>
      <span class="section-kicker">${video.genre || video.category}</span>
      <h3>${video.title}</h3>
      <p>${(video.description || '').slice(0, 110)}${(video.description || '').length > 110 ? '...' : ''}</p>
      <div class="media-meta">${metaPills(video)}</div>
      <div class="smart-actions">
        <button class="primary-button" data-open><span class="action-icon">${video.playable ? '▶' : 'ⓘ'}</span>${video.playable ? 'Play' : 'Details'}</button>
        <button class="glass-button" data-save><span class="action-icon">＋</span>${isSaved(video.id) ? 'Saved' : 'Save'}</button>
        <button class="glass-button" data-later><span class="action-icon">⏱</span>Later</button>
      </div>
    </div>`;
  qs('[data-open]', el).addEventListener('click', () => openVideo(video));
  qs('[data-save]', el).addEventListener('click', () => isSaved(video.id) ? removeSaved(video.id) : addSaved(video.id));
  qs('[data-later]', el).addEventListener('click', () => addWatchLater(video.id));
  return el;
}

function compactItem(video) {
  const el = document.createElement('button');
  el.className = 'compact-item';
  el.innerHTML = `
    <span class="compact-poster" style="${posterStyle(video)}">${video.emoji}</span>
    <span><h3>${video.title}</h3><p>${video.contentKind === 'movie' ? `${video.year} · ${video.genre}` : `${video.creatorName} · ${fmtDate(video.date)}`}</p></span>
    <span class="meta-pill">${video.playable ? 'Play' : 'Info'}</span>`;
  el.addEventListener('click', () => openVideo(video));
  return el;
}

async function loadData() {
  try {
    const videos = await api('/videos');
    app.videos = videos.map(normalizeVideo);
    $('apiDot').className = 'status-dot online';
    $('apiStatus').textContent = 'Online';
    $('apiDetail').textContent = `${app.videos.length} records`;
  } catch (err) {
    $('apiDot').className = 'status-dot offline';
    $('apiStatus').textContent = 'Offline';
    $('apiDetail').textContent = 'Using empty state';
    toast('Backend is offline. Start the backend server to load data.', 'error');
  }
}

async function loadMe() {
  const saved = localStorage.getItem('nx_user');
  if (saved) {
    try { app.user = JSON.parse(saved); }
    catch (_) { app.user = null; }
  }
  if (token()) {
    try {
      const result = await api('/me');
      app.user = result.user;
      localStorage.setItem('nx_user', JSON.stringify(app.user));
    } catch (_) {
      localStorage.removeItem('nx_token');
      localStorage.removeItem('nx_user');
      app.user = null;
    }
  }
  renderAuthState();
}

function renderAuthState() {
  const signedIn = !!app.user;
  $('authButton').classList.toggle('hidden', signedIn);
  $('profileButton').classList.toggle('hidden', !signedIn);
  $('quickUpload').classList.toggle('hidden', !signedIn);
  $('adminNav').classList.toggle('hidden', !signedIn || app.user.role !== 'admin');
  $('profileAdminLink')?.classList.toggle('hidden', !signedIn || app.user.role !== 'admin');
  if (signedIn) {
    $('profileButton').textContent = (app.user.avatar || app.user.name || 'U').charAt(0).toUpperCase();
    $('profileMenuAvatar').textContent = $('profileButton').textContent;
    $('profileMenuName').textContent = app.user.name || 'User';
    $('profileMenuEmail').textContent = app.user.email || '';
  }
  applyPreferences();
}

function applyPreferences() {
  document.body.classList.toggle('simple-mode', app.user?.preferences?.experience === 'simple');
  document.body.classList.toggle('creator-mode', app.user?.preferences?.experience === 'creator');
}

function maybeOpenOnboarding(force = false) {
  if (!app.user || app.user.onboarded) return;
  const key = `nx_onboarding_seen_${app.user.id}`;
  if (!force && sessionStorage.getItem(key)) return;
  sessionStorage.setItem(key, '1');
  openModal('onboardingModal');
}

function submitGlobalSearch(query) {
  app.searchQuery = String(query || '').trim();
  if (!app.searchQuery) return;
  $('globalSearch').value = app.searchQuery;
  app.searchType = app.section;
  hideSearchSuggestions();
  showView('search');
}

function searchMatches(query, limit = 8) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  return sectionItems(app.section)
    .map((v) => {
      const haystack = `${v.title} ${v.description} ${v.genre} ${v.category} ${v.creatorName} ${v.director} ${v.cast.join(' ')} ${v.tags.join(' ')}`.toLowerCase();
      let score = 0;
      if (v.title.toLowerCase().startsWith(q)) score += 12;
      if (v.title.toLowerCase().includes(q)) score += 8;
      if (haystack.includes(q)) score += 3;
      return { v, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || Number(b.v.rating || b.v.views || 0) - Number(a.v.rating || a.v.views || 0))
    .slice(0, limit)
    .map((item) => item.v);
}

function hideSearchSuggestions() {
  $('searchSuggestions')?.classList.add('hidden');
}

function renderSearchSuggestions() {
  const root = $('searchSuggestions');
  if (!root) return;
  const q = $('globalSearch').value.trim();
  const matches = searchMatches(q, 7);
  if (!q || !matches.length) {
    root.classList.add('hidden');
    root.innerHTML = '';
    return;
  }
  root.innerHTML = `
    <div class="suggestion-head"><strong>${sectionLabel()}</strong><span>${matches.length} live match${matches.length === 1 ? '' : 'es'}</span></div>
    ${matches.map((video) => `
      <button class="suggestion-item" data-id="${video.id}" type="button">
        <span class="suggestion-thumb" style="${posterStyle(video)}"></span>
        <span><strong>${video.title}</strong><small>${video.contentKind === 'movie' ? `${video.year || ''} ${video.genre || ''}` : `${video.creatorName || 'Creator'} ${fmtRuntime(video.duration)}`}</small></span>
      </button>
    `).join('')}
    <button class="suggestion-search" type="button">Search ${sectionLabel()} for "${q}"</button>`;
  qsa('[data-id]', root).forEach((btn) => {
    btn.addEventListener('click', () => {
      const video = app.videos.find((v) => v.id === btn.dataset.id);
      hideSearchSuggestions();
      if (video) openVideo(video);
    });
  });
  qs('.suggestion-search', root)?.addEventListener('click', () => submitGlobalSearch(q));
  root.classList.remove('hidden');
}

function setSection(kind, navigate = false) {
  app.section = kind === 'creator-video' ? 'creator-video' : 'movie';
  app.homeType = app.section;
  app.searchType = app.section;
  localStorage.setItem('nx_section', app.section);
  qsa('.section-choice').forEach((btn) => btn.classList.toggle('active', btn.dataset.section === app.section));
  if ($('typeFilter')) $('typeFilter').value = app.section;
  if ($('searchTypeFilter')) $('searchTypeFilter').value = app.section;
  qsa('.section-browse').forEach((btn) => {
    btn.dataset.view = sectionRoute();
    btn.textContent = app.section === 'movie' ? 'Browse Movies' : 'Browse Videos';
  });
  renderSearchSuggestions();
  if (navigate) showView(sectionRoute());
}

function pickFeatured() {
  return sectionItems()[0] || app.videos[0];
}

function renderHome() {
  const featured = pickFeatured();
  if (featured) {
    app.current = featured;
    $('heroTitle').textContent = featured.title;
    $('heroDescription').textContent = featured.description || 'Featured from the backend catalog.';
    $('heroMeta').innerHTML = metaPills(featured);
    $('heroPoster').style.cssText = posterStyle(featured);
    $('heroPoster').innerHTML = `<strong>${featured.title}</strong><small>${featured.year || featured.creatorName || featured.category}</small>`;
  }

  const movies = app.videos.filter((v) => v.contentKind === 'movie');
  const creators = app.videos.filter((v) => v.contentKind !== 'movie');
  $('recommendTitle').textContent = app.section === 'movie'
    ? 'Tell NexTube what movie you feel like watching.'
    : 'Tell NexTube what video you feel like watching.';
  const currentItems = sectionItems(app.section);
  $('metricLibrary').textContent = fmtNum(currentItems.length);
  $('metricViews').textContent = fmtNum(currentItems.reduce((sum, v) => sum + v.views, 0));
  $('metricMovies').textContent = fmtNum(movies.length);
  $('metricPending').textContent = fmtNum(app.pending.length);
  $('heroCatalogCount').textContent = `${currentItems.length} ${app.section === 'movie' ? 'movies' : 'videos'}`;
  $('heroQueueCount').textContent = `${app.pending.length} pending`;

  setSection(app.section, false);
  renderSmartRail();
  renderMovieFilters();
  renderMovieGrid();
  renderTypedGrid();
  renderCompactList('creatorGrid', creators.slice(0, 6), 'No approved creator videos yet.');
  renderWatchlistPreview();
  renderSavedCounts();
  const bands = qsa('#homeView > .content-band');
  if (bands[2]) bands[2].classList.toggle('hidden', app.section !== 'movie');
  qs('#homeView .split-band')?.classList.add('hidden');
}

function filteredSmart() {
  const mood = $('moodFilter')?.value || 'all';
  const length = $('lengthFilter')?.value || 'all';
  const type = $('typeFilter')?.value || app.section;
  if (type !== app.section) setSection(type, false);
  let list = sectionItems(app.section);
  if (mood === 'intense') list = list.filter((v) => ['action', 'thriller', 'crime', 'sci-fi'].includes(v.category));
  if (mood === 'comfort') list = list.filter((v) => ['comedy', 'animation', 'romance', 'music'].includes(v.category));
  if (mood === 'smart') list = list.filter((v) => ['drama', 'history', 'education', 'tech'].includes(v.category) || Number(v.rating || 0) >= 88);
  if (mood === 'family') list = list.filter((v) => ['animation', 'comedy', 'fantasy'].includes(v.category) || ['G', 'PG'].includes(v.maturity));
  if (length === 'short') list = list.filter((v) => v.duration < 7200);
  if (length === 'standard') list = list.filter((v) => v.duration >= 7200 && v.duration <= 9000);
  if (length === 'epic') list = list.filter((v) => v.duration > 9000);
  return list.sort((a, b) => Number(b.rating || b.views || 0) - Number(a.rating || a.views || 0));
}

function renderSmartRail() {
  const rail = $('smartRail');
  rail.innerHTML = '';
  const list = filteredSmart().slice(0, 8);
  if (!list.length) {
    rail.innerHTML = '<p class="meta-pill">No matches. Change filters or upload more content.</p>';
    return;
  }
  list.forEach((video) => rail.appendChild(smartCard(video)));
}

function renderMovieFilters() {
  const root = $('movieFilters');
  const genres = ['all', ...new Set(app.videos.filter((v) => v.contentKind === 'movie').map((v) => v.category))].slice(0, 10);
  root.innerHTML = '';
  genres.forEach((genre) => {
    const btn = document.createElement('button');
    btn.className = `pill ${app.movieFilter === genre ? 'active' : ''}`;
    btn.textContent = genre === 'all' ? 'All' : genre.replace(/\b\w/g, (m) => m.toUpperCase());
    btn.addEventListener('click', () => {
      app.movieFilter = genre;
      renderMovieFilters();
      renderMovieGrid();
    });
    root.appendChild(btn);
  });
}

function movieList() {
  let movies = app.videos.filter((v) => v.contentKind === 'movie');
  if (app.movieFilter !== 'all') movies = movies.filter((v) => v.category === app.movieFilter);
  if (app.movieSearch) {
    const q = app.movieSearch.toLowerCase();
    movies = movies.filter((v) => `${v.title} ${v.director} ${v.genre} ${v.cast.join(' ')}`.toLowerCase().includes(q));
  }
  movies.sort((a, b) => {
    if (app.movieSort === 'year') return Number(b.year || 0) - Number(a.year || 0);
    if (app.movieSort === 'title') return a.title.localeCompare(b.title);
    return Number(b.rating || 0) - Number(a.rating || 0);
  });
  return movies;
}

function renderMovieGrid() {
  const grid = $('movieGrid');
  grid.innerHTML = '';
  movieList().slice(0, 12).forEach((video) => grid.appendChild(mediaCard(video)));
}

function renderTypedGrid() {
  const grid = $('typedGrid');
  if (!grid) return;
  const title = $('typedTitle');
  let list = sectionItems(app.section);
  if (title) {
    title.textContent = sectionLabel();
  }
  grid.innerHTML = '';
  list.slice(0, 8).forEach((video) => grid.appendChild(mediaCard(video)));
}

function renderMoviesPage() {
  const grid = $('moviesPageGrid');
  grid.innerHTML = '';
  const list = movieList();
  if (!list.length) {
    grid.innerHTML = '<p class="meta-pill">No movies match your filters.</p>';
    return;
  }
  list.forEach((video) => grid.appendChild(mediaCard(video)));
}

function renderCreatorsPage() {
  const grid = $('creatorsPageGrid');
  grid.innerHTML = '';
  const creators = app.videos.filter((v) => v.contentKind !== 'movie');
  if (!creators.length) {
    grid.innerHTML = '<p class="meta-pill">No approved creator uploads yet.</p>';
    return;
  }
  creators.forEach((video) => grid.appendChild(mediaCard(video, 'wide')));
}

function renderCompactList(id, list, empty) {
  const root = $(id);
  root.innerHTML = '';
  if (!list.length) {
    root.innerHTML = `<p class="meta-pill">${empty}</p>`;
    return;
  }
  list.forEach((video) => root.appendChild(compactItem(video)));
}

function renderWatchlistPreview() {
  const ids = watchlist();
  const saved = sectionItems().filter((v) => ids.includes(v.id)).slice(0, 6);
  renderCompactList('watchlistPreview', saved, `Save ${sectionLabel().toLowerCase()} to see them here.`);
  renderSavedCounts();
}

function renderWatchlistPage() {
  const grid = $('watchlistGrid');
  const saved = sectionItems().filter((v) => watchlist().includes(v.id));
  grid.innerHTML = '';
  if (!saved.length) {
    grid.innerHTML = `<p class="meta-pill">Your ${sectionLabel()} Watchlist is empty.</p>`;
    return;
  }
  saved.forEach((video) => grid.appendChild(mediaCard(video)));
}

function renderLaterPage() {
  const grid = $('laterGrid');
  const saved = sectionItems().filter((v) => watchLater().includes(v.id));
  grid.innerHTML = '';
  if (!saved.length) {
    grid.innerHTML = `<p class="meta-pill">Your ${sectionLabel()} Watch Later queue is empty.</p>`;
    return;
  }
  saved.forEach((video) => grid.appendChild(mediaCard(video)));
}

function renderHistoryPage() {
  const grid = $('historyGrid');
  const items = historyList().map((id) => app.videos.find((v) => v.id === id)).filter((v) => v && v.contentKind === app.section);
  grid.innerHTML = '';
  if (!items.length) {
    grid.innerHTML = `<p class="meta-pill">No ${sectionLabel()} watch history yet.</p>`;
    return;
  }
  items.forEach((video) => grid.appendChild(mediaCard(video)));
}

function searchResults() {
  const q = app.searchQuery.trim().toLowerCase();
  app.searchType = app.section;
  let list = sectionItems(app.section);
  if (q) {
    list = list.map((v) => {
      const haystack = `${v.title} ${v.description} ${v.genre} ${v.category} ${v.creatorName} ${v.director} ${v.cast.join(' ')} ${v.tags.join(' ')}`.toLowerCase();
      let score = 0;
      if (v.title.toLowerCase().includes(q)) score += 8;
      if (haystack.includes(q)) score += 3;
      if ((v.genre || '').toLowerCase().includes(q) || v.category.includes(q)) score += 2;
      return { v, score };
    }).filter((item) => item.score > 0);
  } else {
    list = list.map((v) => ({ v, score: 1 }));
  }
  list.sort((a, b) => {
    if (app.searchSort === 'rating') return Number(b.v.rating || 0) - Number(a.v.rating || 0);
    if (app.searchSort === 'new') return new Date(b.v.date) - new Date(a.v.date);
    if (app.searchSort === 'views') return Number(b.v.views || 0) - Number(a.v.views || 0);
    return b.score - a.score;
  });
  return list.map((item) => item.v);
}

function renderSearchPage() {
  const grid = $('searchGrid');
  if ($('searchTypeFilter')) $('searchTypeFilter').value = app.section;
  const results = searchResults();
  $('searchSummary').textContent = app.searchQuery
    ? `${results.length} result${results.length === 1 ? '' : 's'} for "${app.searchQuery}".`
    : `Search across ${sectionLabel().toLowerCase()}, creators, directors, cast, and tags.`;
  grid.innerHTML = '';
  if (!results.length) {
    grid.innerHTML = '<p class="meta-pill">No results found.</p>';
    return;
  }
  results.forEach((video) => grid.appendChild(mediaCard(video)));
}

function currentRoute() {
  const raw = String(location.hash || '').replace('#', '').trim();
  return routes.has(raw) ? raw : 'home';
}

function syncRoute(name, push) {
  if (!routes.has(name)) return;
  const nextHash = `#${name}`;
  const state = { view: name };
  if (push && location.hash !== nextHash) window.history.pushState(state, '', nextHash);
  if (!push && location.hash !== nextHash) window.history.replaceState(state, '', nextHash);
}

function showView(name, push = true) {
  if (!routes.has(name)) name = 'home';
  if (name === 'movies') setSection('movie', false);
  if (name === 'creators') setSection('creator-video', false);
  qsa('.view').forEach((v) => v.classList.remove('active'));
  $(`${name}View`)?.classList.add('active');
  qsa('.nav-link').forEach((btn) => btn.classList.toggle('active', btn.dataset.view === name));
  if (name === 'home') renderHome();
  if (name === 'movies') renderMoviesPage();
  if (name === 'creators') renderCreatorsPage();
  if (name === 'watchlist') renderWatchlistPage();
  if (name === 'later') renderLaterPage();
  if (name === 'history') renderHistoryPage();
  if (name === 'search') renderSearchPage();
  if (name === 'admin') renderAdmin();
  syncRoute(name, push);
  if (window.innerWidth <= 820) document.body.classList.remove('sidebar-open');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openVideo(video) {
  app.current = video;
  addHistory(video.id);
  if (!video.playable) {
    openDetail(video);
    return;
  }
  $('player').src = video.url;
  $('playerTitle').textContent = video.title;
  $('playerDescription').textContent = video.description || '';
  $('likeCount').textContent = fmtNum(video.likes);
  $('dislikeCount').textContent = fmtNum(video.dislikes);
  $('downloadButton').href = video.url;
  $('downloadButton').download = `${video.title}.mp4`;
  openModal('playerModal');
  api(`/videos/${video.id}/view`, { method: 'POST', body: '{}' }).then((data) => { video.views = data.views; renderHome(); }).catch(() => {});
  loadComments(video.id);
}

function openDetail(video) {
  $('detailContent').innerHTML = `
    <div class="detail-layout">
      <div class="detail-poster" style="${posterStyle(video)}"><strong>${video.title}</strong><small>${video.year || video.creatorName || video.category}</small></div>
      <div class="detail-copy">
        <span class="section-kicker">${video.contentKind === 'movie' ? 'Catalog movie' : 'Creator upload'}</span>
        <h2>${video.title}</h2>
        <div class="detail-meta">${metaPills(video)}</div>
        <p>${video.description || 'No description yet.'}</p>
        <div class="detail-grid">
          <div class="detail-line"><strong>Director</strong><span>${video.director || video.creatorName || 'Unknown'}</span></div>
          <div class="detail-line"><strong>Cast</strong><span>${video.cast.length ? video.cast.join(', ') : 'Not listed'}</span></div>
          <div class="detail-line"><strong>Backend ID</strong><span>${video.id}</span></div>
        </div>
        ${video.playable ? '' : '<div class="license-note">This catalog record uses authentic metadata. Full playback needs licensed/uploaded media files.</div>'}
        <div class="hero-actions">
          <button class="primary-button large" id="detailSave">${isSaved(video.id) ? 'Remove from Watchlist' : 'Save to Watchlist'}</button>
          <button class="glass-button large" id="detailLater">Watch Later</button>
          ${video.playable ? '<button class="glass-button large" id="detailPlay">Play</button>' : ''}
        </div>
      </div>
    </div>`;
  $('detailSave').addEventListener('click', () => isSaved(video.id) ? removeSaved(video.id) : addSaved(video.id));
  $('detailLater').addEventListener('click', () => addWatchLater(video.id));
  $('detailPlay')?.addEventListener('click', () => { closeModals(); openVideo(video); });
  openModal('detailModal');
}

function openModal(id) {
  $(id).classList.remove('hidden');
}

function closeModals() {
  qsa('.modal-layer').forEach((m) => m.classList.add('hidden'));
  if ($('player')) $('player').pause();
}

async function loadComments(videoId) {
  const list = $('commentList');
  list.innerHTML = '<p class="meta-pill">Loading comments...</p>';
  try {
    const comments = await api(`/videos/${videoId}/comments`);
    app.comments[videoId] = comments;
    renderComments(videoId);
  } catch (_) {
    list.innerHTML = '<p class="meta-pill">Comments unavailable.</p>';
  }
}

function renderComments(videoId) {
  const comments = app.comments[videoId] || [];
  $('commentList').innerHTML = comments.length
    ? comments.map((c) => `<article class="comment-item"><strong>${c.name || c.author || 'Viewer'}</strong><p>${c.text}</p></article>`).join('')
    : '<p class="meta-pill">No comments yet.</p>';
}

async function postComment() {
  if (!app.user) return openAuth();
  const text = $('commentInput').value.trim();
  if (!text || !app.current) return;
  try {
    const comment = await api(`/videos/${app.current.id}/comments`, { method: 'POST', body: JSON.stringify({ text }) });
    app.comments[app.current.id] = [comment, ...(app.comments[app.current.id] || [])];
    app.current.commentCount = (app.current.commentCount || 0) + 1;
    const item = app.videos.find((v) => v.id === app.current.id);
    if (item) item.commentCount = app.current.commentCount;
    $('commentInput').value = '';
    renderComments(app.current.id);
    toast('Comment posted', 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function react(type) {
  if (!app.user) return openAuth();
  if (!app.current) return;
  try {
    const data = await api(`/videos/${app.current.id}/like`, { method: 'POST', body: JSON.stringify({ type }) });
    app.current.likes = data.likes;
    app.current.dislikes = data.dislikes;
    app.current.reaction = data.reaction;
    const item = app.videos.find((v) => v.id === app.current.id);
    if (item) {
      item.likes = data.likes;
      item.dislikes = data.dislikes;
      item.reaction = data.reaction;
    }
    $('likeCount').textContent = fmtNum(data.likes);
    $('dislikeCount').textContent = fmtNum(data.dislikes);
    toast(data.reaction ? `${type === 'like' ? 'Like' : 'Dislike'} saved to backend` : 'Reaction removed', 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function reportCurrent() {
  if (!app.user) return openAuth();
  if (!app.current) return;
  try {
    await api(`/videos/${app.current.id}/report`, { method: 'POST', body: JSON.stringify({ reason: 'Reported from frontend player' }) });
    toast('Report sent to admin', 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
}

function openAuth() {
  openModal('authModal');
}

async function login(e) {
  e.preventDefault();
  try {
    const result = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: $('loginEmail').value.trim(), password: $('loginPassword').value }),
    });
    app.user = result.user;
    localStorage.setItem('nx_token', result.token);
    localStorage.setItem('nx_user', JSON.stringify(result.user));
    renderAuthState();
    closeModals();
    toast(`Welcome, ${app.user.name}`, 'success');
    maybeOpenOnboarding();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function register(e) {
  e.preventDefault();
  try {
    const result = await api('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: $('registerName').value.trim(),
        email: $('registerEmail').value.trim(),
        password: $('registerPassword').value,
        role: $('registerRole').value,
      }),
    });
    app.user = result.user;
    localStorage.setItem('nx_token', result.token);
    localStorage.setItem('nx_user', JSON.stringify(result.user));
    renderAuthState();
    closeModals();
    toast(`Account created, ${app.user.name}`, 'success');
    maybeOpenOnboarding(true);
  } catch (err) {
    toast(err.message, 'error');
  }
}

function logout() {
  localStorage.removeItem('nx_token');
  localStorage.removeItem('nx_user');
  app.user = null;
  renderAuthState();
  $('profileMenu').classList.add('hidden');
  toast('Signed out', 'info');
}

async function uploadVideo(e) {
  e.preventDefault();
  if (!app.user) return openAuth();
  const file = $('uploadVideo').files[0];
  if (!file) return toast('Choose a video file first', 'error');
  const contentKind = $('uploadKind')?.value === 'movie' ? 'movie' : 'creator-video';
  const minutes = Math.max(1, Number($('uploadRuntime')?.value || 5));
  if (contentKind === 'movie' && minutes < 30) {
    $('uploadRuntime')?.focus();
    return toast('Movie uploads must be 30 minutes or longer.', 'error');
  }
  const form = new FormData();
  form.append('video', file);
  if ($('uploadThumbnail').files[0]) form.append('thumbnail', $('uploadThumbnail').files[0]);
  form.append('title', $('uploadTitle').value.trim());
  form.append('description', $('uploadDescription').value.trim());
  form.append('category', $('uploadCategory').value);
  form.append('visibility', $('uploadVisibility').value);
  form.append('tags', $('uploadTags').value);
  form.append('duration', String(Math.round(minutes * 60)));
  form.append('contentKind', contentKind);
  form.append('captions', $('uploadCaptions')?.value || '');
  try {
    const result = await api('/videos/upload', { method: 'POST', body: form });
    toast(result.message || 'Uploaded', 'success');
    $('uploadForm').reset();
    $('videoFileName').textContent = 'Choose video file';
    updateUploadKindUI();
    await loadData();
    renderHome();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function renderAdmin() {
  if (!app.user) return openAuth();
  if (app.user.role !== 'admin') return toast('Admin access required', 'error');
  try {
    const data = await api('/admin/overview');
    app.pending = (data.pendingVideos || []).map(normalizeVideo);
    app.reports = data.reports || [];
    app.users = data.users || [];
    $('adminTotal').textContent = fmtNum(data.totalVideos || 0);
    $('adminPending').textContent = fmtNum(data.pendingCount || 0);
    $('adminReports').textContent = fmtNum(data.reportedCount || 0);
    $('adminUsers').textContent = fmtNum(data.totalUsers || 0);
    renderAdminPanel();
  } catch (err) {
    toast(err.message, 'error');
  }
}

function renderAdminPanel() {
  const panel = $('adminPanel');
  if (app.adminTab === 'pending') {
    panel.innerHTML = app.pending.length ? '' : '<p class="meta-pill">No pending uploads.</p>';
    app.pending.forEach((v) => {
      const row = document.createElement('article');
      row.className = 'admin-row';
      row.innerHTML = `<div><strong>${v.title}</strong><p>${v.creatorName} · ${v.category} · ${fmtDate(v.date)}</p></div><div class="admin-actions"><button class="primary-button" data-approve>Approve</button><button class="danger-button" data-reject>Reject</button><button class="glass-button" data-preview>Preview</button></div>`;
      qs('[data-approve]', row).addEventListener('click', () => moderate(v.id, 'approve'));
      qs('[data-reject]', row).addEventListener('click', () => moderate(v.id, 'reject'));
      qs('[data-preview]', row).addEventListener('click', () => openVideo(v));
      panel.appendChild(row);
    });
  }
  if (app.adminTab === 'reports') {
    panel.innerHTML = app.reports.length ? app.reports.map((r) => `<article class="admin-row"><div><strong>${r.videoTitle || 'Reported content'}</strong><p>${r.reporterName || 'Viewer'} · ${r.reason || 'No reason'} · ${fmtDate(r.createdAt)}</p></div></article>`).join('') : '<p class="meta-pill">No reports.</p>';
  }
  if (app.adminTab === 'users') {
    panel.innerHTML = `<table class="users-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Action</th></tr></thead><tbody>${app.users.map((u) => `<tr><td>${u.name}</td><td>${u.email}</td><td>${u.role}</td><td>${u.status}</td><td><button class="glass-button" data-user="${u.id}" data-status="${u.status === 'banned' ? 'active' : 'banned'}">${u.status === 'banned' ? 'Unban' : 'Ban'}</button></td></tr>`).join('')}</tbody></table>`;
    qsa('[data-user]', panel).forEach((btn) => btn.addEventListener('click', () => setUserStatus(btn.dataset.user, btn.dataset.status)));
  }
}

async function moderate(id, action) {
  try {
    await api(`/admin/videos/${id}/${action}`, { method: 'POST', body: '{}' });
    toast(action === 'approve' ? 'Published' : 'Rejected', 'success');
    await loadData();
    await renderAdmin();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function setUserStatus(id, status) {
  try {
    await api(`/admin/users/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
    toast('User updated', 'success');
    await renderAdmin();
  } catch (err) {
    toast(err.message, 'error');
  }
}

function buildCommands(query = '') {
  const q = query.toLowerCase();
  const actions = [
    { label: 'Home dashboard', hint: 'Page', run: () => showView('home') },
    { label: 'Movie catalog', hint: 'Page', run: () => showView('movies') },
    { label: 'Upload studio', hint: 'Action', run: () => showView('upload') },
    { label: 'Admin center', hint: 'Admin', run: () => showView('admin') },
    { label: 'Watchlist', hint: 'Saved', run: () => showView('watchlist') },
    { label: 'Watch Later', hint: 'Queue', run: () => showView('later') },
    { label: 'History', hint: 'Activity', run: () => showView('history') },
  ];
  const videos = app.videos
    .filter((v) => !q || `${v.title} ${v.genre} ${v.creatorName} ${v.director}`.toLowerCase().includes(q))
    .slice(0, 12)
    .map((v) => ({ label: v.title, hint: v.contentKind === 'movie' ? `${v.year} · ${v.genre}` : v.creatorName, run: () => openVideo(v) }));
  return [...actions.filter((a) => !q || a.label.toLowerCase().includes(q)), ...videos].slice(0, 14);
}

function renderCommands() {
  const root = $('commandResults');
  const commands = buildCommands($('commandInput').value);
  root.innerHTML = '';
  commands.forEach((cmd) => {
    const btn = document.createElement('button');
    btn.className = 'command-result';
    btn.innerHTML = `<strong>${cmd.label}</strong><small>${cmd.hint}</small>`;
    btn.addEventListener('click', () => {
      closeModals();
      cmd.run();
    });
    root.appendChild(btn);
  });
}

function openCommandPalette() {
  openModal('commandPalette');
  $('commandInput').value = '';
  renderCommands();
  setTimeout(() => $('commandInput').focus(), 50);
}

function attachHelp() {
  qsa('.helpable').forEach((el) => {
    if (el.matches('button, a')) return;
    if (qs('.help-dot', el)) return;
    const tip = document.createElement('span');
    tip.className = 'help-dot';
    tip.textContent = '?';
    tip.tabIndex = 0;
    tip.dataset.tip = el.dataset.help || 'Helpful feature';
    el.appendChild(tip);
  });
}

function enhanceButtonTooltips() {
  qsa('button, a.glass-button, a.icon-button').forEach((el) => {
    const visibleText = el.textContent.replace(/\s+/g, ' ').trim();
    if (el.title || visibleText.length > 3) return;
    const label = el.getAttribute('aria-label') || el.dataset.view || el.id || 'Button';
    el.title = label.replace(/([A-Z])/g, ' $1').replace(/[-_]/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()).trim();
  });
}

function selectedValues(select) {
  return [...(select?.selectedOptions || [])].map((option) => option.value);
}

function updateUploadKindUI() {
  const kind = $('uploadKind')?.value || 'creator-video';
  const runtime = $('uploadRuntime');
  const isMovie = kind === 'movie';
  if (!runtime) return;
  runtime.min = isMovie ? '30' : '1';
  runtime.closest('label')?.classList.toggle('needs-attention', isMovie && Number(runtime.value || 0) < 30);
  if (isMovie && Number(runtime.value || 0) < 30) runtime.setCustomValidity('Movies must be at least 30 minutes long.');
  else runtime.setCustomValidity('');
}

function generateCaptionsDraft() {
  const title = $('uploadTitle')?.value.trim() || 'Untitled upload';
  const description = $('uploadDescription')?.value.trim() || 'Welcome to this NexTube upload.';
  const tags = ($('uploadTags')?.value || '').split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 4);
  const lines = [
    'WEBVTT',
    '',
    '00:00:00.000 --> 00:00:05.000',
    title,
    '',
    '00:00:05.000 --> 00:00:12.000',
    description.slice(0, 150),
  ];
  if (tags.length) {
    lines.push('', '00:00:12.000 --> 00:00:18.000', `Topics: ${tags.join(', ')}`);
  }
  lines.push('', 'NOTE Edit this draft after upload. Real auto speech captions need a transcription service during deployment.');
  $('uploadCaptions').value = lines.join('\n');
  toast('Caption draft generated. Edit it before submitting.', 'success');
}

async function saveOnboarding(e) {
  e.preventDefault();
  if (!app.user) return openAuth();
  try {
    const result = await api('/me/preferences', {
      method: 'PATCH',
      body: JSON.stringify({
        favoriteTypes: selectedValues($('prefTypes')),
        moods: selectedValues($('prefMoods')),
        preferredLength: $('prefLength')?.value || 'any',
        creatorGoal: $('prefGoal')?.value.trim() || '',
        experience: $('prefExperience')?.value || 'balanced',
      }),
    });
    app.user = result.user;
    localStorage.setItem('nx_user', JSON.stringify(app.user));
    renderAuthState();
    closeModals();
    renderHome();
    toast('Preferences saved to your backend profile.', 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
}

function bindEvents() {
  qsa('[data-view]').forEach((btn) => btn.addEventListener('click', () => showView(btn.dataset.view)));
  qsa('[data-section]').forEach((btn) => btn.addEventListener('click', () => setSection(btn.dataset.section, true)));
  $('sidebarToggle').addEventListener('click', () => {
    if (window.innerWidth <= 820) document.body.classList.toggle('sidebar-open');
    else document.body.classList.toggle('sidebar-collapsed');
  });
  $('themeToggle').addEventListener('click', () => {
    document.body.classList.toggle('light');
    localStorage.setItem('nx_theme', document.body.classList.contains('light') ? 'light' : 'dark');
  });
  $('authButton').addEventListener('click', openAuth);
  $('profileButton').addEventListener('click', (e) => {
    e.stopPropagation();
    $('profileMenu').classList.toggle('hidden');
  });
  $('logoutButton').addEventListener('click', logout);
  qsa('#profileMenu [data-view]').forEach((btn) => btn.addEventListener('click', () => {
    $('profileMenu').classList.add('hidden');
    showView(btn.dataset.view);
  }));
  document.addEventListener('click', (e) => {
    if (!$('profileMenu').contains(e.target) && e.target !== $('profileButton')) {
      $('profileMenu').classList.add('hidden');
    }
  });
  $('quickUpload').addEventListener('click', () => app.user ? showView('upload') : openAuth());
  $('heroPrimary').addEventListener('click', () => app.current && openVideo(app.current));
  $('heroInfo').addEventListener('click', () => app.current && openDetail(app.current));
  $('heroSave').addEventListener('click', () => app.current && addSaved(app.current.id));
  $('surpriseButton').addEventListener('click', () => {
    const list = filteredSmart();
    if (list.length) openVideo(list[Math.floor(Math.random() * list.length)]);
  });
  $('homeSurprise')?.addEventListener('click', () => {
    const list = filteredSmart();
    if (list.length) openVideo(list[Math.floor(Math.random() * list.length)]);
  });
  qsa('[data-mood-pick]').forEach((btn) => btn.addEventListener('click', () => {
    $('moodFilter').value = btn.dataset.moodPick;
    qsa('[data-mood-pick]').forEach((x) => x.classList.toggle('active', x === btn));
    renderSmartRail();
    renderTypedGrid();
    qs('#smartRail')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }));
  ['moodFilter', 'lengthFilter'].forEach((id) => $(id).addEventListener('change', renderSmartRail));
  $('typeFilter').addEventListener('change', (e) => setSection(e.target.value, false));
  qsa('[data-home-type]').forEach((btn) => btn.addEventListener('click', () => {
    qsa('[data-home-type]').forEach((x) => x.classList.remove('active'));
    btn.classList.add('active');
    app.homeType = btn.dataset.homeType;
    setSection(app.homeType === 'creator-video' ? 'creator-video' : 'movie', false);
    renderTypedGrid();
  }));
  $('movieSearch').addEventListener('input', (e) => { app.movieSearch = e.target.value; renderMoviesPage(); });
  $('movieSort').addEventListener('change', (e) => { app.movieSort = e.target.value; renderMoviesPage(); });
  $('searchTypeFilter').addEventListener('change', (e) => { setSection(e.target.value, false); renderSearchPage(); });
  $('searchSort').addEventListener('change', (e) => { app.searchSort = e.target.value; renderSearchPage(); });
  $('clearWatchlist').addEventListener('click', () => { saveWatchlist([]); renderWatchlistPage(); renderHome(); });
  $('clearLater').addEventListener('click', () => { saveStoredList('nx_watch_later', []); renderLaterPage(); });
  $('clearHistory').addEventListener('click', () => { saveStoredList('nx_history', []); renderHistoryPage(); });
  $('uploadVideo').addEventListener('change', () => { $('videoFileName').textContent = $('uploadVideo').files[0]?.name || 'Choose video file'; });
  $('uploadKind')?.addEventListener('change', updateUploadKindUI);
  $('uploadRuntime')?.addEventListener('input', updateUploadKindUI);
  $('generateCaptions')?.addEventListener('click', generateCaptionsDraft);
  $('uploadForm').addEventListener('submit', uploadVideo);
  $('onboardingForm')?.addEventListener('submit', saveOnboarding);
  $('loginForm').addEventListener('submit', login);
  $('registerForm').addEventListener('submit', register);
  $('fillAdmin').addEventListener('click', () => { $('loginEmail').value = 'admin@nextube.local'; $('loginPassword').value = 'admin123'; });
  qsa('.auth-tab').forEach((btn) => btn.addEventListener('click', () => {
    qsa('.auth-tab').forEach((x) => x.classList.remove('active'));
    qsa('.auth-form').forEach((x) => x.classList.remove('active'));
    btn.classList.add('active');
    $(`${btn.dataset.authTab}Form`).classList.add('active');
  }));
  qsa('[data-close-modal]').forEach((btn) => btn.addEventListener('click', closeModals));
  qsa('.modal-layer').forEach((m) => m.addEventListener('click', (e) => { if (e.target === m) closeModals(); }));
  $('likeButton').addEventListener('click', () => react('like'));
  $('dislikeButton').addEventListener('click', () => react('dislike'));
  $('watchLaterButton').addEventListener('click', () => app.current && addWatchLater(app.current.id));
  $('reportButton').addEventListener('click', reportCurrent);
  $('commentSubmit').addEventListener('click', postComment);
  $('openCommand')?.addEventListener('click', openCommandPalette);
  $('commandInput')?.addEventListener('input', renderCommands);
  $('globalSearch').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      submitGlobalSearch($('globalSearch').value);
    }
  });
  $('globalSearch').addEventListener('input', renderSearchSuggestions);
  $('globalSearch').addEventListener('focus', renderSearchSuggestions);
  $('searchSubmit')?.addEventListener('click', () => submitGlobalSearch($('globalSearch').value));
  document.addEventListener('click', (e) => {
    if (!$('searchSuggestions')?.contains(e.target) && e.target !== $('globalSearch') && e.target !== $('searchSubmit')) {
      hideSearchSuggestions();
    }
  });
  $('adminRefresh').addEventListener('click', renderAdmin);
  qsa('.admin-tab').forEach((btn) => btn.addEventListener('click', () => {
    app.adminTab = btn.dataset.adminTab;
    qsa('.admin-tab').forEach((x) => x.classList.remove('active'));
    btn.classList.add('active');
    renderAdminPanel();
  }));
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      $('globalSearch')?.focus();
    }
    if (e.key === 'Escape') closeModals();
  });
}

async function init() {
  if (localStorage.getItem('nx_theme') === 'light') document.body.classList.add('light');
  bindEvents();
  attachHelp();
  enhanceButtonTooltips();
  setSection(app.section, false);
  updateUploadKindUI();
  renderSavedCounts();
  await loadMe();
  await loadData();
  const firstRoute = currentRoute();
  window.history.replaceState({ view: firstRoute }, '', `#${firstRoute}`);
  showView(firstRoute, false);
  maybeOpenOnboarding();
  setTimeout(() => $('appLoader').classList.add('loaded'), 350);
}

window.addEventListener('popstate', (event) => {
  const view = event.state?.view || currentRoute();
  showView(view, false);
});

window.addEventListener('load', init);
