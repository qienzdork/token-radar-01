// Token Radar dashboard: renders window.RADAR (written by main.ts as data.js).
// No network, no framework: plain DOM, one table, one dialog.

const D = window.RADAR;
const $ = (id) => document.getElementById(id);

/** Escape text for HTML insertion. */
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Short money: $731.2M, $4.99B, $12.4K, $950. */
function money(n) {
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + String(Math.round(n));
}

/** Age in days as "45d" or "2.3y". */
function ageText(days) {
  if (days === null || days === undefined) return '—';
  if (days >= 365) return (days / 365).toFixed(1) + 'y';
  return days + 'd';
}

/** Seven-day change as "+12.5%", "-3.2%" or an em dash when unreported. */
function changeText(c) {
  if (c === null || c === undefined) return '—';
  const sign = c > 0 ? '+' : '';
  return sign + c.toFixed(1) + '%';
}

function changeClass(c) {
  if (c === null || c === undefined) return '';
  return c >= 0 ? 'pos' : 'neg';
}

/** The radar-2 formula, re-run here so the page can check its own board. */
function recompute(row) {
  const change = row.change_7d === null ? 0 : row.change_7d;
  const clamped = Math.min(120, Math.max(-60, change));
  const growth = 1 + (clamped / 100) * 0.6;
  const age = 0.55 + (Math.min(row.age_days, 1095) / 1095) * 0.45;
  const chains = 1 + Math.min(Math.max(row.chains.length - 1, 0), 8) * 0.02;
  return Math.round(row.tvl_usd * 0.3 * growth * age * chains);
}

/** State: the current tab, filters and sort. */
const state = {
  tab: 'pre',
  q: '',
  cat: '',
  chain: '',
  wl: false,
  sort: 'rank',
  dir: 1,
};

/** Fill the category and chain dropdowns from the board's own values. */
function fillFilters() {
  const cats = [...new Set(D.board.map((r) => r.category).filter(Boolean))].sort();
  for (const c of cats) {
    const o = document.createElement('option');
    o.value = c;
    o.textContent = c;
    $('cat').appendChild(o);
  }
  const chains = [...new Set(D.board.flatMap((r) => r.chains))].sort();
  for (const c of chains) {
    const o = document.createElement('option');
    o.value = c;
    o.textContent = c;
    $('chain').appendChild(o);
  }
}

/** The four stat cards and the top-5 bar strip. */
function renderStats() {
  $('stat-rows').textContent = String(D.board.length);
  $('stat-watchlist').textContent = D.watchlist_covered + '/' + D.watchlist_total;
  $('stat-total').textContent = money(D.total_implied_usd);
  $('stat-live').textContent = String(D.live_count);
  $('asof').textContent = D.as_of;
  $('floor').textContent = money(D.floor_usd);
  const top = D.board.slice(0, 5);
  const max = top[0].implied_value_usd;
  $('top5').innerHTML = top
    .map(
      (r) =>
        `<div class="bar-row"><div class="who"><b>${esc(r.name)}</b> <span>#${r.rank} · ${esc(r.category || 'uncategorised')}</span></div>` +
        `<div class="bar-track"><div class="bar-fill" style="width:${Math.round((r.implied_value_usd / max) * 100)}%"></div></div>` +
        `<div class="val">${money(r.implied_value_usd)}</div></div>`,
    )
    .join('');
}

/** Rows of the active tab after the filters, in the current sort order. */
function visibleRows() {
  const q = state.q.trim().toLowerCase();
  if (state.tab === 'live') {
    let rows = D.live.map((r, i) => ({
      rank: i + 1,
      slug: r.slug,
      name: r.name,
      category: r.category,
      chains: r.chains,
      tvl_usd: r.tvl_usd,
      change_7d: null,
      age_days: null,
      value: r.mcap_usd,
      live: true,
      mcap_usd: r.mcap_usd,
    }));
    if (q) rows = rows.filter((r) => r.name.toLowerCase().includes(q) || r.slug.includes(q));
    if (state.cat) rows = rows.filter((r) => r.category === state.cat);
    if (state.chain) rows = rows.filter((r) => r.chains.includes(state.chain));
    return rows;
  }
  let rows = D.board.map((r) => ({ ...r, value: r.implied_value_usd, live: false }));
  if (q) rows = rows.filter((r) => r.name.toLowerCase().includes(q) || r.slug.includes(q));
  if (state.cat) rows = rows.filter((r) => r.category === state.cat);
  if (state.chain) rows = rows.filter((r) => r.chains.includes(state.chain));
  if (state.wl) rows = rows.filter((r) => r.watchlist);
  const key = state.sort === 'implied_value_usd' ? 'value' : state.sort;
  rows.sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (av === null || av === undefined) return 1;
    if (bv === null || bv === undefined) return -1;
    if (typeof av === 'string') return av.localeCompare(bv) * state.dir;
    if (Array.isArray(av)) return (av[0] || '').localeCompare(bv[0] || '') * state.dir;
    return (av - bv) * state.dir;
  });
  return rows;
}

