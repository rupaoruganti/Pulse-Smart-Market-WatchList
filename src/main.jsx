import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(value);
const initials = symbol => symbol.length > 5 ? symbol.slice(0, 2) : symbol.slice(0, 1);
const ago = iso => {
  const seconds = Math.max(1, Math.floor((Date.now() - new Date(iso)) / 1000));
  if (seconds < 60) return 'Updated just now';
  if (seconds < 3600) return `Updated ${Math.floor(seconds / 60)}m ago`;
  return `Updated ${Math.floor(seconds / 3600)}h ago`;
};
const sparkPoints = values => {
  const min = Math.min(...values);
  const range = Math.max(...values) - min || 1;
  return values.map((value, index) => `${index / (values.length - 1) * 115},${29 - (value - min) / range * 25}`).join(' ');
};

async function request(path, options = {}) {
  const response = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
  const payload = await response.json();
  if (!response.ok) throw Object.assign(new Error(payload.error || 'Could not complete that action.'), { status: response.status });
  return payload;
}

function Brand() {
  return <span className="brand-mark"><i /><i /><i /></span>;
}

function Modal({ open, onClose, className = '', lock = false, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog ref={ref} className={className} onClose={() => open && onClose?.()} onCancel={event => { if (lock) event.preventDefault(); else onClose?.(); }}>
      {!lock && <button className="dialog-close" onClick={onClose} aria-label="Close">×</button>}
      {children}
    </dialog>
  );
}

function Toasts({ toasts }) {
  return <div className="toast-region" aria-live="polite">{toasts.map(toast => <div key={toast.id} className={`toast${toast.error ? ' error' : ''}`}>{toast.message}</div>)}</div>;
}

function SignalCard({ stock }) {
  const main = stock.signals[0];
  const integrity = main.type === 'corporate-action';
  return (
    <article className={`signal-card ${integrity ? 'integrity-card' : ''}`} title={integrity ? 'Excluded from market-signal ranking' : `Meaningfulness score ${stock.score} — used only for ranking`}>
      <span className="signal-symbol">{initials(stock.symbol)}</span>
      <div><h3>{stock.symbol}</h3><p>{main.detail}</p></div>
      <div className="signal-value">{money(stock.price)}<small className={stock.changePct >= 0 ? 'positive' : 'negative'}>{stock.changePct >= 0 ? '+' : ''}{stock.changePct.toFixed(2)}%</small></div>
      <span className="signal-badge">{main.label}</span>
    </article>
  );
}

function Sparkline({ stock }) {
  const positive = stock.changePct >= 0;
  const color = positive ? '#00a984' : '#e05b62';
  const points = sparkPoints(stock.spark);
  return <svg className="sparkline" viewBox="0 0 115 32" preserveAspectRatio="none" aria-label="7 day price trend"><polygon points={`${points} 115,32 0,32`} fill={color} /><polyline points={points} stroke={color} /></svg>;
}

function StockRow({ stock, onManage }) {
  const positive = stock.changePct >= 0;
  return (
    <div className="stock-row">
      <div className="company"><span className="company-logo">{initials(stock.symbol)}</span><span className="company-name"><b>{stock.name}</b><small>{stock.symbol} · {stock.exchange}{stock.scoringMode === 'fallback' ? ' · Learning baseline' : ''}</small></span></div>
      <div className="price"><b>{money(stock.price)}</b></div>
      <div className="today"><b className={positive ? 'positive' : 'negative'}>{positive ? '+' : ''}{stock.changePct.toFixed(2)}%</b><small>{positive ? '+' : ''}{stock.change.toFixed(2)}</small></div>
      <Sparkline stock={stock} />
      <button className="row-menu" aria-label={`More options for ${stock.symbol}`} onClick={onManage}>•••</button>
    </div>
  );
}

function DiscoverCard({ stock, added, featured, onAdd }) {
  const positive = stock.changePct >= 0;
  return (
    <article className={`discover-card ${featured ? 'featured' : ''}`}>
      <span className="company-logo">{initials(stock.symbol)}</span>
      <div className="discover-company"><b>{stock.name}</b><small>{stock.symbol} · {stock.sector}</small></div>
      <div className="discover-price"><b>{money(stock.price)}</b><small className={positive ? 'positive' : 'negative'}>{positive ? '+' : ''}{stock.changePct.toFixed(2)}%</small></div>
      <button className={`discover-add ${added ? 'added' : ''}`} disabled={added} onClick={() => onAdd(stock.symbol)}>{added ? '✓ Added' : '+ Add'}</button>
    </article>
  );
}

