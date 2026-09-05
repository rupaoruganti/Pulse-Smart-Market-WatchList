const state = { data: null, activeListId: localStorage.getItem('pulse.activeList') || 'core', filter: 'all', view: localStorage.getItem('pulse.view') || 'rows', discoverSector: 'All', discoverQuery: '' };
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(value);

async function request(path, options = {}) {
  const response = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
  const payload = await response.json();
  if (!response.ok) { const error = new Error(payload.error || 'Could not complete that action.'); error.status = response.status; throw error; }
  return payload;
}

async function load(silent = false) {
  try {
    state.data = await request('/api/bootstrap');
    ensureActiveList();
    render(); connectEvents();
  } catch (error) {
    if (error.status === 401) return showAuth('login');
    if (!silent) showToast('Market data is unavailable. Check your connection and retry.', true);
  }
}

function ensureActiveList() {
  if (!state.data.watchlists.some(list => list.id === state.activeListId)) {
    state.activeListId = state.data.watchlists[0].id;
    localStorage.setItem('pulse.activeList', state.activeListId);
  }
}

let eventSource;
function connectEvents() {
  if (!('EventSource' in window) || eventSource) return;
  eventSource = new EventSource('/api/events');
  eventSource.addEventListener('store', () => load(true));
  eventSource.addEventListener('market', () => load(true));
  eventSource.onerror = () => { if (state.data) $('#market-label').textContent = 'Reconnecting'; };
}

function showAuth(mode) {
  const register = mode === 'register';
  $('#login-form').hidden = register; $('#register-form').hidden = !register;
  $('#auth-title').textContent = register ? 'Create your account' : 'Welcome back';
  $('#auth-copy').textContent = register ? 'Your watchlists and review state will stay separate and secure.' : 'Sign in to see what meaningfully changed.';
  $$('.auth-tabs button').forEach(button => button.classList.toggle('active', button.dataset.authTab === mode));
  if (!$('#auth-dialog').open) $('#auth-dialog').showModal();
}

async function authenticate(path, form) {
  const submit = form.querySelector('[type="submit"]'); const original = submit.textContent;
  submit.disabled = true; submit.textContent = 'Please wait…';
  try {
    const values = Object.fromEntries(new FormData(form)); state.data = await request(path, { method: 'POST', body: JSON.stringify(values) }); ensureActiveList();
    $('#auth-dialog').close(); form.reset(); render(); connectEvents(); showToast(path.endsWith('register') ? 'Account created' : 'Welcome back');
  } catch (error) { showToast(error.message, true); }
  finally { submit.disabled = false; submit.textContent = original; }
}

function activeList() { return state.data.watchlists.find(list => list.id === state.activeListId); }
function stocks() { const ids = activeList().symbolIds; return state.data.instruments.filter(item => ids.includes(item.symbol)); }
function initials(symbol) { return symbol.length > 5 ? symbol.slice(0, 2) : symbol.slice(0, 1); }
function ago(iso) { const seconds = Math.max(1, Math.floor((Date.now() - new Date(iso)) / 1000)); if (seconds < 60) return 'Updated just now'; if (seconds < 3600) return `Updated ${Math.floor(seconds / 60)}m ago`; return `Updated ${Math.floor(seconds / 3600)}h ago`; }

function render() {
  const list = activeList();
  const user = state.data.user || { name: 'Demo User', email: 'demo@example.com', accountType: 'Personal account' };
  const userInitials = user.name.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase();
  $('#profile-avatar').textContent = userInitials;
  $('#profile-name').textContent = user.name;
  $('#profile-type').textContent = user.accountType;
  $('#reset-demo-button').textContent = user.id === 'demo-user' ? 'Reset demo state' : 'Restore starter watchlists';
  $('#list-title').textContent = list.name;
  $('#list-subtitle').textContent = `${list.symbolIds.length} companies · A clear view of what deserves your attention.`;
  updateFreshness();
  renderNavigation(); renderSignals(); renderRows(); renderManage(); renderDiscover(); renderNotifications();
  $$('.view-button').forEach(button => button.classList.toggle('active', button.dataset.view === state.view));
  $('#stock-table').classList.toggle('cards', state.view === 'cards');
  showPage(location.hash === '#discover' ? 'discover' : 'watchlist');
}

function renderNavigation() {
  $('#watchlist-nav').innerHTML = state.data.watchlists.map(list => `<button class="watchlist-item ${list.id === state.activeListId ? 'active' : ''}" data-list="${list.id}"><span>${escapeHtml(list.name)}</span><small>${list.symbolIds.length}</small></button>`).join('');
}

