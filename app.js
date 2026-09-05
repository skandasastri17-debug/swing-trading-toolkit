'use strict';
/* Swing Trading Toolkit — vanilla JS, no dependencies.
   All data stays in localStorage. Simulations are seeded and deterministic. */

// ---------------------------------------------------------------- helpers
const $ = (id) => document.getElementById(id);

const fmtC0 = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 });
const fmtC2 = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money0 = (v) => fmtC0.format(v);
const money2 = (v) => fmtC2.format(v);
const pctS = (v, d = 1) => (v * 100).toFixed(d) + '%';
const num = (id) => parseFloat($(id).value);

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function quantileSorted(arr, q) {
  if (!arr.length) return 0;
  const pos = (arr.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return arr[lo] + (arr[hi] - arr[lo]) * (pos - lo);
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Monday (as YYYY-MM-DD) of the week containing the given date string.
function mondayOf(ds) {
  const d = new Date(ds + 'T12:00:00');
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function addDays(ds, n) {
  const d = new Date(ds + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---------------------------------------------------------------- canvas
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
function colors() {
  return {
    accent: cssVar('--accent') || '#2dd4a7',
    red: cssVar('--red') || '#f0655a',
    amber: cssVar('--amber') || '#e8b64c',
    dim: cssVar('--text-dim') || '#97a4b1',
    grid: 'rgba(151,164,177,0.22)',
  };
}
function hexA(hex, a) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const v = parseInt(m[1], 16);
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`;
}
function ctx2d(canvas) {
  const dpr = window.devicePixelRatio || 1;
  if (!canvas._W) {
    canvas._W = canvas.width; canvas._H = canvas.height;
    canvas.width = canvas._W * dpr; canvas.height = canvas._H * dpr;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, canvas._W, canvas._H);
  ctx.font = '11px -apple-system, system-ui, sans-serif';
  return { ctx, W: canvas._W, H: canvas._H };
}
function emptyChart(canvas, msg) {
  const { ctx, W, H } = ctx2d(canvas);
  ctx.fillStyle = colors().dim;
  ctx.textAlign = 'center';
  ctx.fillText(msg, W / 2, H / 2);
}

// ---------------------------------------------------------------- tabs
function activateTab(name) {
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + name));
}
document.querySelectorAll('.tab-btn').forEach((b) =>
  b.addEventListener('click', () => activateTab(b.dataset.tab)));
document.querySelectorAll('[data-goto]').forEach((a) =>
  a.addEventListener('click', (e) => { e.preventDefault(); activateTab(a.dataset.goto); window.scrollTo(0, 0); }));

// ================================================================ REALITY
function realityInputs() {
  return {
    C: num('rc-account'), r: num('rc-risk') / 100, p: num('rc-winrate') / 100,
    b: num('rc-rr'), n: Math.round(num('rc-trades')), cost: num('rc-cost'),
    target: num('rc-target'), seed: Math.round(num('rc-seed')) || 1,
  };
}
function realityValid(v) {
  return [v.C, v.r, v.p, v.b, v.n, v.cost, v.target].every((x) => Number.isFinite(x)) &&
    v.C > 0 && v.r > 0 && v.p > 0 && v.p < 1 && v.b > 0 && v.n >= 1;
}

function updateRealityClosedForm() {
  const v = realityInputs();
  if (!realityValid(v)) return;

  const edge = v.p * v.b - (1 - v.p);            // R per trade, before costs
  const riskD = v.C * v.r;                        // $ risked per trade
  const expTrade = edge * riskD - v.cost;         // $ per trade, after costs
  const weekly = expTrade * v.n;
  const weeklyPct = weekly / v.C;
  const annualSimple = weeklyPct * 52;
  const annualComp = Math.pow(1 + weeklyPct, 52) - 1;

  $('rc-edge').textContent = (edge >= 0 ? '+' : '') + edge.toFixed(2) + 'R';
  $('rc-risk-dollars').textContent = money0(riskD);
  $('rc-exp-trade').textContent = money2(expTrade);
  $('rc-exp-week').textContent = money2(weekly);
  $('rc-week-pct').textContent = pctS(weeklyPct, 2);
  $('rc-annual-simple').textContent = pctS(annualSimple, 1);
  $('rc-annual-comp').textContent = pctS(annualComp, 1);

  const warn = $('rc-warning');
  if (edge <= 0) {
    // negative or zero edge: no account size can reach the target
    $('rc-required').textContent = '—';
    warn.hidden = false;
    warn.textContent = 'With these assumptions your expectancy is negative before costs. No amount of capital reaches the target — the edge itself has to improve (win rate and/or reward:risk) first.';
  } else {
    const required = (v.target / v.n + v.cost) / (edge * v.r);
    $('rc-required').textContent = money0(required);
    if (expTrade <= 0) {
      warn.hidden = false;
      warn.textContent = 'After costs your expectancy is negative at this account size — costs are eating the edge. The "account needed" figure shows where the target becomes arithmetically possible.';
    } else {
      warn.hidden = true;
    }
  }

  // Longest expected losing streak over a year of trading
  const N = v.n * 52;
  const streak = Math.round(Math.log(N) / Math.log(1 / (1 - v.p)));
  $('rc-streak').textContent = `≈ ${streak} losses in a row (≈ ${(streak * v.r * 100).toFixed(1)}% drawdown)`;

  $('rc-target-label').textContent = new Intl.NumberFormat('en-CA').format(v.target);
  renderRequiredTable(v, edge);
}

function verdictFor(annualComp) {
  if (annualComp <= 0.10) return ['index-fund range — plausible', 'v-ok'];
  if (annualComp <= 0.30) return ['top-professional territory', 'v-mid'];
  if (annualComp <= 1.00) return ['elite, rarely sustained', 'v-bad'];
  return ['not a planning number', 'v-bad'];
}

function renderRequiredTable(v, edge) {
  const sizes = [25000, 50000, 100000, 250000, 500000];
  if (!sizes.includes(v.C) && v.C > 0) sizes.push(v.C);
  sizes.sort((a, b) => a - b);
  const rows = sizes.map((C) => {
    const w = v.target / C;
    const comp = Math.pow(1 + w, 52) - 1;
    const [label, cls] = verdictFor(comp);
    const hl = C === v.C ? ' class="hl"' : '';
    const you = C === v.C ? ' (you)' : '';
    return `<tr${hl}><td>${money0(C)}${you}</td><td>${pctS(w, 2)}</td><td>${pctS(w * 52, 0)}</td>` +
      `<td>${pctS(comp, 0)}</td><td><span class="verdict ${cls}">${label}</span></td></tr>`;
  });
  $('rc-table-body').innerHTML = rows.join('');
}

// ------------------------------------------------ Monte Carlo simulation
let mcTimer = null;
function scheduleMonteCarlo() { clearTimeout(mcTimer); mcTimer = setTimeout(runMonteCarlo, 150); }

function runMonteCarlo() {
  const v = realityInputs();
  if (!realityValid(v)) return;
  const rnd = mulberry32(v.seed);
  const SIMS = 1000, WEEKS = 52;
  const DEAD = v.C * 0.05;

  const finals = [], maxDDs = [], weeklyAll = [], curves = [];
  let lostHalf = 0;

  for (let s = 0; s < SIMS; s++) {
    let eq = v.C, peak = v.C, maxDD = 0, everHalf = false, dead = false;
    const curve = [eq];
    for (let w = 0; w < WEEKS; w++) {
      const ws = eq;
      if (!dead) {
        for (let t = 0; t < v.n; t++) {
          const R = eq * v.r;
          if (rnd() < v.p) eq += v.b * R - v.cost;
          else eq -= R + v.cost;
          if (eq < DEAD) { eq = Math.max(eq, 0); dead = true; break; }
        }
      }
      if (eq > peak) peak = eq;
      const dd = (peak - eq) / peak;
      if (dd > maxDD) maxDD = dd;
      if (eq <= v.C * 0.5) everHalf = true;
      weeklyAll.push(eq - ws);
      curve.push(eq);
    }
    finals.push(eq); maxDDs.push(maxDD); curves.push(curve);
    if (everHalf) lostHalf++;
  }

  finals.sort((a, b) => a - b);
  maxDDs.sort((a, b) => a - b);
  const median = quantileSorted(finals, 0.5);
  const p10 = quantileSorted(finals, 0.1), p90 = quantileSorted(finals, 0.9);
  const losingYears = finals.filter((f) => f < v.C).length / SIMS;
  const hitWeeks = weeklyAll.filter((x) => x >= v.target).length / weeklyAll.length;
  const negWeeks = weeklyAll.filter((x) => x < 0).length / weeklyAll.length;

  $('mc-median').textContent = money0(median);
  $('mc-range').textContent = `${money0(p10)} – ${money0(p90)}`;
  $('mc-losing').textContent = pctS(losingYears, 1);
  $('mc-dd').textContent = pctS(quantileSorted(maxDDs, 0.5), 1);
  $('mc-ruin').textContent = pctS(lostHalf / SIMS, 1);
  $('mc-weeks-hit').textContent = pctS(hitWeeks, 1);
  $('mc-weeks-neg').textContent = pctS(negWeeks, 1);

  drawCurves($('mc-curves'), curves, v.C, finals);
  drawHist($('mc-hist'), weeklyAll, v.target);
}

function drawCurves(canvas, curves, start, sortedFinals) {
  const { ctx, W, H } = ctx2d(canvas);
  const C = colors();
  const padL = 64, padR = 12, padT = 10, padB = 24;
  const iw = W - padL - padR, ih = H - padT - padB;
  const weeks = curves[0].length - 1;

  let yMax = Math.max(quantileSorted(sortedFinals, 0.95) * 1.08, start * 1.25);
  let yMin = Math.min(quantileSorted(sortedFinals, 0.02) * 0.9, start * 0.75);
  yMin = Math.max(0, yMin);
  const X = (w) => padL + (w / weeks) * iw;
  const Y = (v) => padT + ih - ((v - yMin) / (yMax - yMin)) * ih;

  // grid + y labels
  ctx.textAlign = 'right'; ctx.fillStyle = C.dim;
  for (let i = 0; i <= 4; i++) {
    const val = yMin + ((yMax - yMin) * i) / 4;
    const y = Y(val);
    ctx.strokeStyle = C.grid; ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
    ctx.fillText(money0(val), padL - 8, y + 4);
  }
  ctx.textAlign = 'center';
  for (let w = 0; w <= weeks; w += 13) ctx.fillText(w === 0 ? 'wk 0' : String(w), X(w), H - 8);

  // starting equity
  ctx.strokeStyle = C.dim; ctx.setLineDash([5, 4]);
  ctx.beginPath(); ctx.moveTo(padL, Y(start)); ctx.lineTo(W - padR, Y(start)); ctx.stroke();
  ctx.setLineDash([]);

  ctx.save();
  ctx.beginPath(); ctx.rect(padL, padT, iw, ih); ctx.clip();

  // sample of individual runs
  ctx.strokeStyle = hexA(C.accent, 0.07); ctx.lineWidth = 1;
  const step = Math.max(1, Math.floor(curves.length / 120));
  for (let s = 0; s < curves.length; s += step) {
    ctx.beginPath();
    curves[s].forEach((v, w) => (w === 0 ? ctx.moveTo(X(w), Y(v)) : ctx.lineTo(X(w), Y(v))));
    ctx.stroke();
  }

  // median path per week
  ctx.strokeStyle = C.accent; ctx.lineWidth = 2.2;
  ctx.beginPath();
  const col = new Array(curves.length);
  for (let w = 0; w <= weeks; w++) {
    for (let s = 0; s < curves.length; s++) col[s] = curves[s][w];
    col.sort((a, b) => a - b);
    const m = quantileSorted(col, 0.5);
    w === 0 ? ctx.moveTo(X(w), Y(m)) : ctx.lineTo(X(w), Y(m));
  }
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = C.dim; ctx.textAlign = 'left';
  ctx.fillText('median in bold · dashed = starting equity', padL + 6, padT + 12);
}

function drawHist(canvas, values, target) {
  const { ctx, W, H } = ctx2d(canvas);
  const C = colors();
  const padL = 12, padR = 12, padT = 10, padB = 26;
  const iw = W - padL - padR, ih = H - padT - padB;

  const sorted = [...values].sort((a, b) => a - b);
  let lo = quantileSorted(sorted, 0.005), hi = quantileSorted(sorted, 0.995);
  lo = Math.min(lo, 0); hi = Math.max(hi, target * 1.15, 1);
  const BINS = 48, bw = (hi - lo) / BINS;
  const bins = new Array(BINS).fill(0);
  for (const v of values) {
    const i = Math.floor((v - lo) / bw);
    if (i >= 0 && i < BINS) bins[i]++;
  }
  const maxBin = Math.max(...bins, 1);
  const X = (v) => padL + ((v - lo) / (hi - lo)) * iw;

  for (let i = 0; i < BINS; i++) {
    const x0 = padL + (i / BINS) * iw;
    const h = (bins[i] / maxBin) * ih;
    const center = lo + (i + 0.5) * bw;
    ctx.fillStyle = hexA(center < 0 ? C.red : C.accent, 0.75);
    ctx.fillRect(x0 + 0.5, padT + ih - h, iw / BINS - 1, h);
  }

  // markers: $0 and target
  ctx.setLineDash([5, 4]); ctx.lineWidth = 1.4;
  ctx.strokeStyle = C.dim;
  ctx.beginPath(); ctx.moveTo(X(0), padT); ctx.lineTo(X(0), padT + ih); ctx.stroke();
  ctx.strokeStyle = C.amber;
  ctx.beginPath(); ctx.moveTo(X(target), padT); ctx.lineTo(X(target), padT + ih); ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = C.dim; ctx.textAlign = 'center';
  ctx.fillText('$0', X(0), H - 8);
  ctx.fillStyle = C.amber;
  ctx.fillText('target ' + money0(target), Math.min(X(target), W - 60), H - 8);
  ctx.fillStyle = C.dim; ctx.textAlign = 'left';
  ctx.fillText(money0(lo), padL, H - 8);
  ctx.textAlign = 'right';
  ctx.fillText(money0(hi), W - padR, H - 8);
}

['rc-account', 'rc-risk', 'rc-winrate', 'rc-rr', 'rc-trades', 'rc-cost', 'rc-target', 'rc-seed']
  .forEach((id) => $(id).addEventListener('input', () => { updateRealityClosedForm(); scheduleMonteCarlo(); }));
$('rc-run').addEventListener('click', runMonteCarlo);

// ================================================================ SIZER
function updateSizer() {
  const account = num('ps-account'), riskPct = num('ps-risk');
  const entry = num('ps-entry'), stop = num('ps-stop'), target = num('ps-target');
  const fees = num('ps-fees') || 0;
  const out = ['ps-riskshare', 'ps-shares', 'ps-cost', 'ps-pct', 'ps-rr', 'ps-loss', 'ps-gain', 'ps-breakeven'];
  const warnBox = $('ps-warnings'), badge = $('ps-direction'), hint = $('ps-hint');

  const reset = (msg) => {
    out.forEach((id) => ($(id).textContent = '–'));
    badge.hidden = true; warnBox.hidden = true;
    hint.textContent = msg;
  };

  if (!Number.isFinite(account) || account <= 0 || !Number.isFinite(riskPct) || riskPct <= 0) {
    return reset('Enter your account size and risk %.');
  }
  if (!Number.isFinite(entry) || !Number.isFinite(stop) || entry <= 0 || stop <= 0) {
    return reset('Enter an entry and a stop. Stop below entry = long; stop above entry = short.');
  }
  if (entry === stop) return reset('Entry and stop can\'t be equal.');

  hint.textContent = '';
  const long = stop < entry;
  badge.hidden = false;
  badge.textContent = long ? 'LONG' : 'SHORT';
  badge.classList.toggle('short', !long);

  const rps = Math.abs(entry - stop);
  const riskBudget = (account * riskPct) / 100;
  const shares = Math.max(0, Math.floor((riskBudget - fees) / rps));
  const cost = shares * entry;
  const lossAtStop = shares * rps + fees;
  const pctAcct = cost / account;

  $('ps-riskshare').textContent = money2(rps);
  $('ps-shares').textContent = shares.toLocaleString('en-CA');
  $('ps-cost').textContent = money0(cost);
  $('ps-pct').textContent = pctS(pctAcct, 1);
  $('ps-loss').innerHTML = `<span class="num-neg">−${money2(lossAtStop)}</span>`;
  $('ps-breakeven').textContent = shares > 0
    ? money2(long ? entry + fees / shares : entry - fees / shares) : '–';

  const warnings = [];
  if (shares === 0) warnings.push(`Risk budget ${money2(riskBudget)} doesn't cover fees plus one share's risk at this stop distance — the stop is too wide for this account.`);
  if (pctAcct > 1) warnings.push('Position exceeds your account value — that\'s leverage. Margin magnifies the losing streaks in the Reality Check.');
  else if (pctAcct > 0.25) warnings.push('Position is over 25% of the account in one name — a common cap for swing traders. Consider a tighter stop or a smaller idea.');

  let rrTxt = 'add a target';
  if (Number.isFinite(target) && target > 0) {
    const rightSide = long ? target > entry : target < entry;
    if (!rightSide) {
      warnings.push('Target is on the wrong side of the entry for a ' + (long ? 'long' : 'short') + '.');
      $('ps-gain').textContent = '–';
    } else {
      const rr = Math.abs(target - entry) / rps;
      rrTxt = rr.toFixed(2) + ' : 1';
      if (rr < 2) warnings.push('Reward:risk below 2:1 — at typical swing win rates this needs an unusually high hit rate to be profitable.');
      const gain = shares * Math.abs(target - entry) - fees;
      $('ps-gain').innerHTML = `<span class="num-pos">+${money2(gain)}</span>`;
    }
  } else {
    $('ps-gain').textContent = '–';
  }
  $('ps-rr').textContent = rrTxt;

  warnBox.hidden = warnings.length === 0;
  warnBox.innerHTML = warnings.map((w) => '⚠️ ' + w).join('<br>');
}
['ps-account', 'ps-risk', 'ps-entry', 'ps-stop', 'ps-target', 'ps-fees']
  .forEach((id) => $(id).addEventListener('input', updateSizer));

// checklist
function updateCheckScore() {
  const boxes = [...document.querySelectorAll('#ps-checklist .check')];
  $('ps-check-score').textContent = `${boxes.filter((b) => b.checked).length} / ${boxes.length}`;
}
document.querySelectorAll('#ps-checklist .check').forEach((b) => b.addEventListener('change', updateCheckScore));
$('ps-check-reset').addEventListener('click', () => {
  document.querySelectorAll('#ps-checklist .check').forEach((b) => (b.checked = false));
  updateCheckScore();
});

// ================================================================ JOURNAL
const LS_KEY = 'stt-journal-v1';
let trades = loadTrades();

function loadTrades() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
function saveTrades() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(trades)); } catch { /* storage may be unavailable */ }
}

function tradePnl(t) {
  if (t.exit == null) return null;
  const dir = t.dir === 'short' ? -1 : 1;
  return (t.exit - t.entry) * t.shares * dir - (t.fees || 0);
}
function tradeR(t) {
  const pnl = tradePnl(t);
  const planned = Math.abs(t.entry - t.stop) * t.shares;
  if (pnl == null || planned <= 0) return null;
  return pnl / planned;
}

$('jr-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const exitRaw = $('jr-exit').value.trim();
  const t = {
    id: Date.now() + '-' + Math.floor(Math.random() * 1e6),
    openDate: $('jr-date').value,
    symbol: $('jr-symbol').value.trim().toUpperCase(),
    market: $('jr-market').value,
    dir: $('jr-dir').value,
    shares: Math.round(num('jr-shares')),
    entry: num('jr-entry'),
    stop: num('jr-stop'),
    exit: exitRaw === '' ? null : parseFloat(exitRaw),
    closeDate: $('jr-close-date').value || null,
    fees: num('jr-fees') || 0,
    setup: $('jr-setup').value,
    notes: $('jr-notes').value.trim(),
  };
  if (!t.openDate || !t.symbol || !(t.shares > 0) || !(t.entry > 0) || !(t.stop > 0)) return;
  if (t.exit != null && !t.closeDate) t.closeDate = todayStr();
  trades.push(t);
  saveTrades();
  renderJournal();
  e.target.reset();
  $('jr-date').value = todayStr();
  $('jr-fees').value = '10';
  $('jr-io-status').textContent = `Logged ${t.symbol}.`;
});

function closeTrade(id) {
  const t = trades.find((x) => x.id === id);
  if (!t) return;
  const exitStr = window.prompt(`Exit price for ${t.symbol}:`);
  if (exitStr == null) return;
  const exit = parseFloat(exitStr);
  if (!Number.isFinite(exit) || exit <= 0) { alert('Not a valid price.'); return; }
  const dateStr = window.prompt('Close date (YYYY-MM-DD):', todayStr());
  if (dateStr == null) return;
  t.exit = exit;
  t.closeDate = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? dateStr : todayStr();
  saveTrades();
  renderJournal();
}
function deleteTrade(id) {
  const t = trades.find((x) => x.id === id);
  if (!t) return;
  if (!confirm(`Delete ${t.symbol} (${t.openDate})?`)) return;
  trades = trades.filter((x) => x.id !== id);
  saveTrades();
  renderJournal();
}

function renderJournal() {
  const tbody = $('jr-tbody');
  const sorted = [...trades].sort((a, b) => (b.openDate || '').localeCompare(a.openDate || ''));
  $('jr-empty').style.display = trades.length ? 'none' : 'block';

  tbody.innerHTML = sorted.map((t) => {
    const pnl = tradePnl(t), r = tradeR(t);
    const pnlCell = pnl == null
      ? '<span class="badge">OPEN</span>'
      : `<span class="${pnl >= 0 ? 'num-pos' : 'num-neg'}">${pnl >= 0 ? '+' : '−'}${money2(Math.abs(pnl))}</span>`;
    const rCell = r == null ? '–' : (r >= 0 ? '+' : '') + r.toFixed(2) + 'R';
    const actions = (pnl == null ? `<button class="btn small" data-close="${t.id}">Close</button> ` : '') +
      `<button class="btn small danger" data-del="${t.id}">✕</button>`;
    return `<tr><td>${t.openDate}</td><td title="${t.notes ? t.notes.replace(/"/g, '&quot;') : ''}">${t.symbol}</td>` +
      `<td>${t.market}</td><td>${t.dir === 'short' ? 'S' : 'L'}</td><td>${t.shares}</td>` +
      `<td>${money2(t.entry)}</td><td>${money2(t.stop)}</td><td>${t.exit == null ? '–' : money2(t.exit)}</td>` +
      `<td>${pnlCell}</td><td>${rCell}</td><td>${t.setup}</td><td>${actions}</td></tr>`;
  }).join('');

  tbody.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => closeTrade(b.dataset.close)));
  tbody.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => deleteTrade(b.dataset.del)));

  renderJournalStats();
  renderWeeklyChart();
  renderEquityChart();
}