function AuthDialog({ open, mode, setMode, onAuth, onDemo }) {
  const register = mode === 'register';
  const [busy, setBusy] = useState(false);
  const submit = async event => {
    event.preventDefault();
    setBusy(true);
    try { await onAuth(register ? '/api/auth/register' : '/api/auth/login', Object.fromEntries(new FormData(event.currentTarget))); event.currentTarget.reset(); }
    finally { setBusy(false); }
  };
  return (
    <Modal open={open} className="auth-dialog" lock>
      <div className="auth-brand"><Brand /><span>pulse</span></div>
      <p className="dialog-kicker">SMART MARKET WATCHLIST</p>
      <h2>{register ? 'Create your account' : 'Welcome back'}</h2>
      <p className="dialog-copy">{register ? 'Your watchlists and review state will stay separate and secure.' : 'Sign in to see what meaningfully changed.'}</p>
      <div className="auth-tabs" role="tablist"><button className={!register ? 'active' : ''} onClick={() => setMode('login')}>Log in</button><button className={register ? 'active' : ''} onClick={() => setMode('register')}>Register</button></div>
      <form className="profile-form auth-form" onSubmit={submit}>
        {register && <label><span>Name</span><input name="name" autoComplete="name" minLength="2" maxLength="50" required /></label>}
        <label><span>Email</span><input name="email" type="email" autoComplete="email" required /></label>
        <label><span>Password</span><input name="password" type="password" autoComplete={register ? 'new-password' : 'current-password'} minLength="8" maxLength="128" required />{register && <small>Use at least 8 characters</small>}</label>
        <button className="button primary" type="submit" disabled={busy}>{busy ? 'Please wait…' : register ? 'Create account' : 'Log in'}</button>
      </form>
      <div className="auth-divider"><span>or</span></div>
      <button className="button demo-button" disabled={busy} onClick={onDemo}>Continue with demo account</button>
      <p className="auth-note">Educational demo only · No financial transactions</p>
    </Modal>
  );
}