function renderSignals() {
  const changed = stocks().filter(stock => stock.signals.length);
  const integrityWarnings = changed.filter(stock => stock.signals.some(signal => signal.type === 'corporate-action'));
  const rankedChanges = changed.filter(stock => !integrityWarnings.includes(stock)).sort((a, b) => b.score - a.score).slice(0, 5);
  const noteworthy = [...integrityWarnings, ...rankedChanges];
  const totalSignals = stocks().reduce((sum, stock) => sum + stock.signals.length, 0);
  $('#attention-title').textContent = noteworthy.length ? `${noteworthy.length} ${noteworthy.length === 1 ? 'stock needs' : 'stocks need'} your attention` : 'You’re all caught up';
  $('#attention-summary').textContent = integrityWarnings.length ? `${integrityWarnings.length} data-integrity ${integrityWarnings.length === 1 ? 'check requires' : 'checks require'} verification before reviewing market moves.` : noteworthy.length ? `${totalSignals} meaningful ${totalSignals === 1 ? 'change' : 'changes'} detected since your last review.` : 'No unusual moves in this watchlist right now.';
  $('#review-button').hidden = !noteworthy.length;
  $('#signals').innerHTML = noteworthy.map(stock => {
    const main = stock.signals[0]; const classes = stock.changePct >= 0 ? 'positive' : 'negative';
    return `<article class="signal-card ${main.type === 'corporate-action' ? 'integrity-card' : ''}" title="${main.type === 'corporate-action' ? 'Excluded from market-signal ranking' : `Meaningfulness score ${stock.score} — used only for ranking`}"><span class="signal-symbol">${initials(stock.symbol)}</span><div><h3>${stock.symbol}</h3><p>${escapeHtml(main.detail)}</p></div><div class="signal-value">${money(stock.price)}<small class="${classes}">${stock.changePct >= 0 ? '+' : ''}${stock.changePct.toFixed(2)}%</small></div><span class="signal-badge">${escapeHtml(main.label)}</span></article>`;
  }).join('');
}

function renderRows() {
  let visible = stocks();
  if (state.filter === 'attention') visible = visible.filter(stock => stock.signals.length);
  if (state.filter === 'gainers') visible = visible.filter(stock => stock.changePct > 0);
  if (state.filter === 'losers') visible = visible.filter(stock => stock.changePct < 0);
  $('#stock-count').textContent = visible.length;
  $('#stock-table').hidden = !visible.length; $('#empty-state').hidden = Boolean(visible.length);
  $('#stock-rows').innerHTML = visible.map(stock => {
    const positive = stock.changePct >= 0; const points = sparkPoints(stock.spark); const color = positive ? '#00a984' : '#e05b62';
    return `<div class="stock-row"><div class="company"><span class="company-logo">${initials(stock.symbol)}</span><span class="company-name"><b>${escapeHtml(stock.name)}</b><small>${stock.symbol} · ${stock.exchange}${stock.scoringMode === 'fallback' ? ' · Learning baseline' : ''}</small></span></div><div class="price"><b>${money(stock.price)}</b></div><div class="today"><b class="${positive ? 'positive' : 'negative'}">${positive ? '+' : ''}${stock.changePct.toFixed(2)}%</b><small>${positive ? '+' : ''}${stock.change.toFixed(2)}</small></div><svg class="sparkline" viewBox="0 0 115 32" preserveAspectRatio="none" aria-label="7 day price trend"><polygon points="${points} 115,32 0,32" fill="${color}"></polygon><polyline points="${points}" stroke="${color}"></polyline></svg><button class="row-menu" aria-label="More options for ${stock.symbol}" data-remove="${stock.symbol}">•••</button></div>`;
  }).join('');
}

function updateFreshness() {
  if (!state.data) return;
  const ageSeconds = (Date.now() - new Date(state.data.market.asOf)) / 1000;
  const stale = ageSeconds > state.data.market.staleAfterSeconds;
  $('#market-label').textContent = stale ? 'Data is stale' : state.data.market.label;
  $('#as-of').textContent = ago(state.data.market.asOf);
  $('.live-dot').classList.toggle('stale', stale);
  const feedKind = state.data.market.isDemo ? 'Demo only' : state.data.market.status === 'provider' ? 'Provider quote' : 'Provider issue';
  $('#data-note').textContent = `${feedKind} · ${state.data.market.source} · ${stale ? 'refresh required' : ago(state.data.market.asOf).toLowerCase()}`;
}

