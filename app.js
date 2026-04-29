'use strict';

// ── CUISINE THEMES ───────────────────────────────────────────
const CUISINE_THEMES = {
  'East Asian':        { bg1: '#0a1f13', bg2: '#0f2d1a', accent: '#4caf78' },
  'South Asian':       { bg1: '#1f0e06', bg2: '#2d1608', accent: '#e06840' },
  'Latin / Caribbean': { bg1: '#1f1500', bg2: '#2d1f00', accent: '#E8C547' },
  'European':          { bg1: '#060d1f', bg2: '#0a142e', accent: '#7aaee8' },
  'American':          { bg1: '#0f0e04', bg2: '#1a1a06', accent: '#c8b84a' },
  'Middle Eastern':    { bg1: '#1a0a06', bg2: '#260f08', accent: '#d4906a' },
  'Southeast Asian':   { bg1: '#061710', bg2: '#092318', accent: '#3dbf96' },
  'African':           { bg1: '#120404', bg2: '#1c0606', accent: '#e06868' },
  'Other':             { bg1: '#0d0d0d', bg2: '#181818', accent: '#8a8a8a' },
};

function genThumbSVG(r) {
  const t = CUISINE_THEMES[r.cuisine_category] || CUISINE_THEMES['Other'];
  const letter = (r.name.trim()[0] || '?').toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 56 56">
    <defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${t.bg1}"/>
      <stop offset="100%" stop-color="${t.bg2}"/>
    </linearGradient></defs>
    <rect width="56" height="56" fill="url(#g)"/>
    <text x="28" y="38" text-anchor="middle" fill="${t.accent}"
      font-size="30" font-family="-apple-system,BlinkMacSystemFont,sans-serif"
      font-weight="800">${letter}</text>
  </svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

function genHeroSVG(r) {
  const t = CUISINE_THEMES[r.cuisine_category] || CUISINE_THEMES['Other'];
  const words = r.name.trim().split(/\s+/).slice(0, 2);
  const initials = words.map(w => w[0].toUpperCase()).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 240">
    <defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${t.bg1}"/>
      <stop offset="100%" stop-color="${t.bg2}"/>
    </linearGradient></defs>
    <rect width="600" height="240" fill="url(#g)"/>
    <text x="300" y="118" text-anchor="middle" fill="${t.accent}"
      font-size="80" font-family="-apple-system,BlinkMacSystemFont,sans-serif"
      font-weight="800" opacity="0.9">${initials}</text>
    <text x="300" y="158" text-anchor="middle" fill="${t.accent}"
      font-size="14" font-family="-apple-system,BlinkMacSystemFont,sans-serif"
      font-weight="500" letter-spacing="3" opacity="0.5">${r.cuisine_category.toUpperCase()}</text>
  </svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

// ── STATE ────────────────────────────────────────────────────
const App = {
  restaurants: [],
  userData: { visited: {}, wantToGo: {}, ratings: {}, notes: {} },
  filters: { boroughs: [], cuisines: [], priceTiers: [], neighborhoods: [], walkInOnly: false, new2025Only: false },
  currentView: 'discover',
  spinTarget: null,
  currentRestaurantId: null,
  browseSort: 'alpha',
  browseSearch: '',
  myListTab: 'visited',
  spinInterval: null,
  userLocation: null
};

// ── INIT ─────────────────────────────────────────────────────
async function init() {
  loadUserData();
  try {
    const res = await fetch('data/restaurants.json');
    App.restaurants = await res.json();
  } catch (e) {
    showToast('Could not load restaurant data');
    return;
  }

  setupRouter();
  setupNav();
  buildNeighborhoodFilter();
  setupFilterSheet();
  setupBrowse();
  setupMyList();
  setupIOSBanner();

  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
  }

  // Handle initial hash
  handleHash(location.hash || '#discover');
}

// ── ROUTER ───────────────────────────────────────────────────
function setupRouter() {
  window.addEventListener('hashchange', () => handleHash(location.hash));
}

function handleHash(hash) {
  if (hash.startsWith('#restaurant/')) {
    const id = hash.slice('#restaurant/'.length);
    showView('restaurant');
    renderRestaurant(id);
  } else if (hash === '#spin') {
    showView('spin');
  } else if (hash === '#browse') {
    showView('browse');
    renderBrowse();
  } else if (hash === '#mylist') {
    showView('mylist');
    renderMyList();
  } else if (hash === '#map') {
    showView('map');
    initMap();
  } else {
    showView('discover');
    renderDiscover();
  }
}

function navigate(hash) {
  location.hash = hash;
}

function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const el = document.getElementById('view-' + name);
  if (el) el.classList.add('active');
  App.currentView = name;

  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.view === name);
  });
}

// ── BOTTOM NAV ───────────────────────────────────────────────
function setupNav() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = '#' + btn.dataset.view;
      if (location.hash === target && target === '#map') { initMap(); return; }
      navigate(target);
    });
  });
}

// ── DISCOVER VIEW ────────────────────────────────────────────
function renderDiscover() {
  updatePickCount();
  renderRecentVisits();
}

function updatePickCount() {
  const n = getFiltered().length;
  const el = document.getElementById('pick-count');
  if (el) el.textContent = n === 100 ? '100 restaurants' : `${n} of 100 match`;
  const sub = document.querySelector('.pick-btn-sub');
  if (sub) sub.textContent = n < 100 && hasFilters() ? `From ${n} filtered` : 'Random selection';
}