function App() {
  const [data, setData] = useState(null);
  const [activeListId, setActiveListId] = useState(() => localStorage.getItem('pulse.activeList') || 'core');
  const [filter, setFilter] = useState('all');
  const [view, setView] = useState(() => localStorage.getItem('pulse.view') || 'rows');
  const [page, setPage] = useState(() => location.hash === '#discover' ? 'discover' : 'watchlist');
  const [discoverSector, setDiscoverSector] = useState('All');
  const [discoverQuery, setDiscoverQuery] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [modal, setModal] = useState(null);
  const [authMode, setAuthMode] = useState('login');
  const [toasts, setToasts] = useState([]);
  const [, refreshClock] = useState(0);

  const toast = useCallback((message, error = false) => {
    const id = crypto.randomUUID();
    setToasts(current => [...current, { id, message, error }]);
    setTimeout(() => setToasts(current => current.filter(item => item.id !== id)), 3200);
  }, []);

  const load = useCallback(async (silent = false) => {
    try { setData(await request('/api/bootstrap')); }
    catch (error) { if (error.status === 401) setModal('auth'); else if (!silent) toast('Market data is unavailable. Check your connection and retry.', true); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const hash = () => setPage(location.hash === '#discover' ? 'discover' : 'watchlist');
    addEventListener('hashchange', hash);
    return () => removeEventListener('hashchange', hash);
  }, []);
  useEffect(() => {
    const timer = setInterval(() => refreshClock(value => value + 1), 30_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!data || !('EventSource' in window)) return;
    const events = new EventSource('/api/events');
    events.addEventListener('store', () => load(true));
    events.addEventListener('market', () => load(true));
    return () => events.close();
  }, [data?.user?.id, load]);
  useEffect(() => {
    if (!data?.watchlists?.length || data.watchlists.some(list => list.id === activeListId)) return;
    const next = data.watchlists[0].id;
    setActiveListId(next);
    localStorage.setItem('pulse.activeList', next);
  }, [data, activeListId]);
  useEffect(() => {
    const keys = event => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setSearchOpen(true); setTimeout(() => document.querySelector('#search')?.focus()); }
    };
    addEventListener('keydown', keys);
    return () => removeEventListener('keydown', keys);
  }, []);
  useEffect(() => {
    const closeSearch = event => {
      if (!event.target.closest('.search') && !event.target.closest('.search-results')) setSearchOpen(false);
    };
    document.addEventListener('pointerdown', closeSearch);
    return () => document.removeEventListener('pointerdown', closeSearch);
  }, []);

  const activeList = data?.watchlists.find(list => list.id === activeListId) || data?.watchlists[0];
  const stocks = useMemo(() => activeList ? data.instruments.filter(stock => activeList.symbolIds.includes(stock.symbol)) : [], [data, activeList]);
  const changed = useMemo(() => stocks.filter(stock => stock.signals.length), [stocks]);
  const integrityWarnings = changed.filter(stock => stock.signals.some(signal => signal.type === 'corporate-action'));
  const rankedChanges = changed.filter(stock => !integrityWarnings.includes(stock)).sort((a, b) => b.score - a.score).slice(0, 5);
  const noteworthy = [...integrityWarnings, ...rankedChanges];
  const totalSignals = stocks.reduce((sum, stock) => sum + stock.signals.length, 0);

  const changeList = id => { setActiveListId(id); localStorage.setItem('pulse.activeList', id); setFilter('all'); setSidebarOpen(false); };
  const mutate = async (path, method, success, extra = {}) => {
    try { const next = await request(path, { method, body: JSON.stringify({ version: data.version, ...extra }) }); setData(next); toast(success); return next; }
    catch (error) { toast(error.message, true); if (error.status === 409) load(true); throw error; }
  };
  const authenticate = async (path, values) => {
    try { const next = await request(path, { method: 'POST', body: JSON.stringify(values) }); setData(next); setModal(null); toast(path.endsWith('register') ? 'Account created' : 'Welcome back'); }
    catch (error) { toast(error.message, true); throw error; }
  };
  const demoLogin = async () => {
    try { const next = await request('/api/auth/demo', { method: 'POST', body: '{}' }); setData(next); setModal(null); toast('Demo account ready'); }
    catch (error) { toast(error.message, true); }
  };
  const createList = async () => {
    const name = prompt('Name your new watchlist');
    if (!name?.trim()) return;
    try { const next = await mutate('/api/watchlists', 'POST', 'Watchlist created', { name }); const id = next.watchlists.at(-1).id; changeList(id); }
    catch {}
  };
  const addStock = async symbol => { try { await mutate(`/api/watchlists/${activeList.id}/items/${symbol}`, 'PUT', `${symbol} added to ${activeList.name}`); setSearchOpen(false); setSearchQuery(''); } catch {} };

  if (!data) return <><div className="auth-loading"><div className="auth-brand"><Brand /><span>pulse</span></div></div><AuthDialog open={modal === 'auth'} mode={authMode} setMode={setAuthMode} onAuth={authenticate} onDemo={demoLogin} /><Toasts toasts={toasts} /></>;

  const user = data.user || { name: 'Demo User', accountType: 'Personal account' };
  const userInitials = user.name.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase();
  const ageSeconds = (Date.now() - new Date(data.market.asOf)) / 1000;
  const stale = ageSeconds > data.market.staleAfterSeconds;
  const feedKind = data.market.isDemo ? 'Demo only' : data.market.status === 'provider' ? 'Provider quote' : 'Provider issue';
  const filteredStocks = stocks.filter(stock => filter === 'all' || filter === 'attention' && stock.signals.length || filter === 'gainers' && stock.changePct > 0 || filter === 'losers' && stock.changePct < 0);
  const availableSearch = data.instruments.filter(stock => !activeList.symbolIds.includes(stock.symbol) && (!searchQuery.trim() || stock.symbol.toLowerCase().includes(searchQuery.trim().toLowerCase()) || stock.name.toLowerCase().includes(searchQuery.trim().toLowerCase()))).slice(0, 6);
  const sectors = ['All', ...new Set(data.instruments.map(stock => stock.sector))];
  const owned = new Set(activeList.symbolIds);
  const movers = [...data.instruments].sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct)).slice(0, 3);
  const discoverStocks = data.instruments.filter(stock => (discoverSector === 'All' || stock.sector === discoverSector) && (!discoverQuery.trim() || stock.name.toLowerCase().includes(discoverQuery.trim().toLowerCase()) || stock.symbol.toLowerCase().includes(discoverQuery.trim().toLowerCase())));

  return (
    <>
      <div className="app-shell">
        <aside className={`sidebar${sidebarOpen ? ' open' : ''}`} aria-label="Primary navigation">
          <a className="brand" href="#watchlist" aria-label="Pulse home"><Brand /><span>pulse</span></a>
          <nav className="primary-nav">
            <a className={`nav-link${page === 'watchlist' ? ' active' : ''}`} href="#watchlist" onClick={() => setSidebarOpen(false)}><span className="icon" data-icon="eye" />Watchlist</a>
            <a className={`nav-link${page === 'discover' ? ' active' : ''}`} href="#discover" onClick={() => setSidebarOpen(false)}><span className="icon" data-icon="compass" />Discover</a>
          </nav>
          <div className="side-section"><div className="side-heading"><span>WATCHLISTS</span><button className="icon-button" onClick={createList} aria-label="Create watchlist">+</button></div>
            <div className="watchlist-nav">{data.watchlists.map(list => <button key={list.id} className={`watchlist-item${list.id === activeList.id ? ' active' : ''}`} onClick={() => changeList(list.id)}><span>{list.name}</span><small>{list.symbolIds.length}</small></button>)}</div>
          </div>
          <div className="sidebar-footer"><button className="profile" onClick={() => setModal('profile')} aria-haspopup="dialog"><span className="avatar">{userInitials}</span><span><b>{user.name}</b><small>{user.accountType}</small></span><span className="kebab">•••</span></button></div>
        </aside>

        <main>
          <header className="topbar">
            <button className="mobile-menu" onClick={() => setSidebarOpen(value => !value)} aria-label="Open menu">☰</button>
            <label className="search"><span className="icon" data-icon="search" /><input id="search" value={searchQuery} onFocus={() => setSearchOpen(true)} onChange={event => { setSearchQuery(event.target.value); setSearchOpen(true); }} autoComplete="off" placeholder="Search stocks to add…" /><kbd>⌘ K</kbd></label>
            {!searchOpen ? null : <div className="search-results">{availableSearch.length ? availableSearch.map(stock => <button className="search-result" key={stock.symbol} onClick={() => addStock(stock.symbol)}><span><b>{stock.symbol}</b><small>{stock.name}</small></span><span>＋ Add</span></button>) : <div className="search-result"><span><b>No matches</b><small>Try a company name or ticker</small></span></div>}</div>}
            <button className="help-button" onClick={() => setModal('help')} aria-label="Help">?</button>
            <button className="bell" onClick={() => setModal('notifications')} aria-label="Notifications"><span className="icon" data-icon="bell" />{changed.length > 0 && <i />}</button>
          </header>

          {page === 'watchlist' ? <div className="content">
            <div className="page-heading"><div><p className="eyebrow"><span className={`live-dot${stale ? ' stale' : ''}`} /><span>{stale ? 'Data is stale' : data.market.label}</span><span>•</span><span>{ago(data.market.asOf)}</span></p><h1>{activeList.name}</h1><p>{activeList.symbolIds.length} companies · A clear view of what deserves your attention.</p></div><div className="heading-actions"><button className="button secondary" onClick={() => setModal('manage')}><span>⚙</span> Manage</button><button className="button primary" onClick={() => { setSearchOpen(true); setTimeout(() => document.querySelector('#search')?.focus()); }}>＋ Add stock</button></div></div>
            <section className="attention-card"><div className="attention-icon">✦</div><div className="attention-copy"><p className="attention-label">SINCE YOU LAST CHECKED</p><h2>{noteworthy.length ? `${noteworthy.length} ${noteworthy.length === 1 ? 'stock needs' : 'stocks need'} your attention` : 'You’re all caught up'}</h2><p>{integrityWarnings.length ? `${integrityWarnings.length} data-integrity ${integrityWarnings.length === 1 ? 'check requires' : 'checks require'} verification before reviewing market moves.` : noteworthy.length ? `${totalSignals} meaningful ${totalSignals === 1 ? 'change' : 'changes'} detected since your last review.` : 'No unusual moves in this watchlist right now.'}</p></div>{noteworthy.length > 0 && <button className="text-button" onClick={() => mutate('/api/review', 'POST', 'Changes marked as reviewed').catch(() => {})}>Mark as reviewed <span>→</span></button>}</section>
            <section className="signals" aria-label="Meaningful changes">{noteworthy.map(stock => <SignalCard key={stock.symbol} stock={stock} />)}</section>
            <div className="table-header"><div><h2>All stocks</h2><span className="count">{filteredStocks.length}</span></div><div className="view-controls"><button className="filter-button" onClick={() => setModal(modal === 'filters' ? null : 'filters')}><span className="icon" data-icon="filter" /> Filters {filter !== 'all' && <span className="filter-count">1</span>}</button><button className={`view-button${view === 'rows' ? ' active' : ''}`} onClick={() => { setView('rows'); localStorage.setItem('pulse.view', 'rows'); }} aria-label="List view">☷</button><button className={`view-button${view === 'cards' ? ' active' : ''}`} onClick={() => { setView('cards'); localStorage.setItem('pulse.view', 'cards'); }} aria-label="Card view">▦</button></div></div>
            {modal === 'filters' && <div className="filter-panel"><span>Show</span>{[['all','All'],['attention','Needs attention'],['gainers','Gainers'],['losers','Losers']].map(([id,label]) => <button key={id} className={filter === id ? 'active' : ''} onClick={() => setFilter(id)}>{label}</button>)}</div>}
            {filteredStocks.length ? <div className={`stock-table${view === 'cards' ? ' cards' : ''}`}><div className="stock-table-head"><span>COMPANY</span><span>PRICE</span><span>TODAY</span><span>7D TREND</span><span /></div><div id="stock-rows">{filteredStocks.map(stock => <StockRow key={stock.symbol} stock={stock} onManage={() => setModal('manage')} />)}</div></div> : <div className="empty-state"><div>⌁</div><h3>No stocks match this view</h3><p>Try another filter or add a company to this watchlist.</p></div>}
            <footer className="data-note"><span className="icon" data-icon="clock" /><span>{feedKind} · {data.market.source} · {stale ? 'refresh required' : ago(data.market.asOf).toLowerCase()}</span><button onClick={() => setModal('method')}>How changes are detected</button></footer>
          </div> : <div className="content discover-page">
            <div className="discover-hero"><p className="eyebrow">EXPLORE THE MARKET</p><h1>Discover companies</h1><p>Explore a focused universe and add companies worth following—not trading recommendations.</p></div>
            <div className="discover-toolbar"><label className="discover-search"><span className="icon" data-icon="search" /><input value={discoverQuery} onChange={event => setDiscoverQuery(event.target.value)} placeholder="Search by company or symbol" /></label><div className="sector-filters">{sectors.map(sector => <button key={sector} className={sector === discoverSector ? 'active' : ''} onClick={() => setDiscoverSector(sector)}>{sector}</button>)}</div></div>
            <section className="discover-section"><div className="discover-heading"><div><h2>Today’s movers</h2><p>Largest absolute moves in the demo market</p></div><span className="information-pill">Informational only</span></div><div className="discover-grid">{movers.map(stock => <DiscoverCard key={stock.symbol} stock={stock} added={owned.has(stock.symbol)} featured onAdd={addStock} />)}</div></section>
            <section className="discover-section"><div className="discover-heading"><div><h2>All companies</h2><p>{discoverStocks.length} {discoverStocks.length === 1 ? 'company' : 'companies'} available</p></div></div>{discoverStocks.length ? <div className="discover-list">{discoverStocks.map(stock => <DiscoverCard key={stock.symbol} stock={stock} added={owned.has(stock.symbol)} onAdd={addStock} />)}</div> : <div className="empty-state"><div>⌕</div><h3>No companies found</h3><p>Try another company, symbol, or sector.</p></div>}</section>
          </div>}
        </main>
      </div>

      <ManageDialog open={modal === 'manage'} onClose={() => setModal(null)} activeList={activeList} stocks={stocks} listCount={data.watchlists.length} mutate={mutate} changeList={changeList} />
      <MethodDialog open={modal === 'method'} onClose={() => setModal(null)} />
      <HelpDialog open={modal === 'help'} onClose={() => setModal(null)} onMethod={() => setModal('method')} />
      <NotificationsDialog open={modal === 'notifications'} onClose={() => setModal(null)} changed={changed} market={data.market} listName={activeList.name} onReview={() => { setModal(null); mutate('/api/review', 'POST', 'Notifications marked as reviewed').catch(() => {}); }} />
      <ProfileDialog open={modal === 'profile'} onClose={() => setModal(null)} data={data} mutate={mutate} setData={setData} setModal={setModal} setActiveListId={setActiveListId} toast={toast} />
      <AuthDialog open={modal === 'auth'} mode={authMode} setMode={setAuthMode} onAuth={authenticate} onDemo={demoLogin} />
      <Toasts toasts={toasts} />
    </>
  );
}