function renderJournalStats() {
  const closed = trades.filter((t) => tradePnl(t) != null);
  const open = trades.length - closed.length;
  $('js-count').textContent = closed.length;
  $('js-open').textContent = open;

  if (!closed.length) {
    ['js-winrate', 'js-expd', 'js-expr', 'js-pf', 'js-avgwin', 'js-avgloss', 'js-total'].forEach((id) => ($(id).textContent = '–'));
    $('js-weekly4').textContent = 'No closed trades yet — your 4-week average vs. the target will appear here.';
    return;
  }

  const pnls = closed.map(tradePnl);
  const wins = pnls.filter((p) => p > 0), losses = pnls.filter((p) => p <= 0);
  const grossWin = wins.reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0));
  const total = pnls.reduce((a, b) => a + b, 0);
  const rs = closed.map(tradeR).filter((r) => r != null);

  $('js-winrate').textContent = pctS(wins.length / closed.length, 1);
  $('js-expd').textContent = money2(total / closed.length);
  $('js-expr').textContent = rs.length ? ((rs.reduce((a, b) => a + b, 0) / rs.length >= 0 ? '+' : '') + (rs.reduce((a, b) => a + b, 0) / rs.length).toFixed(2) + 'R') : '–';
  $('js-pf').textContent = grossLoss === 0 ? (grossWin > 0 ? '∞' : '–') : (grossWin / grossLoss).toFixed(2);
  $('js-avgwin').textContent = wins.length ? money2(grossWin / wins.length) : '–';
  $('js-avgloss').textContent = losses.length ? '−' + money2(grossLoss / losses.length) : '–';
  $('js-total').innerHTML = `<span class="${total >= 0 ? 'num-pos' : 'num-neg'}">${total >= 0 ? '+' : '−'}${money2(Math.abs(total))}</span>`;

  // rolling 4 calendar weeks vs target
  const cutoff = addDays(todayStr(), -28);
  const recent = closed.filter((t) => (t.closeDate || t.openDate) >= cutoff);
  const avgWeek = recent.reduce((a, t) => a + tradePnl(t), 0) / 4;
  const target = Number.isFinite(num('rc-target')) ? num('rc-target') : 2000;
  const pct = target > 0 ? Math.round((avgWeek / target) * 100) : 0;
  $('js-weekly4').textContent =
    `Last 4 weeks: averaging ${money0(avgWeek)}/week — ${pct}% of the ${money0(target)} target.`;
}