function renderRecentVisits() {
  const section = document.getElementById('recent-section');
  const list = document.getElementById('recent-list');
  if (!section || !list) return;

  const visited = Object.entries(App.userData.visited)
    .filter(([, v]) => v)
    .sort((a, b) => (b[1] > a[1] ? 1 : -1))
    .slice(0, 5)
    .map(([id]) => App.restaurants.find(r => r.id === id))
    .filter(Boolean);

  if (!visited.length) { section.style.display = 'none'; return; }
  section.style.display = '';

  list.innerHTML = visited.map(r => `
    <div class="recent-card" onclick="navigate('#restaurant/${r.id}')">
      <div class="recent-card-thumb" style="background-image:url('${genThumbSVG(r)}')"></div>
      <div class="recent-card-name">${esc(r.name)}</div>
      <div class="recent-card-hood">${esc(r.neighborhood)}</div>
      ${App.userData.ratings[r.id] ? `<div class="recent-card-rating">${App.userData.ratings[r.id]}/10</div>` : ''}
    </div>
  `).join('');
}

// Pick button
document.getElementById('pick-btn')?.addEventListener('click', startSpin);

// Filter button on discover
document.getElementById('open-filter-btn')?.addEventListener('click', openFilterSheet);
document.getElementById('browse-filter-btn')?.addEventListener('click', openFilterSheet);

// ── FILTER ENGINE ────────────────────────────────────────────
function getFiltered() {
  return App.restaurants.filter(r => {
    if (App.filters.boroughs.length && !App.filters.boroughs.includes(r.borough)) return false;
    if (App.filters.neighborhoods.length && !App.filters.neighborhoods.includes(r.neighborhood)) return false;
    if (App.filters.cuisines.length && !App.filters.cuisines.includes(r.cuisine_category)) return false;
    if (App.filters.priceTiers.length && !App.filters.priceTiers.includes(r.price_tier)) return false;
    if (App.filters.walkInOnly && r.walk_in_friendly !== true) return false;
    if (App.filters.new2025Only && !r.is_new_2025) return false;
    return true;
  });
}

function hasFilters() {
  return App.filters.boroughs.length || App.filters.neighborhoods.length ||
         App.filters.cuisines.length || App.filters.priceTiers.length ||
         App.filters.walkInOnly || App.filters.new2025Only;
}

function renderActiveChips() {
  const container = document.getElementById('active-chips');
  const btn = document.getElementById('open-filter-btn');
  if (!container) return;

  const chips = [];
  App.filters.boroughs.forEach(b => chips.push({ label: b, type: 'borough', value: b }));
  App.filters.neighborhoods.forEach(n => chips.push({ label: n, type: 'neighborhood', value: n }));
  App.filters.cuisines.forEach(c => chips.push({ label: c, type: 'cuisine', value: c }));
  App.filters.priceTiers.forEach(p => chips.push({ label: '$'.repeat(p), type: 'price', value: p }));
  if (App.filters.walkInOnly) chips.push({ label: 'Walk-in only', type: 'walkin', value: null });
  if (App.filters.new2025Only) chips.push({ label: 'New 2025', type: 'new2025', value: null });

  container.innerHTML = chips.map(c => `
    <span class="active-chip">
      ${esc(c.label)}
      <button onclick="removeChip('${c.type}','${c.value}')" aria-label="Remove filter">&times;</button>
    </span>
  `).join('');

  if (btn) btn.classList.toggle('has-filters', chips.length > 0);
  updatePickCount();
}

function removeChip(type, value) {
  if (type === 'borough') App.filters.boroughs = App.filters.boroughs.filter(b => b !== value);
  if (type === 'neighborhood') App.filters.neighborhoods = App.filters.neighborhoods.filter(n => n !== value);
  if (type === 'cuisine') App.filters.cuisines = App.filters.cuisines.filter(c => c !== value);
  if (type === 'price') App.filters.priceTiers = App.filters.priceTiers.filter(p => String(p) !== String(value));
  if (type === 'walkin') App.filters.walkInOnly = false;
  if (type === 'new2025') App.filters.new2025Only = false;
  renderActiveChips();
  if (App.currentView === 'browse') renderBrowse();
}

// ── NEIGHBORHOOD FILTER ───────────────────────────────────────
function buildNeighborhoodFilter() {
  const container = document.getElementById('filter-neighborhoods');
  if (!container) return;

  // Group neighborhoods by borough, sorted
  const byBorough = {};
  App.restaurants.forEach(r => {
    if (!byBorough[r.borough]) byBorough[r.borough] = new Set();
    byBorough[r.borough].add(r.neighborhood);
  });

  const boroughOrder = ['Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island'];
  container.innerHTML = boroughOrder
    .filter(b => byBorough[b])
    .map(b => {
      const hoods = [...byBorough[b]].sort();
      return `
        <div class="hood-group" data-borough-group="${esc(b)}">
          <button class="hood-group-header" type="button">
            <span>${esc(b)}</span>
            <span class="hood-group-count">${hoods.length}</span>
            <span class="hood-group-arrow">&#8250;</span>
          </button>
          <div class="hood-chip-row chip-row hidden">
            ${hoods.map(h => `<button class="chip" data-neighborhood="${esc(h)}">${esc(h)}</button>`).join('')}
          </div>
        </div>`;
    }).join('');

  // Borough group toggle
  container.querySelectorAll('.hood-group-header').forEach(header => {
    header.addEventListener('click', () => {
      const group = header.closest('.hood-group');
      const row = group.querySelector('.hood-chip-row');
      const arrow = header.querySelector('.hood-group-arrow');
      const open = !row.classList.contains('hidden');
      row.classList.toggle('hidden', open);
      arrow.style.transform = open ? '' : 'rotate(90deg)';
    });
  });

  // Neighborhood chip toggle
  container.querySelectorAll('[data-neighborhood]').forEach(chip => {
    chip.addEventListener('click', () => {
      const n = chip.dataset.neighborhood;
      toggleArrayFilter(App.filters.neighborhoods, n);
      chip.classList.toggle('selected', App.filters.neighborhoods.includes(n));
      updateFilterCount();
    });
  });
}