function ManageDialog({ open, onClose, activeList, stocks, listCount, mutate, changeList }) {
  const [name, setName] = useState(activeList.name);
  useEffect(() => setName(activeList.name), [activeList.id, activeList.name]);
  const remove = async symbol => { try { await mutate(`/api/watchlists/${activeList.id}/items/${symbol}`, 'DELETE', `${symbol} removed`); } catch {} };
  const rename = async event => { event.preventDefault(); try { await mutate(`/api/watchlists/${activeList.id}`, 'PATCH', 'Watchlist renamed', { name }); } catch {} };
  const removeList = async () => {
    if (listCount === 1 || !confirm(`Delete “${activeList.name}”?`)) return;
    try { const next = await mutate(`/api/watchlists/${activeList.id}`, 'DELETE', 'Watchlist deleted'); changeList(next.watchlists[0].id); onClose(); } catch {}
  };
  return <Modal open={open} onClose={onClose}><p className="dialog-kicker">WATCHLIST SETTINGS</p><h2>Manage watchlist</h2><p className="dialog-copy">Rename this list or remove stocks you no longer want to track.</p><form className="rename-list-form" onSubmit={rename}><label><span>Watchlist name</span><span><input value={name} onChange={event => setName(event.target.value)} maxLength="40" required /><button className="button secondary" type="submit">Save</button></span></label></form><div className="manage-divider"><span>COMPANIES</span></div><div className="manage-list">{stocks.length ? stocks.map(stock => <div className="manage-item" key={stock.symbol}><span><b>{stock.symbol}</b><small>{stock.name}</small></span><button onClick={() => remove(stock.symbol)}>Remove</button></div>) : <p className="dialog-copy">This watchlist is empty.</p>}</div><div className="danger-zone"><div><b>Delete this watchlist</b><small>{listCount === 1 ? 'Create another watchlist before deleting this one.' : 'This cannot be undone.'}</small></div><button className="button danger-button" disabled={listCount === 1} onClick={removeList}>Delete</button></div></Modal>;
}