function weeklyBuckets(weeks) {
  const thisMonday = mondayOf(todayStr());
  const labels = [], values = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const wk = addDays(thisMonday, -7 * i);
    labels.push(wk.slice(5));
    values.push(0);
  }
  const start = addDays(thisMonday, -7 * (weeks - 1));
  for (const t of trades) {
    const pnl = tradePnl(t);
    if (pnl == null) continue;
    const wk = mondayOf(t.closeDate || t.openDate);
    if (wk < start) continue;
    const idx = Math.round((new Date(wk) - new Date(start)) / (7 * 864e5));
    if (idx >= 0 && idx < weeks) values[idx] += pnl;
  }
  return { labels, values };
}

function renderWeeklyChart() {
  const canvas = $('jr-weekly');
  const closed = trades.filter((t) => tradePnl(t) != null);
  if (!closed.length) return emptyChart(canvas, 'No closed trades yet — weekly P&L will chart here against the target line.');

  const { labels, values } = weeklyBuckets(26);
  const target = Number.isFinite(num('rc-target')) ? num('rc-target') : 2000;
  const { ctx, W, H } = ctx2d(canvas);
  const C = colors();
  const padL = 58, padR = 10, padT = 12, padB = 24;
  const iw = W - padL - padR, ih = H - padT - padB;

  let lo = Math.min(0, ...values), hi = Math.max(target * 1.1, ...values, 1);
  const Y = (v) => padT + ih - ((v - lo) / (hi - lo)) * ih;

  ctx.textAlign = 'right'; ctx.fillStyle = C.dim;
  for (let i = 0; i <= 3; i++) {
    const val = lo + ((hi - lo) * i) / 3;
    ctx.strokeStyle = C.grid;
    ctx.beginPath(); ctx.moveTo(padL, Y(val)); ctx.lineTo(W - padR, Y(val)); ctx.stroke();
    ctx.fillText(money0(val), padL - 8, Y(val) + 4);
  }

  const bw = iw / values.length;
  values.forEach((v, i) => {
    if (v === 0) return;
    const x = padL + i * bw;
    ctx.fillStyle = hexA(v >= 0 ? C.accent : C.red, 0.85);
    const y0 = Y(Math.max(0, v)), y1 = Y(Math.min(0, v));
    ctx.fillRect(x + 1, y0, bw - 2, Math.max(2, y1 - y0));
  });

  // zero + target lines
  ctx.strokeStyle = C.dim; ctx.beginPath(); ctx.moveTo(padL, Y(0)); ctx.lineTo(W - padR, Y(0)); ctx.stroke();
  ctx.strokeStyle = C.amber; ctx.setLineDash([5, 4]);
  ctx.beginPath(); ctx.moveTo(padL, Y(target)); ctx.lineTo(W - padR, Y(target)); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = C.amber; ctx.textAlign = 'left';
  ctx.fillText('target ' + money0(target), padL + 4, Y(target) - 5);

  ctx.fillStyle = C.dim; ctx.textAlign = 'center';
  for (let i = 0; i < labels.length; i += 4) ctx.fillText(labels[i], padL + i * bw + bw / 2, H - 8);
}