function sparkPoints(values) { const min = Math.min(...values), range = Math.max(...values) - min || 1; return values.map((value, index) => `${index / (values.length - 1) * 115},${29 - (value - min) / range * 25}`).join(' '); }
function renderManage() {
  $('#watchlist-name-input').value = activeList().name;
  $('#delete-list-button').disabled = state.data.watchlists.length === 1;
  $('#delete-list-button').title = state.data.watchlists.length === 1 ? 'Keep at least one watchlist' : '';
  $('#delete-list-note').textContent = state.data.watchlists.length === 1 ? 'Create another watchlist before deleting this one.' : 'This cannot be undone.';
  $('#manage-list').innerHTML = stocks().map(stock => `<div class="manage-item"><span><b>${stock.symbol}</b><small>${escapeHtml(stock.name)}</small></span><button data-manage-remove="${stock.symbol}">Remove</button></div>`).join('') || '<p class="dialog-copy">This watchlist is empty.</p>';
}

function renderNotifications() {
  const changed = stocks().filter(stock => stock.signals.length).sort((a, b) => b.score - a.score);
  $('#notification-dot').hidden = !changed.length;
  $('#notification-freshness').textContent = `${state.data.market.label} · ${ago(state.data.market.asOf)} · ${activeList().name}`;
  $('#notifications-review').hidden = !changed.length;
  $('#notification-list').innerHTML = changed.length ? changed.map(stock => {
    const signal = stock.signals[0];
    return `<div class="notification-item"><span class="signal-symbol">${initials(stock.symbol)}</span><div><b>${stock.symbol} · ${escapeHtml(signal.label)}</b><small>${escapeHtml(signal.detail)}</small></div><span class="${stock.changePct >= 0 ? 'positive' : 'negative'}">${stock.changePct >= 0 ? '+' : ''}${stock.changePct.toFixed(2)}%</span></div>`;
  }).join('') : '<div class="notification-empty"><span>✓</span><b>You’re all caught up</b><small>No meaningful changes need your attention.</small></div>';
}

function renderDiscover() {
  const owned = new Set(activeList().symbolIds);
  const sectors = ['All', ...new Set(state.data.instruments.map(stock => stock.sector))];
  $('#sector-filters').innerHTML = sectors.map(sector => `<button class="${sector === state.discoverSector ? 'active' : ''}" data-sector="${escapeHtml(sector)}">${escapeHtml(sector)}</button>`).join('');
  const movers = [...state.data.instruments].sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct)).slice(0, 3);
  $('#discover-movers').innerHTML = movers.map(stock => discoverCard(stock, owned, true)).join('');
  const term = state.discoverQuery.toLowerCase();
  const visible = state.data.instruments.filter(stock => (state.discoverSector === 'All' || stock.sector === state.discoverSector) && (!term || stock.name.toLowerCase().includes(term) || stock.symbol.toLowerCase().includes(term)));
  $('#discover-count').textContent = `${visible.length} ${visible.length === 1 ? 'company' : 'companies'} available`;
  $('#discover-companies').innerHTML = visible.map(stock => discoverCard(stock, owned, false)).join('');
  $('#discover-companies').hidden = !visible.length; $('#discover-empty').hidden = Boolean(visible.length);
}

function discoverCard(stock, owned, featured) {
  const positive = stock.changePct >= 0; const added = owned.has(stock.symbol);
  return `<article class="discover-card ${featured ? 'featured' : ''}"><span class="company-logo">${initials(stock.symbol)}</span><div class="discover-company"><b>${escapeHtml(stock.name)}</b><small>${stock.symbol} · ${stock.sector}</small></div><div class="discover-price"><b>${money(stock.price)}</b><small class="${positive ? 'positive' : 'negative'}">${positive ? '+' : ''}${stock.changePct.toFixed(2)}%</small></div><button class="discover-add ${added ? 'added' : ''}" data-discover-add="${stock.symbol}" ${added ? 'disabled' : ''}>${added ? '✓ Added' : '+ Add'}</button></article>`;
}

function showPage(page) {
  const discover = page === 'discover';
  $('#watchlist-page').hidden = discover; $('#discover-page').hidden = !discover;
  $('#watchlist-link').classList.toggle('active', !discover); $('#discover-link').classList.toggle('active', discover);
  if (discover && state.data) renderDiscover();
}
function escapeHtml(value) { const node = document.createElement('span'); node.textContent = value; return node.innerHTML; }
function showToast(message, error = false) { const toast = document.createElement('div'); toast.className = `toast${error ? ' error' : ''}`; toast.textContent = message; $('#toast-region').append(toast); setTimeout(() => toast.remove(), 3200); }

async function mutate(path, method, success) {
  try { state.data = await request(path, { method, body: JSON.stringify({ version: state.data.version }) }); await load(true); showToast(success); }
  catch (error) { showToast(error.message, true); if (error.message.includes('another device')) load(true); }
}