/** The board table (or the live table) for the active tab. */
function renderTable() {
  const rows = visibleRows();
  const lastTh = document.querySelector('th.num');
  lastTh.textContent = state.tab === 'live' ? 'Market cap' : 'Implied value';
  if (rows.length === 0) {
    $('rows').innerHTML = '<tr><td class="empty" colspan="8">No protocols match these filters.</td></tr>';
  } else {
    $('rows').innerHTML = rows
      .map(
        (r) =>
          `<tr data-slug="${esc(r.slug)}" data-live="${r.live ? 1 : 0}">` +
          `<td>${r.rank}</td>` +
          `<td><b>${esc(r.name)}</b><span class="slug">${esc(r.slug)}</span>${r.watchlist ? '<span class="wl-badge">WATCHLIST</span>' : ''}</td>` +
          `<td>${esc(r.category || '—')}</td>` +
          `<td>${esc(r.chains.slice(0, 3).join(', '))}${r.chains.length > 3 ? ' +' + (r.chains.length - 3) : ''}</td>` +
          `<td>${money(r.tvl_usd)}</td>` +
          `<td class="${changeClass(r.change_7d)}">${changeText(r.change_7d)}</td>` +
          `<td>${ageText(r.age_days)}</td>` +
          `<td class="num"><b>${money(r.value)}</b></td></tr>`,
      )
      .join('');
  }
  $('count').textContent =
    state.tab === 'live'
      ? `${rows.length} of ${D.live.length} live-token protocols shown (top ${D.live.length} by market cap; ${D.live_count} tokened in all)`
      : `${rows.length} of ${D.board.length} pre-token protocols (${D.early_count} below the watchlist floor)`;
}

/** The detail dialog for one protocol: model breakdown plus farm plan. */
function openDetail(slug, live) {
  const body = $('detail-body');
  if (live) {
    const r = D.live.find((x) => x.slug === slug);
    if (!r) return;
    body.innerHTML =
      `<h2>${esc(r.name)}</h2>` +
      `<p class="sub">${esc(r.slug)} · ${esc(r.category || 'uncategorised')} · ${esc(r.chains.join(', '))}</p>` +
      `<h3>Already launched</h3>` +
      `<p>This protocol's token already trades — market cap <b>${money(r.mcap_usd)}</b> on TVL ${money(r.tvl_usd)}. ` +
      `It is shown for contrast and never ranked: the board is for protocols that record no token yet.</p>` +
      `<p class="note">A token that already trades cannot be farmed for a first launch. The pre-token tab is where the radar looks.</p>`;
  } else {
    const r = D.board.find((x) => x.slug === slug);
    if (!r) return;
    const base = Math.round(r.tvl_usd * 0.3);
    body.innerHTML =
      `<h2><span class="rank">#${r.rank}</span> ${esc(r.name)}</h2>` +
      `<p class="sub">${esc(r.slug)} · ${esc(r.category || 'uncategorised')} · ${esc(r.chains.join(', '))}${r.watchlist ? ' · on the watchlist' : ''}</p>` +
      `<h3>How the implied value is built</h3>` +
      `<div class="break">TVL ${money(r.tvl_usd)} × 0.30 = ${money(base)}<br>` +
      `× growth ${r.growth_factor} (7d ${changeText(r.change_7d)})<br>` +
      `× age ${r.age_factor} (${ageText(r.age_days)} with no token recorded)<br>` +
      `× chains ${r.chain_factor} (${r.chains.length} chain${r.chains.length === 1 ? '' : 's'})<br>` +
      `<span class="tot">≈ implied value ${money(r.implied_value_usd)}</span></div>` +
      `<h3>Farm plan — six steps</h3><ol>` +
      r.farm_steps.map((s) => `<li>${esc(s)}</li>`).join('') +
      `</ol>` +
      `<p class="note">Steps state their capital, gas and hold in dollars and days. The plan is a starting point, not advice: check the protocol's own pages before sending funds.</p>`;
  }
  $('detail').showModal();
}

/** Recompute every implied value in this page and report the match count. */
function renderRecompute() {
  let match = 0;
  for (const row of D.board) {
    if (recompute(row) === row.implied_value_usd) match++;
  }
  $('recompute').textContent =
    `Recompute check: ${match}/${D.board.length} rows match the model when recomputed in this page (TVL × 0.30 × growth × age × chains).`;
}

/** Wire the controls, then render everything once. */
function init() {
  fillFilters();
  renderStats();
  renderTable();
  renderRecompute();

  document.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-tab]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.tab = btn.dataset.tab;
      state.sort = 'rank';
      state.dir = 1;
      renderTable();
    });
  });
  $('q').addEventListener('input', (e) => {
    state.q = e.target.value;
    renderTable();
  });
  $('cat').addEventListener('change', (e) => {
    state.cat = e.target.value;
    renderTable();
  });
  $('chain').addEventListener('change', (e) => {
    state.chain = e.target.value;
    renderTable();
  });
  $('wl').addEventListener('change', (e) => {
    state.wl = e.target.checked;
    renderTable();
  });
  document.querySelectorAll('th[data-sort]').forEach((th) => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (state.sort === key) {
        state.dir = -state.dir;
      } else {
        state.sort = key;
        state.dir = key === 'name' || key === 'category' ? 1 : -1;
      }
      renderTable();
    });
  });
  $('rows').addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-slug]');
    if (tr) openDetail(tr.dataset.slug, tr.dataset.live === '1');
  });

  // Screenshot scenes, driven by the query string so a plain browser
  // capture shows the same views: ?shot=detail&slug=… opens the dialog,
  // ?shot=filter&category=… applies a filter, ?shot=live opens the live tab.
  const params = new URLSearchParams(location.search);
  const shot = params.get('shot');
  if (shot === 'live') {
    document.querySelector('[data-tab="live"]').click();
  } else if (shot === 'filter') {
    const cat = params.get('category');
    if (cat) {
      $('cat').value = cat;
      state.cat = cat;
    }
    const chain = params.get('chain');
    if (chain) {
      $('chain').value = chain;
      state.chain = chain;
    }
    if (params.get('wl') === '1') {
      $('wl').checked = true;
      state.wl = true;
    }
    renderTable();
  } else if (shot === 'detail') {
    const slug = params.get('slug') || (D.board[0] && D.board[0].slug);
    if (slug) openDetail(slug, false);
  }
}

init();