function MethodDialog({ open, onClose }) {
  return <Modal open={open} onClose={onClose}><p className="dialog-kicker">TRANSPARENT BY DESIGN</p><h2>What counts as meaningful?</h2><p className="dialog-copy">Pulse uses a small set of explainable rules. It does not predict prices or give investment advice.</p><div className="rule"><b>Unusual price movement · 45%</b><span>Change since your review, compared with this stock’s own normal move</span></div><div className="rule"><b>Unusual activity · 30%</b><span>Current volume compared with its 20-day average and variability</span></div><div className="rule"><b>Important level crossed · 15%</b><span>A move through the previous session’s high or low</span></div><div className="rule"><b>Volatility shift · 10%</b><span>Today’s trading range compared with this stock’s normal range</span></div><p className="disclaimer">Only statistically unusual changes above the noise floor are shown, with at most five per visit. New stocks use conservative fallback data while a personal baseline is established.</p><p className="disclaimer">Signals are informational, not recommendations. Always do your own research before investing.</p></Modal>;
}

function HelpDialog({ open, onClose, onMethod }) {
  return <Modal open={open} onClose={onClose} className="help-dialog"><p className="dialog-kicker">QUICK GUIDE</p><h2>How Pulse works</h2><p className="dialog-copy">Pulse filters market noise and explains what changed since your last review.</p>{[['1','Build a focused watchlist','Search or use Discover to add companies you want to follow.'],['2','Review meaningful changes','Signals compare each stock with its own history and your saved baseline.'],['3','Mark changes reviewed','Pulse stays quiet until activity meaningfully escalates again.']].map(([n,title,copy]) => <div className="help-step" key={n}><span>{n}</span><div><b>{title}</b><small>{copy}</small></div></div>)}<div className="keyboard-tip"><kbd>Ctrl</kbd><span>+</span><kbd>K</kbd><span>Search stocks from anywhere</span></div><button className="button secondary full-button" onClick={onMethod}>View signal methodology</button></Modal>;
}