// ── FILTER SHEET ─────────────────────────────────────────────
function setupFilterSheet() {
  const overlay = document.getElementById('filter-overlay');
  overlay?.addEventListener('click', e => { if (e.target === overlay) closeFilterSheet(); });

  document.getElementById('clear-filters')?.addEventListener('click', () => {
    App.filters = { boroughs: [], neighborhoods: [], cuisines: [], priceTiers: [], walkInOnly: false, new2025Only: false };
    syncFilterUI();
    updateFilterCount();
  });

  document.getElementById('apply-filters')?.addEventListener('click', () => {
    closeFilterSheet();
    renderActiveChips();
    if (App.currentView === 'browse') renderBrowse();
  });

  // Borough chips
  document.querySelectorAll('[data-borough]').forEach(chip => {
    chip.addEventListener('click', () => {
      const b = chip.dataset.borough;
      toggleArrayFilter(App.filters.boroughs, b);
      chip.classList.toggle('selected', App.filters.boroughs.includes(b));
      updateFilterCount();
    });
  });

  // Cuisine chips
  document.querySelectorAll('[data-cuisine]').forEach(chip => {
    chip.addEventListener('click', () => {
      const c = chip.dataset.cuisine;
      toggleArrayFilter(App.filters.cuisines, c);
      chip.classList.toggle('selected', App.filters.cuisines.includes(c));
      updateFilterCount();
    });
  });

  // Price chips
  document.querySelectorAll('[data-price]').forEach(chip => {
    chip.addEventListener('click', () => {
      const p = parseInt(chip.dataset.price);
      toggleArrayFilter(App.filters.priceTiers, p);
      chip.classList.toggle('selected', App.filters.priceTiers.includes(p));
      updateFilterCount();
    });
  });

  // Walk-in toggle
  document.getElementById('filter-walkin')?.addEventListener('change', e => {
    App.filters.walkInOnly = e.target.checked;
    updateFilterCount();
  });

  // New 2025 toggle
  document.getElementById('filter-new2025')?.addEventListener('change', e => {
    App.filters.new2025Only = e.target.checked;
    updateFilterCount();
  });
}

function toggleArrayFilter(arr, val) {
  const idx = arr.indexOf(val);
  if (idx === -1) arr.push(val);
  else arr.splice(idx, 1);
}