function openSearch() { $('#search').focus(); showSearch($('#search').value); }
function showSearch(query = '') {
  const current = new Set(activeList().symbolIds); const term = query.trim().toLowerCase();
  const matches = state.data.instruments.filter(stock => !current.has(stock.symbol) && (!term || stock.symbol.toLowerCase().includes(term) || stock.name.toLowerCase().includes(term))).slice(0, 6);
  const panel = $('#search-results'); panel.hidden = false;
  panel.innerHTML = matches.length ? matches.map(stock => `<button class="search-result" data-add="${stock.symbol}"><span><b>${stock.symbol}</b><small>${escapeHtml(stock.name)}</small></span><span>＋ Add</span></button>`).join('') : '<div class="search-result"><span><b>No matches</b><small>Try a company name or ticker</small></span></div>';
}

$('#watchlist-nav').addEventListener('click', event => { const button = event.target.closest('[data-list]'); if (!button) return; state.activeListId = button.dataset.list; localStorage.setItem('pulse.activeList', state.activeListId); state.filter = 'all'; render(); });
$('#search').addEventListener('focus', event => showSearch(event.target.value));
$('#search').addEventListener('input', event => showSearch(event.target.value));
$('#search-results').addEventListener('click', async event => { const button = event.target.closest('[data-add]'); if (!button) return; $('#search-results').hidden = true; $('#search').value = ''; await mutate(`/api/watchlists/${state.activeListId}/items/${button.dataset.add}`, 'PUT', `${button.dataset.add} added to ${activeList().name}`); });
document.addEventListener('click', event => { if (!event.target.closest('.search') && !event.target.closest('#search-results')) $('#search-results').hidden = true; });
document.addEventListener('keydown', event => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openSearch(); } if (event.key === 'Escape') $('#search-results').hidden = true; });
$('#add-button').addEventListener('click', openSearch);
$('#new-list').addEventListener('click', async () => { const name = prompt('Name your new watchlist'); if (!name?.trim()) return; try { const result = await request('/api/watchlists', { method: 'POST', body: JSON.stringify({ name, version: state.data.version }) }); state.data = result; state.activeListId = result.watchlists.at(-1).id; localStorage.setItem('pulse.activeList', state.activeListId); await load(true); showToast('Watchlist created'); } catch (error) { showToast(error.message, true); } });
$('#review-button').addEventListener('click', () => mutate('/api/review', 'POST', 'Changes marked as reviewed'));
$('#manage-button').addEventListener('click', () => $('#manage-dialog').showModal());
$('#method-button').addEventListener('click', () => $('#method-dialog').showModal());
$('#help-button').addEventListener('click', () => $('#help-dialog').showModal());
$('#notification-button').addEventListener('click', () => { renderNotifications(); $('#notification-dialog').showModal(); });
$('#help-method').addEventListener('click', () => { $('#help-dialog').close(); $('#method-dialog').showModal(); });
$('#notifications-review').addEventListener('click', async () => { $('#notification-dialog').close(); await mutate('/api/review', 'POST', 'Notifications marked as reviewed'); });
$('#profile-button').addEventListener('click', () => {
  $('#profile-name-input').value = state.data.user?.name || '';
  $('#profile-email-input').value = state.data.user?.email || '';
  $('#profile-dialog').showModal();
});
$('#profile-form').addEventListener('submit', async event => {
  event.preventDefault();
  const submit = event.currentTarget.querySelector('[type="submit"]');
  submit.disabled = true; submit.textContent = 'Saving…';
  try {
    state.data = await request('/api/profile', { method: 'PATCH', body: JSON.stringify({ name: $('#profile-name-input').value, email: $('#profile-email-input').value, version: state.data.version }) });
    $('#profile-dialog').close(); await load(true); showToast('Profile updated');
  } catch (error) { showToast(error.message, true); if (error.message.includes('another device')) load(true); }
  finally { submit.disabled = false; submit.textContent = 'Save profile'; }
});
$('#rename-list-form').addEventListener('submit', async event => {
  event.preventDefault(); const submit = event.currentTarget.querySelector('[type="submit"]');
  submit.disabled = true;
  try { state.data = await request(`/api/watchlists/${state.activeListId}`, { method: 'PATCH', body: JSON.stringify({ name: $('#watchlist-name-input').value, version: state.data.version }) }); render(); showToast('Watchlist renamed'); }
  catch (error) { showToast(error.message, true); if (error.message.includes('another device')) load(true); }
  finally { submit.disabled = false; }
});
$('#delete-list-button').addEventListener('click', async () => {
  if ($('#delete-list-button').disabled || !confirm(`Delete “${activeList().name}”?`)) return;
  try { state.data = await request(`/api/watchlists/${state.activeListId}`, { method: 'DELETE', body: JSON.stringify({ version: state.data.version }) }); ensureActiveList(); $('#manage-dialog').close(); render(); showToast('Watchlist deleted'); }
  catch (error) { showToast(error.message, true); if (error.message.includes('another device')) load(true); }
});
$('#reset-demo-button').addEventListener('click', async () => {
  const isDemo = state.data.user.id === 'demo-user';
  if (!confirm(`${isDemo ? 'Reset demo' : 'Replace your current'} watchlists and reviewed changes with the starter state?`)) return;
  try { state.data = await request('/api/account/reset', { method: 'POST', body: JSON.stringify({ version: state.data.version }) }); state.activeListId = 'core'; localStorage.setItem('pulse.activeList', state.activeListId); $('#profile-dialog').close(); render(); showToast(isDemo ? 'Demo state restored' : 'Starter watchlists restored'); }
  catch (error) { showToast(error.message, true); if (error.message.includes('another device')) load(true); }
});
$('#auth-dialog').addEventListener('cancel', event => event.preventDefault());
$$('[data-auth-tab]').forEach(button => button.addEventListener('click', () => showAuth(button.dataset.authTab)));
$('#login-form').addEventListener('submit', event => { event.preventDefault(); authenticate('/api/auth/login', event.currentTarget); });
$('#register-form').addEventListener('submit', event => { event.preventDefault(); authenticate('/api/auth/register', event.currentTarget); });
$('#demo-login').addEventListener('click', async () => {
  const button = $('#demo-login'); button.disabled = true; button.textContent = 'Opening demo…';
  try { state.data = await request('/api/auth/demo', { method: 'POST', body: '{}' }); ensureActiveList(); $('#auth-dialog').close(); render(); connectEvents(); showToast('Demo account ready'); }
  catch (error) { showToast(error.message, true); }
  finally { button.disabled = false; button.textContent = 'Continue with demo account'; }
});
$('#logout-button').addEventListener('click', async () => {
  await request('/api/auth/logout', { method: 'POST', body: '{}' });
  eventSource?.close(); eventSource = null; state.data = null; $('#profile-dialog').close(); showAuth('login');
});
$$('[data-close]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
$('#manage-list').addEventListener('click', async event => { const button = event.target.closest('[data-manage-remove]'); if (!button) return; await mutate(`/api/watchlists/${state.activeListId}/items/${button.dataset.manageRemove}`, 'DELETE', `${button.dataset.manageRemove} removed`); renderManage(); });
$('#stock-rows').addEventListener('click', event => { const button = event.target.closest('[data-remove]'); if (!button) return; $('#manage-dialog').showModal(); });
$('#filter-button').addEventListener('click', () => { $('#filter-panel').hidden = !$('#filter-panel').hidden; });
$('#filter-panel').addEventListener('click', event => { const button = event.target.closest('[data-filter]'); if (!button) return; state.filter = button.dataset.filter; $$('#filter-panel button').forEach(item => item.classList.toggle('active', item === button)); $('#filter-count').hidden = state.filter === 'all'; renderRows(); });
$$('.view-button').forEach(button => button.addEventListener('click', () => { state.view = button.dataset.view; localStorage.setItem('pulse.view', state.view); render(); }));
$('#mobile-menu').addEventListener('click', () => { $('.sidebar').classList.toggle('open'); });
$('#watchlist-link').addEventListener('click', () => showPage('watchlist'));
$('#discover-link').addEventListener('click', () => showPage('discover'));
window.addEventListener('hashchange', () => showPage(location.hash === '#discover' ? 'discover' : 'watchlist'));
$('#discover-search').addEventListener('input', event => { state.discoverQuery = event.target.value.trim(); renderDiscover(); });
$('#sector-filters').addEventListener('click', event => { const button = event.target.closest('[data-sector]'); if (!button) return; state.discoverSector = button.dataset.sector; renderDiscover(); });
async function addFromDiscover(event) { const button = event.target.closest('[data-discover-add]'); if (!button || button.disabled) return; await mutate(`/api/watchlists/${state.activeListId}/items/${button.dataset.discoverAdd}`, 'PUT', `${button.dataset.discoverAdd} added to ${activeList().name}`); }
$('#discover-movers').addEventListener('click', addFromDiscover);
$('#discover-companies').addEventListener('click', addFromDiscover);

load();
setInterval(updateFreshness, 30_000);