function NotificationsDialog({ open, onClose, changed, market, listName, onReview }) {
  return <Modal open={open} onClose={onClose} className="notification-dialog"><p className="dialog-kicker">ATTENTION CENTER</p><h2>Notifications</h2><p className="dialog-copy">{market.label} · {ago(market.asOf)} · {listName}</p><div className="notification-list">{changed.length ? [...changed].sort((a,b) => b.score-a.score).map(stock => <div className="notification-item" key={stock.symbol}><span className="signal-symbol">{initials(stock.symbol)}</span><div><b>{stock.symbol} · {stock.signals[0].label}</b><small>{stock.signals[0].detail}</small></div><span className={stock.changePct >= 0 ? 'positive' : 'negative'}>{stock.changePct >= 0 ? '+' : ''}{stock.changePct.toFixed(2)}%</span></div>) : <div className="notification-empty"><span>✓</span><b>You’re all caught up</b><small>No meaningful changes need your attention.</small></div>}</div>{changed.length > 0 && <button className="button primary full-button" onClick={onReview}>Mark all as reviewed</button>}</Modal>;
}

function ProfileDialog({ open, onClose, data, mutate, setData, setModal, setActiveListId, toast }) {
  const [name, setName] = useState(data.user.name);
  const [email, setEmail] = useState(data.user.email);
  useEffect(() => { setName(data.user.name); setEmail(data.user.email); }, [data.user]);
  const save = async event => { event.preventDefault(); try { await mutate('/api/profile', 'PATCH', 'Profile updated', { name, email }); onClose(); } catch {} };
  const reset = async () => { const demo = data.user.id === 'demo-user'; if (!confirm(`${demo ? 'Reset demo' : 'Replace your current'} watchlists and reviewed changes with the starter state?`)) return; try { await mutate('/api/account/reset', 'POST', demo ? 'Demo state restored' : 'Starter watchlists restored'); setActiveListId('core'); localStorage.setItem('pulse.activeList','core'); onClose(); } catch {} };
  const logout = async () => { await request('/api/auth/logout', { method: 'POST', body: '{}' }); setData(null); onClose(); setModal('auth'); toast('Signed out'); };
  return <Modal open={open} onClose={onClose}><p className="dialog-kicker">PERSONAL ACCOUNT</p><h2>Profile settings</h2><p className="dialog-copy">Your preferences and review baseline are saved by the Pulse server.</p><form className="profile-form" onSubmit={save}><label><span>Name</span><input value={name} onChange={event => setName(event.target.value)} maxLength="50" autoComplete="name" required /></label><label><span>Email</span><input value={email} onChange={event => setEmail(event.target.value)} maxLength="100" type="email" autoComplete="email" required /></label><div className="account-status"><i /><span><b>Sync active</b><small>Watchlists and review state persist across sessions</small></span></div><button className="button reset-demo-button" type="button" onClick={reset}>{data.user.id === 'demo-user' ? 'Reset demo state' : 'Restore starter watchlists'}</button><div className="profile-actions"><button className="button danger-button" type="button" onClick={logout}>Log out</button><button className="button primary" type="submit">Save profile</button></div></form></Modal>;
}

createRoot(document.getElementById('root')).render(<App />);