function renderEquityChart() {
  const canvas = $('jr-equity');
  const closed = trades.filter((t) => tradePnl(t) != null)
    .sort((a, b) => (a.closeDate || a.openDate).localeCompare(b.closeDate || b.openDate));
  if (closed.length < 2) return emptyChart(canvas, 'Close at least two trades to draw the equity curve.');

  const pts = [0];
  closed.forEach((t) => pts.push(pts[pts.length - 1] + tradePnl(t)));

  const { ctx, W, H } = ctx2d(canvas);
  const C = colors();
  const padL = 58, padR = 10, padT = 12, padB = 20;
  const iw = W - padL - padR, ih = H - padT - padB;
  const lo = Math.min(0, ...pts), hi = Math.max(1, ...pts);
  const X = (i) => padL + (i / (pts.length - 1)) * iw;
  const Y = (v) => padT + ih - ((v - lo) / (hi - lo)) * ih;

  ctx.textAlign = 'right'; ctx.fillStyle = C.dim;
  for (let i = 0; i <= 3; i++) {
    const val = lo + ((hi - lo) * i) / 3;
    ctx.strokeStyle = C.grid;
    ctx.beginPath(); ctx.moveTo(padL, Y(val)); ctx.lineTo(W - padR, Y(val)); ctx.stroke();
    ctx.fillText(money0(val), padL - 8, Y(val) + 4);
  }
  ctx.strokeStyle = C.dim; ctx.beginPath(); ctx.moveTo(padL, Y(0)); ctx.lineTo(W - padR, Y(0)); ctx.stroke();

  ctx.strokeStyle = C.accent; ctx.lineWidth = 2.2;
  ctx.beginPath();
  pts.forEach((v, i) => (i === 0 ? ctx.moveTo(X(i), Y(v)) : ctx.lineTo(X(i), Y(v))));
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.fillStyle = C.dim; ctx.textAlign = 'left';
  ctx.fillText(`${closed.length} closed trades`, padL + 6, padT + 12);
}