function openFilterSheet() {
  syncFilterUI();
  updateFilterCount();
  document.getElementById('filter-overlay')?.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeFilterSheet() {
  document.getElementById('filter-overlay')?.classList.add('hidden');
  document.body.style.overflow = '';
}

function syncFilterUI() {
  document.querySelectorAll('[data-borough]').forEach(c =>
    c.classList.toggle('selected', App.filters.boroughs.includes(c.dataset.borough)));
  document.querySelectorAll('[data-neighborhood]').forEach(c =>
    c.classList.toggle('selected', App.filters.neighborhoods.includes(c.dataset.neighborhood)));
  document.querySelectorAll('[data-cuisine]').forEach(c =>
    c.classList.toggle('selected', App.filters.cuisines.includes(c.dataset.cuisine)));
  document.querySelectorAll('[data-price]').forEach(c =>
    c.classList.toggle('selected', App.filters.priceTiers.includes(parseInt(c.dataset.price))));
  const wi = document.getElementById('filter-walkin');
  if (wi) wi.checked = App.filters.walkInOnly;
  const n2025 = document.getElementById('filter-new2025');
  if (n2025) n2025.checked = App.filters.new2025Only;
  // Auto-expand borough groups that have selected neighborhoods
  document.querySelectorAll('.hood-group').forEach(group => {
    const hasSelected = [...group.querySelectorAll('[data-neighborhood]')]
      .some(c => c.classList.contains('selected'));
    const row = group.querySelector('.hood-chip-row');
    const arrow = group.querySelector('.hood-group-arrow');
    if (hasSelected && row) {
      row.classList.remove('hidden');
      if (arrow) arrow.style.transform = 'rotate(90deg)';
    }
  });
}

function updateFilterCount() {
  const el = document.getElementById('filter-match-count');
  if (el) el.textContent = getFiltered().length;
}

// ── SPIN / REVEAL ─────────────────────────────────────────────
function startSpin() {
  const pool = getFiltered();
  if (!pool.length) {
    showToast('No restaurants match — try adjusting your filters');
    return;
  }
  const picked = pool[Math.floor(Math.random() * pool.length)];
  App.spinTarget = picked;

  navigate('#spin');

  // Clear previous state
  const result = document.getElementById('spin-result');
  const actions = document.getElementById('spin-actions');
  const reel = document.getElementById('spin-reel');
  if (result) result.classList.add('hidden');
  if (actions) actions.classList.add('hidden');
  if (reel) { reel.textContent = picked.name; reel.classList.remove('spinning'); }

  // Animate
  let ticks = 0;
  const names = pool.map(r => r.name);
  if (App.spinInterval) clearInterval(App.spinInterval);

  // Animate reel
  if (reel) reel.classList.add('spinning');

  // Quick spin
  App.spinInterval = setInterval(() => {
    ticks++;
    const r = names[Math.floor(Math.random() * names.length)];
    if (reel) reel.textContent = r;

    if (ticks >= 18) {
      clearInterval(App.spinInterval);
      App.spinInterval = null;
      // Settle
      if (reel) { reel.textContent = picked.name; reel.classList.remove('spinning'); }
      showSpinResult(picked);
    }
  }, 80);
}

function showSpinResult(r) {
  const result = document.getElementById('spin-result');
  const actions = document.getElementById('spin-actions');

  document.getElementById('spin-name').textContent = r.name;
  document.getElementById('spin-hood').textContent = r.neighborhood + ', ' + r.borough;

  const tagsEl = document.getElementById('spin-tags');
  tagsEl.innerHTML = r.cuisine_tags.slice(0, 2).map(t => `<span class="tag">${esc(t)}</span>`).join('');

  const badgesEl = document.getElementById('spin-badges');
  badgesEl.innerHTML = walkInBadgeHTML(r) + `<span class="tag">${esc(r.price_range)}</span>`;

  result?.classList.remove('hidden');
  actions?.classList.remove('hidden');
}

document.getElementById('spin-view-btn')?.addEventListener('click', () => {
  if (App.spinTarget) navigate('#restaurant/' + App.spinTarget.id);
});
document.getElementById('spin-again-btn')?.addEventListener('click', startSpin);
document.getElementById('rest-back')?.addEventListener('click', () => history.back());
document.getElementById('spin-back')?.addEventListener('click', () => {
  if (App.spinInterval) clearInterval(App.spinInterval);
  history.back();
});

// ── RESTAURANT PROFILE ───────────────────────────────────────
function renderRestaurant(id) {
  const r = App.restaurants.find(x => x.id === id);
  if (!r) { navigate('#discover'); return; }
  App.currentRestaurantId = id;

  // Hero image
  const img = document.getElementById('rest-image');
  if (img) {
    img.src = (r.image && r.image !== 'images/placeholder.svg') ? r.image : genHeroSVG(r);
    img.alt = r.name;
  }

  // Rank badge
  const rb = document.getElementById('rest-rank-badge');
  if (rb) {
    if (r.rank) { rb.textContent = r.rank; rb.style.display = 'flex'; }
    else rb.style.display = 'none';
  }

  // New badge
  const nb = document.getElementById('rest-new-badge');
  if (nb) nb.style.display = r.is_new_2025 ? '' : 'none';

  // Name + meta
  document.getElementById('rest-name').textContent = r.name;
  document.getElementById('rest-meta').textContent = r.neighborhood + ', ' + r.borough;

  // Cuisine tags
  document.getElementById('rest-cuisine-tags').innerHTML =
    r.cuisine_tags.map(t => `<span class="tag">${esc(t)}</span>`).join('');

  // Badges row
  const br = document.getElementById('rest-badge-row');
  if (br) {
    br.innerHTML = walkInBadgeHTML(r) +
      `<span class="badge badge-price">${esc(r.price_range)}${r.price_per_item ? ' &middot; ' + esc(r.price_per_item) : ''}</span>`;
  }

  // Description
  const desc = document.getElementById('rest-description');
  if (desc) {
    if (r.description) { desc.textContent = r.description; desc.style.display = ''; }
    else desc.style.display = 'none';
  }

  // Popular dishes
  const dishSec = document.getElementById('rest-dishes-section');
  const dishes = document.getElementById('rest-dishes');
  if (r.popular_dishes?.length) {
    dishes.innerHTML = r.popular_dishes.map(d => `<span class="tag gold">${esc(d)}</span>`).join('');
    dishSec.style.display = '';
  } else {
    dishSec.style.display = 'none';
  }

  // Links
  const linksEl = document.getElementById('rest-links');
  const links = [];
  if (r.website) links.push({ href: r.website, label: 'Restaurant website', icon: '&#127760;' });
  if (r.lat && r.lng) links.push({
    href: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(r.name + ', ' + (r.address || r.neighborhood + ', NYC'))}`,
    label: 'Get directions',
    icon: '&#128205;'
  });
  if (r.reservation_platform === 'Resy') {
    const slug = r.resy_slug || toSlug(r.name);
    links.push({ href: `https://resy.com/cities/ny/venues/${slug}`, label: 'Reserve on Resy', icon: '&#128203;', cls: 'resy-btn' });
  } else if (r.reservation_platform === 'Tock') {
    const slug = r.tock_slug || toSlug(r.name);
    links.push({ href: `https://www.exploretock.com/${slug}`, label: 'Reserve on Tock', icon: '&#128203;', cls: 'tock-btn' });
  } else if (r.reservation_platform) {
    links.push({ href: 'https://www.opentable.com', label: 'Reserve on ' + r.reservation_platform, icon: '&#128203;', cls: '' });
  }
  linksEl.innerHTML = links.map(l =>
    `<a href="${l.href}" class="rest-link${l.cls ? ' ' + l.cls : ''}" target="_blank" rel="noopener">
      <span class="link-icon">${l.icon}</span>${esc(l.label)}
      <span class="link-arrow">&#8594;</span>
    </a>`
  ).join('');

  // My Visit toggles
  const ud = App.userData;
  const visitedCb = document.getElementById('rest-visited');
  const wantCb = document.getElementById('rest-want');
  if (visitedCb) visitedCb.checked = !!ud.visited[id];
  if (wantCb) wantCb.checked = !!ud.wantToGo[id];

  // Visit date display
  const vdEl = document.getElementById('visit-date-display');
  if (vdEl) {
    const vd = ud.visited[id];
    vdEl.textContent = vd ? 'Visited ' + new Date(vd).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : '';
  }

  // Notes
  const notesEl = document.getElementById('rest-notes');
  if (notesEl) notesEl.value = ud.notes[id] || '';

  // Visit details visibility
  updateVisitDetailsVisibility();

  // Rating
  renderRatingDots(ud.ratings[id] || 0);

  // Scroll to top
  const view = document.getElementById('view-restaurant');
  if (view) view.scrollTop = 0;
}

function walkInBadgeHTML(r) {
  if (r.walk_in_friendly === true)
    return `<span class="badge badge-walkin">Walk-in friendly</span>`;
  if (r.walk_in_friendly === false)
    return `<span class="badge badge-reservation">Reservation required</span>`;
  return `<span class="badge badge-unknown">Call ahead</span>`;
}

function renderRatingDots(current) {
  const row = document.getElementById('rating-row');
  if (!row) return;
  row.innerHTML = Array.from({ length: 10 }, (_, i) => i + 1).map(n =>
    `<button class="rating-dot ${current >= n ? 'active' : ''}" data-rating="${n}">${n}</button>`
  ).join('');
  row.querySelectorAll('.rating-dot').forEach(dot => {
    dot.addEventListener('click', () => {
      const n = parseInt(dot.dataset.rating);
      const current = App.userData.ratings[App.currentRestaurantId] || 0;
      App.userData.ratings[App.currentRestaurantId] = (current === n) ? 0 : n;
      saveUserData();
      renderRatingDots(App.userData.ratings[App.currentRestaurantId] || 0);
    });
  });
}

function updateVisitDetailsVisibility() {
  const details = document.getElementById('visit-details');
  if (details) {
    details.style.display = App.userData.visited[App.currentRestaurantId] ? '' : 'none';
  }
}

// Visited toggle
document.getElementById('rest-visited')?.addEventListener('change', function() {
  const id = App.currentRestaurantId;
  if (!id) return;
  if (this.checked) {
    App.userData.visited[id] = new Date().toISOString().slice(0, 10);
    delete App.userData.wantToGo[id];
    const wantCb = document.getElementById('rest-want');
    if (wantCb) wantCb.checked = false;
  } else {
    delete App.userData.visited[id];
    delete App.userData.ratings[id];
    delete App.userData.notes[id];
  }
  saveUserData();
  updateVisitDetailsVisibility();
  const vdEl = document.getElementById('visit-date-display');
  if (vdEl) {
    const vd = App.userData.visited[id];
    vdEl.textContent = vd ? 'Visited ' + new Date(vd).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : '';
  }
});

// Want to go toggle
document.getElementById('rest-want')?.addEventListener('change', function() {
  const id = App.currentRestaurantId;
  if (!id) return;
  if (this.checked) {
    App.userData.wantToGo[id] = true;
    delete App.userData.visited[id];
    const visitedCb = document.getElementById('rest-visited');
    if (visitedCb) visitedCb.checked = false;
    updateVisitDetailsVisibility();
  } else {
    delete App.userData.wantToGo[id];
  }
  saveUserData();
});

// Share button
document.getElementById('rest-share-btn')?.addEventListener('click', () => {
  const id = App.currentRestaurantId;
  const r = id && App.restaurants.find(x => x.id === id);
  if (!r) return;
  const text = `${r.name} — ${r.neighborhood}, ${r.borough}\n${r.cuisine_tags.slice(0, 2).join(' · ')} · ${r.price_range}`;
  const url = r.website || window.location.href;
  if (navigator.share) {
    navigator.share({ title: r.name, text, url }).catch(() => {});
  } else {
    navigator.clipboard?.writeText(`${text}\n${url}`).then(() => showToast('Copied to clipboard'));
  }
});

// Notes autosave
document.getElementById('rest-notes')?.addEventListener('blur', function() {
  const id = App.currentRestaurantId;
  if (!id) return;
  if (this.value.trim()) App.userData.notes[id] = this.value.trim();
  else delete App.userData.notes[id];
  saveUserData();
});

// ── BROWSE VIEW ──────────────────────────────────────────────
function setupBrowse() {
  document.getElementById('browse-search')?.addEventListener('input', e => {
    App.browseSearch = e.target.value.toLowerCase();
    renderBrowse();
  });
  document.getElementById('sort-row')?.addEventListener('click', e => {
    const btn = e.target.closest('.sort-btn');
    if (!btn) return;
    if (btn.dataset.sort === 'nearest' && !App.userLocation) {
      if (!navigator.geolocation) { showToast('Location not available on this device'); return; }
      navigator.geolocation.getCurrentPosition(
        pos => {
          App.userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          App.browseSort = 'nearest';
          renderBrowse();
        },
        () => showToast('Location denied — enable in Settings > Safari > Location')
      );
      return;
    }
    document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    App.browseSort = btn.dataset.sort;
    renderBrowse();
  });
}

function renderBrowse() {
  let list = getFiltered();

  if (App.browseSearch) {
    list = list.filter(r =>
      r.name.toLowerCase().includes(App.browseSearch) ||
      r.neighborhood.toLowerCase().includes(App.browseSearch) ||
      r.cuisine_category.toLowerCase().includes(App.browseSearch) ||
      r.cuisine_tags.some(t => t.toLowerCase().includes(App.browseSearch))
    );
  }

  list = sortRestaurants(list, App.browseSort);

  const countEl = document.getElementById('browse-count');
  if (countEl) countEl.textContent = `${list.length} restaurant${list.length !== 1 ? 's' : ''}`;

  const container = document.getElementById('browse-list');
  if (!container) return;

  if (!list.length) {
    container.innerHTML = `<div class="empty-state">
      <div class="empty-icon">&#x1F50D;</div>
      <div class="empty-title">No matches</div>
      <div class="empty-sub">Try adjusting your search or filters</div>
    </div>`;
    return;
  }

  container.innerHTML = list.map(r => restaurantCardHTML(r)).join('');
}

function haversine(r, loc) {
  const R = 6371;
  const dLat = (r.lat - loc.lat) * Math.PI / 180;
  const dLng = (r.lng - loc.lng) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(loc.lat * Math.PI / 180) * Math.cos(r.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function sortRestaurants(list, sort) {
  if (sort === 'nearest') {
    if (!App.userLocation) return [...list].sort((a, b) => a.name.localeCompare(b.name));
    return [...list].sort((a, b) => {
      const dA = (a.lat && a.lng) ? haversine(a, App.userLocation) : Infinity;
      const dB = (b.lat && b.lng) ? haversine(b, App.userLocation) : Infinity;
      return dA - dB;
    });
  }
  return [...list].sort((a, b) => {
    if (sort === 'rank') {
      if (a.rank && b.rank) return a.rank - b.rank;
      if (a.rank) return -1;
      if (b.rank) return 1;
      return a.name.localeCompare(b.name);
    }
    if (sort === 'price-asc') return a.price_tier - b.price_tier;
    if (sort === 'price-desc') return b.price_tier - a.price_tier;
    return a.name.localeCompare(b.name);
  });
}

function restaurantCardHTML(r) {
  const isVisited = !!App.userData.visited[r.id];
  const isWant = !!App.userData.wantToGo[r.id];
  return `
    <div class="rest-card" onclick="navigate('#restaurant/${r.id}')">
      <img class="rest-card-thumb" src="${(r.image && r.image !== 'images/placeholder.svg') ? r.image : genThumbSVG(r)}" alt="${esc(r.name)}" loading="lazy">
      <div class="rest-card-body">
        <div class="rest-card-name">${esc(r.name)}</div>
        <div class="rest-card-hood">${esc(r.neighborhood)}, ${esc(r.borough)}</div>
        <div class="rest-card-tags">
          <span class="rest-card-tag">${esc(r.cuisine_category)}</span>
          ${r.walk_in_friendly === true ? '<span class="rest-card-tag" style="color:var(--green);border-color:var(--green)">Walk-in</span>' : ''}
        </div>
      </div>
      <div class="rest-card-right">
        <span class="rest-card-price">${esc(r.price_range)}</span>
        ${r.rank ? `<span class="rest-card-rank">#${r.rank}</span>` : ''}
        ${isVisited ? '<span class="rest-card-badge visited" title="Visited"></span>' : ''}
        ${isWant && !isVisited ? '<span class="rest-card-badge want" title="Want to go"></span>' : ''}
      </div>
    </div>
  `;
}

// ── MY LIST VIEW ─────────────────────────────────────────────
function setupMyList() {
  document.getElementById('view-mylist')?.addEventListener('click', e => {
    const tab = e.target.closest('.tab');
    if (!tab) return;
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    App.myListTab = tab.dataset.tab;
    renderMyListContent();
  });
}

function renderMyList() {
  document.querySelectorAll('.tab').forEach(t =>
    t.classList.toggle('active', t.dataset.tab === App.myListTab));
  renderMyListContent();
}

function renderMyListContent() {
  const container = document.getElementById('mylist-content');
  if (!container) return;

  if (App.myListTab === 'stats') { renderMyListStats(); return; }

  let ids, emptyTitle, emptySub;
  if (App.myListTab === 'visited') {
    ids = Object.keys(App.userData.visited).filter(id => App.userData.visited[id]);
    emptyTitle = 'No visits yet';
    emptySub = 'Mark restaurants as visited from their profile page';
  } else {
    ids = Object.keys(App.userData.wantToGo).filter(id => App.userData.wantToGo[id]);
    emptyTitle = 'Nothing saved yet';
    emptySub = 'Tap "Want to go" on any restaurant to save it here';
  }

  const list = ids.map(id => App.restaurants.find(r => r.id === id)).filter(Boolean);

  if (!list.length) {
    container.innerHTML = `<div class="empty-state">
      <div class="empty-icon">${App.myListTab === 'visited' ? '&#x1F374;' : '&#x2764;'}</div>
      <div class="empty-title">${emptyTitle}</div>
      <div class="empty-sub">${emptySub}</div>
    </div>`;
    return;
  }

  container.innerHTML = list.map(r => {
    const rating = App.userData.ratings[r.id];
    return `
      <div class="rest-card" onclick="navigate('#restaurant/${r.id}')">
        <img class="rest-card-thumb" src="${(r.image && r.image !== 'images/placeholder.svg') ? r.image : genThumbSVG(r)}" alt="${esc(r.name)}" loading="lazy">
        <div class="rest-card-body">
          <div class="rest-card-name">${esc(r.name)}</div>
          <div class="rest-card-hood">${esc(r.neighborhood)}, ${esc(r.borough)}</div>
          <div class="rest-card-tags">
            <span class="rest-card-tag">${esc(r.cuisine_category)}</span>
          </div>
        </div>
        <div class="rest-card-right">
          <span class="rest-card-price">${esc(r.price_range)}</span>
          ${rating ? `<span style="color:var(--gold);font-size:13px;font-weight:700">${rating}/10</span>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function renderMyListStats() {
  const container = document.getElementById('mylist-content');
  if (!container) return;

  const total = App.restaurants.length;
  const visitedIds = Object.keys(App.userData.visited).filter(id => App.userData.visited[id]);
  const visitedCount = visitedIds.length;
  const progressPct = total > 0 ? Math.round(visitedCount / total * 100) : 0;

  const cuisineTotals = {}, cuisineVisited = {};
  const boroughTotals = {}, boroughVisited = {};
  App.restaurants.forEach(r => {
    cuisineTotals[r.cuisine_category] = (cuisineTotals[r.cuisine_category] || 0) + 1;
    boroughTotals[r.borough] = (boroughTotals[r.borough] || 0) + 1;
  });
  visitedIds.forEach(id => {
    const r = App.restaurants.find(x => x.id === id);
    if (!r) return;
    cuisineVisited[r.cuisine_category] = (cuisineVisited[r.cuisine_category] || 0) + 1;
    boroughVisited[r.borough] = (boroughVisited[r.borough] || 0) + 1;
  });

  const cuisineRows = Object.entries(cuisineTotals)
    .sort((a, b) => b[1] - a[1])
    .map(([name, t]) => {
      const v = cuisineVisited[name] || 0;
      return `<div class="stats-bar-row">
        <span class="stats-bar-label">${esc(name)}</span>
        <div class="stats-bar-track"><div class="stats-bar-fill" style="width:${Math.round(v/t*100)}%"></div></div>
        <span class="stats-bar-count">${v}</span>
      </div>`;
    }).join('');

  const boroughRows = Object.entries(boroughTotals)
    .sort((a, b) => b[1] - a[1])
    .map(([name, t]) => {
      const v = boroughVisited[name] || 0;
      return `<div class="stats-bar-row">
        <span class="stats-bar-label">${esc(name)}</span>
        <div class="stats-bar-track"><div class="stats-bar-fill" style="width:${Math.round(v/t*100)}%"></div></div>
        <span class="stats-bar-count">${v}</span>
      </div>`;
    }).join('');

  const rated = Object.entries(App.userData.ratings)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([id, rating]) => ({ r: App.restaurants.find(x => x.id === id), rating }))
    .filter(({ r }) => r);

  const topRatedHTML = rated.length ? `
    <div class="stats-block">
      <div class="section-label">Top Rated</div>
      ${rated.map(({ r, rating }) => `
        <div class="stats-top-rest" onclick="navigate('#restaurant/${r.id}')">
          <img class="rest-card-thumb" src="${genThumbSVG(r)}" alt="${esc(r.name)}" style="width:44px;height:44px;border-radius:8px">
          <div style="flex:1;min-width:0">
            <div class="rest-card-name">${esc(r.name)}</div>
            <div class="rest-card-hood">${esc(r.neighborhood)}</div>
          </div>
          <span style="color:var(--gold);font-size:18px;font-weight:800;font-family:Georgia,serif">${rating}/10</span>
        </div>
      `).join('')}
    </div>
  ` : '';

  container.innerHTML = `
    <div class="stats-content">
      <div class="stats-headline">
        <div class="stats-number">${visitedCount}</div>
        <div class="stats-label">of ${total} restaurants visited</div>
        <div class="stats-progress-track">
          <div class="stats-progress-fill" style="width:${progressPct}%"></div>
        </div>
      </div>
      <div class="stats-block">
        <div class="section-label">By Cuisine</div>
        ${cuisineRows}
      </div>
      <div class="stats-block">
        <div class="section-label">By Borough</div>
        ${boroughRows}
      </div>
      ${topRatedHTML}
    </div>
  `;
}

function setupIOSBanner() {
  const match = navigator.userAgent.match(/iPhone OS (\d+)_/);
  if (match && parseInt(match[1]) < 17 && !localStorage.getItem('ios_banner_dismissed')) {
    document.getElementById('ios-banner')?.classList.remove('hidden');
  }
  document.getElementById('ios-banner-close')?.addEventListener('click', () => {
    document.getElementById('ios-banner')?.classList.add('hidden');
    localStorage.setItem('ios_banner_dismissed', '1');
  });
}

// ── MAP VIEW ─────────────────────────────────────────────────
let leafletMap = null;
let mapMarkers = [];
let mapViewFilter = 'all';
let mapRetryInterval = null;

function initMap() {
  // Bug fix: clear any stale retry interval from previous navigations
  if (mapRetryInterval) { clearInterval(mapRetryInterval); mapRetryInterval = null; }

  const container = document.getElementById('leaflet-map');
  if (!container) return;

  // If map already exists, just invalidate and re-render markers
  if (leafletMap) {
    leafletMap.invalidateSize();
    renderMapMarkers();
    return;
  }

  // Leaflet CDN may still be loading — retry for up to 5s
  if (typeof L === 'undefined') {
    let attempts = 0;
    mapRetryInterval = setInterval(() => {
      attempts++;
      if (typeof L !== 'undefined') { clearInterval(mapRetryInterval); mapRetryInterval = null; initMap(); }
      else if (attempts >= 50) { clearInterval(mapRetryInterval); mapRetryInterval = null; showToast('Map unavailable — check your connection'); }
    }, 100);
    return;
  }

  // Defer L.map() construction until after the 200ms CSS view transition to
  // avoid Leaflet measuring a zero-height container on iOS Safari mid-animation.
  setTimeout(() => {
    if (leafletMap) { leafletMap.invalidateSize(); return; }
    leafletMap = L.map('leaflet-map', {
      center: [40.7128, -74.0060],
      zoom: 12,
      zoomControl: false
    });
    L.control.zoom({ position: 'bottomright' }).addTo(leafletMap);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
      maxZoom: 19
    }).addTo(leafletMap);
    leafletMap.invalidateSize();
    renderMapMarkers();
  }, 250);
}

function renderMapMarkers() {
  if (!leafletMap) return;
  mapMarkers.forEach(m => m.remove());
  mapMarkers = [];

  const ud = App.userData;
  App.restaurants.forEach(r => {
    if (!r.lat || !r.lng) return;
    const isVisited = !!ud.visited[r.id];
    const isWant = !!ud.wantToGo[r.id];
    if (mapViewFilter === 'visited' && !isVisited) return;
    if (mapViewFilter === 'wantToGo' && !isWant) return;

    const color = isVisited ? '#4caf78' : isWant ? '#E8C547' : '#7a8fa6';
    const size = (isVisited || isWant) ? 14 : 10;
    const icon = L.divIcon({
      className: 'map-pin-wrap',
      html: `<div class="map-pin" style="width:${size}px;height:${size}px;background:${color}"></div>`,
      iconSize: [size + 4, size + 4],
      iconAnchor: [(size + 4) / 2, (size + 4) / 2]
    });

    const marker = L.marker([r.lat, r.lng], { icon })
      .addTo(leafletMap)
      .bindPopup(
        `<div class="map-popup">
          <div class="map-popup-name">${esc(r.name)}</div>
          <div class="map-popup-sub">${esc(r.neighborhood)} &bull; ${esc(r.price_range)}</div>
          ${walkInBadgeHTML(r)}
          <a href="#restaurant/${r.id}" class="map-popup-link">View Profile &rarr;</a>
        </div>`,
        { maxWidth: 220, closeButton: false }
      );
    mapMarkers.push(marker);
  });
}

// Surprise Me button
document.getElementById('map-surprise-btn')?.addEventListener('click', () => {
  const pool = getFiltered().filter(r => r.lat && r.lng);
  if (!pool.length) { showToast('No restaurants match — adjust your filters'); return; }
  const r = pool[Math.floor(Math.random() * pool.length)];
  if (!leafletMap) return;
  leafletMap.flyTo([r.lat, r.lng], 16, { duration: 1.2 });
  setTimeout(() => {
    const marker = mapMarkers.find(m => {
      const ll = m.getLatLng();
      return Math.abs(ll.lat - r.lat) < 0.0001 && Math.abs(ll.lng - r.lng) < 0.0001;
    });
    if (marker) marker.openPopup();
  }, 1400);
});

// Map tab buttons
document.querySelector('#view-map')?.addEventListener('click', e => {
  const tab = e.target.closest('.map-tab');
  if (!tab) return;
  document.querySelectorAll('.map-tab').forEach(t => t.classList.remove('active'));
  tab.classList.add('active');
  mapViewFilter = tab.dataset.mapview;
  renderMapMarkers();
});

// ── EXPORT / IMPORT ──────────────────────────────────────────
document.getElementById('export-btn')?.addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(App.userData, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `nyc-eats-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

document.getElementById('import-input')?.addEventListener('change', function() {
  const file = this.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const parsed = JSON.parse(e.target.result);
      if (typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
      App.userData = { visited: {}, wantToGo: {}, ratings: {}, notes: {}, ...parsed };
      saveUserData();
      renderMyList();
      showToast('Data imported successfully');
    } catch {
      showToast('Invalid backup file');
    }
    this.value = '';
  };
  reader.readAsText(file);
});

// ── LOCAL STORAGE ─────────────────────────────────────────────
function saveUserData() {
  try {
    localStorage.setItem('nyt_user_data', JSON.stringify(App.userData));
  } catch (e) {}
}

function loadUserData() {
  try {
    const raw = localStorage.getItem('nyt_user_data');
    if (raw) {
      const parsed = JSON.parse(raw);
      App.userData = { visited: {}, wantToGo: {}, ratings: {}, notes: {}, ...parsed };
    }
  } catch (e) {}
}

// ── TOAST ─────────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 2800);
}

// ── UTILS ─────────────────────────────────────────────────────
function toSlug(name) {
  return name.toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── BOOT ─────────────────────────────────────────────────────
init();