// ---- CSV export / import
const CSV_HEADER = ['openDate', 'symbol', 'market', 'dir', 'shares', 'entry', 'stop', 'exit', 'closeDate', 'fees', 'setup', 'notes'];
function csvEscape(v) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
$('jr-export').addEventListener('click', () => {
  const lines = [CSV_HEADER.join(',')];
  for (const t of trades) lines.push(CSV_HEADER.map((k) => csvEscape(t[k])).join(','));
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `trade-journal-${todayStr()}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  $('jr-io-status').textContent = `Exported ${trades.length} trades.`;
});

function parseCSV(text) {
  const rows = []; let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.length > 1 || (r[0] && r[0].trim() !== ''));
}

$('jr-import-btn').addEventListener('click', () => $('jr-import-file').click());
$('jr-import-file').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const rows = parseCSV(String(reader.result));
    let added = 0;
    for (const r of rows) {
      if (r[0] === 'openDate') continue; // header
      const t = {
        id: Date.now() + '-' + Math.floor(Math.random() * 1e6) + '-' + added,
        openDate: r[0], symbol: (r[1] || '').toUpperCase(), market: r[2] || 'TSX',
        dir: r[3] === 'short' ? 'short' : 'long',
        shares: parseInt(r[4], 10), entry: parseFloat(r[5]), stop: parseFloat(r[6]),
        exit: r[7] === '' || r[7] == null ? null : parseFloat(r[7]),
        closeDate: r[8] || null, fees: parseFloat(r[9]) || 0,
        setup: r[10] || 'Other', notes: r[11] || '',
      };
      if (t.openDate && t.symbol && t.shares > 0 && t.entry > 0 && t.stop > 0) { trades.push(t); added++; }
    }
    saveTrades();
    renderJournal();
    $('jr-io-status').textContent = `Imported ${added} trades.`;
    e.target.value = '';
  };
  reader.readAsText(file);
});

$('jr-clear').addEventListener('click', () => {
  if (!trades.length) return;
  if (!confirm(`Delete all ${trades.length} logged trades? Export a CSV first if you want a backup.`)) return;
  trades = [];
  saveTrades();
  renderJournal();
  $('jr-io-status').textContent = 'Journal cleared.';
});

// ================================================================ init
$('jr-date').value = todayStr();
updateRealityClosedForm();
runMonteCarlo();
updateSizer();
updateCheckScore();
renderJournal();
