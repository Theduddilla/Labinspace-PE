// ── shared.js ── AI client, CDN engine, utilities ────────────────────────────

// ── Toast ────────────────────────────────────────────────────────────────────
function toast(msg, type = 'info', duration = 3500) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => el.remove(), duration);
}

// ── Settings ──────────────────────────────────────────────────────────────────
const DEFAULTS = {
  llm_provider: 'groq',
  groq_api_key: '', openai_api_key: '', claude_api_key: '',
  ollama_url: 'http://localhost:11434', ollama_model: 'llama3:8b',
  groq_model: 'llama3-8b-8192', openai_model: 'gpt-4o-mini',
  claude_model: 'claude-haiku-3-5-20241022',
  alert_threshold_ms: 500,
  default_iterations: 10,
  default_timeout: 30,
  sla_p95_ms: 400,        // NEW: SLA target
  sla_availability: 99.9, // NEW: SLA target
};

function getSettings() {
  try { const s = localStorage.getItem('omnitest_settings'); return s ? { ...DEFAULTS, ...JSON.parse(s) } : { ...DEFAULTS }; }
  catch { return { ...DEFAULTS }; }
}
function saveSettings(patch) {
  localStorage.setItem('omnitest_settings', JSON.stringify({ ...getSettings(), ...patch }));
}

// ── LLM Client ────────────────────────────────────────────────────────────────
class LLMClient {
  get cfg() { return getSettings(); }
  async chat(messages, { onToken, signal } = {}) {
    const p = this.cfg.llm_provider;
    if (p === 'groq')   return this._groq(messages, { onToken, signal });
    if (p === 'openai') return this._openai(messages, { onToken, signal });
    if (p === 'ollama') return this._ollama(messages, { onToken, signal });
    if (p === 'claude') return this._claude(messages, { onToken, signal });
    return this._groq(messages, { onToken, signal });
  }
  async _groq(messages, { onToken, signal } = {}) {
    const cfg = this.cfg;
    if (!cfg.groq_api_key) throw new Error('Groq API key not set. Add it in Settings.');
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', signal,
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.groq_api_key}` },
      body: JSON.stringify({ model: cfg.groq_model || 'llama3-8b-8192', messages, stream: !!onToken, temperature: 0.3, max_tokens: 1400 }),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error?.message || `Groq ${res.status}`); }
    if (onToken) return this._readStream(res, onToken);
    const d = await res.json(); return d.choices[0].message.content;
  }
  async _openai(messages, { onToken, signal } = {}) {
    const cfg = this.cfg;
    if (!cfg.openai_api_key) throw new Error('OpenAI API key not set.');
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', signal,
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.openai_api_key}` },
      body: JSON.stringify({ model: cfg.openai_model || 'gpt-4o-mini', messages, stream: !!onToken, temperature: 0.3, max_tokens: 1400 }),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error?.message || `OpenAI ${res.status}`); }
    if (onToken) return this._readStream(res, onToken);
    const d = await res.json(); return d.choices[0].message.content;
  }
  async _ollama(messages, { onToken, signal } = {}) {
    const cfg = this.cfg;
    const res = await fetch(`${cfg.ollama_url}/api/chat`, {
      method: 'POST', signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: cfg.ollama_model, messages, stream: !!onToken }),
    });
    if (!res.ok) throw new Error(`Ollama ${res.status}`);
    if (onToken) {
      const reader = res.body.getReader(); const dec = new TextDecoder(); let full = '';
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        for (const line of dec.decode(value).split('\n').filter(Boolean)) {
          try { const j = JSON.parse(line); const tok = j.message?.content || ''; full += tok; onToken(tok); } catch {}
        }
      }
      return full;
    }
    const d = await res.json(); return d.message?.content || d.response || '';
  }
  async _claude(messages, { onToken, signal } = {}) {
    const cfg = this.cfg;
    if (!cfg.claude_api_key) throw new Error('Claude API key not set.');
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal,
      headers: { 'Content-Type': 'application/json', 'x-api-key': cfg.claude_api_key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model: cfg.claude_model || 'claude-haiku-3-5-20241022', max_tokens: 1400, messages }),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error?.message || `Claude ${res.status}`); }
    const d = await res.json(); return d.content[0].text;
  }
  async _readStream(res, onToken) {
    const reader = res.body.getReader(); const dec = new TextDecoder(); let full = '';
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      for (const line of dec.decode(value).split('\n')) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim(); if (data === '[DONE]') continue;
        try { const j = JSON.parse(data); const tok = j.choices?.[0]?.delta?.content || ''; if (tok) { full += tok; onToken(tok); } } catch {}
      }
    }
    return full;
  }
  async testConnection() {
    try {
      if (this.cfg.llm_provider === 'ollama') {
        const r = await fetch(`${this.cfg.ollama_url}/api/tags`, { signal: AbortSignal.timeout(4000) });
        if (r.ok) { const d = await r.json(); return { ok: true, models: (d.models||[]).map(m=>m.name) }; }
        return { ok: false, error: `HTTP ${r.status}` };
      }
      const result = await this.chat([{ role: 'user', content: 'Reply with only: OK' }]);
      return { ok: true, echo: result.slice(0, 40) };
    } catch (e) { return { ok: false, error: e.message }; }
  }
}

// ── Region metadata ───────────────────────────────────────────────────────────
const REGION_META = {
  usa:       { label: '🇺🇸 USA',       base: 62,  city: 'Newark',    edgeIPs: ['23.44.231.10','23.56.78.1'] },
  india:     { label: '🇮🇳 India',     base: 340, city: 'Mumbai',    edgeIPs: ['2.16.188.10','23.76.5.1'] },
  uk:        { label: '🇬🇧 UK',        base: 88,  city: 'London',    edgeIPs: ['2.23.144.10','23.77.100.1'] },
  australia: { label: '🇦🇺 Australia', base: 295, city: 'Sydney',    edgeIPs: ['23.45.32.10','2.16.90.1'] },
  japan:     { label: '🇯🇵 Japan',     base: 108, city: 'Tokyo',     edgeIPs: ['2.22.176.10','23.78.80.1'] },
  singapore: { label: '🇸🇬 Singapore', base: 132, city: 'Singapore', edgeIPs: ['2.21.85.10','23.74.60.1'] },
  germany:   { label: '🇩🇪 Germany',   base: 76,  city: 'Frankfurt', edgeIPs: ['2.23.96.10','23.222.100.1'] },
  brazil:    { label: '🇧🇷 Brazil',    base: 220, city: 'São Paulo', edgeIPs: ['2.16.50.10','23.75.40.1'] },
  canada:    { label: '🇨🇦 Canada',    base: 70,  city: 'Toronto',   edgeIPs: ['23.48.20.10','2.20.32.1'] },
};

function jitter(base, pct = 0.2) { return Math.round(base * (1 + (Math.random() - 0.5) * pct)); }
function rand(min, max) { return +(min + Math.random() * (max - min)).toFixed(2); }

// ─────────────────────────────────────────────────────────────────────────────
//  PDCA FEATURE SET
//  Category 1: Regional Edge Performance
//  Category 2: Cross-Region Cache
//  Category 3: Load & Failover
//  Category 4: Consistency
//  Category 5: Observability / SLA
// ─────────────────────────────────────────────────────────────────────────────

// ── Cat 1: Regional Edge Performance ─────────────────────────────────────────
function measureEdgePerformance(region, base) {
  // SSL/TLS handshake breakdown: DNS + TCP + TLS + TTFB
  const dns_ms     = jitter(12, 0.4);
  const tcp_ms     = jitter(base * 0.15, 0.3);
  const tls_ms     = jitter(base * 0.25, 0.35); // SSL latency (NEW)
  const ttfb_ms    = jitter(base * 0.55, 0.2);
  const total_ms   = dns_ms + tcp_ms + tls_ms + ttfb_ms;

  // Edge IP affinity — does the client consistently hit the same edge IP?
  const meta = REGION_META[region] || {};
  const edgeIPs = meta.edgeIPs || ['unknown'];
  // Simulate affinity: high affinity = same IP 90%+ of requests
  const affinityScore = rand(72, 98); // percent affinity
  const assignedEdgeIP = edgeIPs[Math.random() > 0.1 ? 0 : 1]; // mostly consistent

  return { dns_ms, tcp_ms, tls_ms, ttfb_ms, total_ms, affinityScore, assignedEdgeIP };
}

// ── Cat 2: Cross-Region Cache ─────────────────────────────────────────────────
function measureCacheHealth(region, base) {
  // Cache warming: cold vs warm latency difference
  const cold_latency_ms  = jitter(base * 1.8, 0.3); // cache MISS = origin pull
  const warm_latency_ms  = jitter(base * 0.35, 0.2); // cache HIT = edge serve
  const origin_pull_ms   = jitter(base * 1.5, 0.4); // origin pull latency (NEW)

  // Origin shielding reduces origin pull frequency
  const shield_enabled   = Math.random() > 0.3; // simulated per-region
  const shield_reduction = shield_enabled ? rand(30, 55) : 0; // % origin load reduction

  // Geo-blocking: some regions may be geo-restricted
  const geoBlockStatus   = region === 'india' && Math.random() > 0.7 ? 'BLOCKED' : 'ALLOWED';

  const cache_hit_ratio  = rand(65, 95);
  const cache_miss_ratio = +(100 - cache_hit_ratio).toFixed(2);

  return {
    cold_latency_ms, warm_latency_ms, origin_pull_ms,
    shield_enabled, shield_reduction,
    geoBlockStatus, cache_hit_ratio, cache_miss_ratio,
  };
}

// ── Cat 3: Load & Failover ─────────────────────────────────────────────────────
function measureFailover(region, base) {
  // Regional overload isolation — does this region show signs of overload?
  const concurrency = Math.floor(rand(50, 500));
  const overloaded   = concurrency > 400;
  const overloadIsolated = overloaded ? Math.random() > 0.3 : true; // can it shed load?

  // Edge failover — if primary edge fails, secondary picks up
  const primaryEdgeHealth = rand(95, 100);
  const edgeFailoverTime_ms = jitter(280, 0.4); // time to detect + switch

  // Origin failover — origin health + failover behaviour
  const originHealth = rand(92, 100);
  const originFailoverTime_ms = jitter(420, 0.5);

  // Stale-while-revalidate: is the CDN serving stale content while refreshing?
  const swrEnabled = Math.random() > 0.4;
  const swrStalePeriod_s = swrEnabled ? Math.floor(rand(5, 60)) : 0;
  const swrLatencyBenefit_ms = swrEnabled ? jitter(base * 0.3, 0.2) : 0; // latency saved

  return {
    concurrency, overloaded, overloadIsolated,
    primaryEdgeHealth, edgeFailoverTime_ms,
    originHealth, originFailoverTime_ms,
    swrEnabled, swrStalePeriod_s, swrLatencyBenefit_ms,
  };
}

// ── Cat 4: Consistency ─────────────────────────────────────────────────────────
function measureConsistency(region, base) {
  // Cache propagation delay — how long after a purge does the new content appear?
  const propagationDelay_ms = jitter(base * 2.5, 0.5); // NEW
  const propagationComplete  = propagationDelay_ms < 1500; // under 1.5s = healthy

  // Cache key consistency — are Vary headers or query params creating key fragmentation?
  const cacheKeyVariants = Math.floor(rand(1, 12)); // # of cache key variants observed
  const keyFragmented    = cacheKeyVariants > 5;    // too many = fragmented cache

  // Request coalescing — are simultaneous cache misses collapsing to one origin request?
  const coalescingEnabled    = Math.random() > 0.3;
  const coalescedRequests    = coalescingEnabled ? Math.floor(rand(10, 80)) : 0; // reqs saved per 100 misses
  const stampedePrevented    = coalescingEnabled && coalescedRequests > 20;

  return {
    propagationDelay_ms, propagationComplete,
    cacheKeyVariants, keyFragmented,
    coalescingEnabled, coalescedRequests, stampedePrevented,
  };
}

// ── Cat 5: Observability / SLA ────────────────────────────────────────────────
function measureSLA(region, base, p95) {
  const cfg = getSettings();
  const slaTarget_ms      = cfg.sla_p95_ms || 400;
  const availTarget       = cfg.sla_availability || 99.9;

  const availability      = rand(99.0, 100.0);
  const slaBreached       = p95 > slaTarget_ms || availability < availTarget;
  const slaMargin_ms      = slaTarget_ms - p95; // positive = within SLA

  // RUM geo-slicing: synthetic RUM-like percentile breakdown
  const rum = {
    p50: jitter(base * 0.5, 0.15),
    p75: jitter(base * 0.75, 0.15),
    p95: p95,
    p99: jitter(base * 1.6, 0.2),
  };

  // Alerting sensitivity: would this trigger a P1/P2/P3 alert?
  let alertLevel = null;
  if (p95 > slaTarget_ms * 1.5 || availability < 99.0) alertLevel = 'P1';
  else if (p95 > slaTarget_ms * 1.2 || availability < 99.5) alertLevel = 'P2';
  else if (p95 > slaTarget_ms || availability < availTarget) alertLevel = 'P3';

  return { availability, slaBreached, slaMargin_ms, slaTarget_ms, rum, alertLevel };
}

// ── Master test runner — all 5 categories ────────────────────────────────────
async function runCDNTest(target, regions, iterations = 10) {
  const out = {};
  for (const r of regions) {
    const meta = REGION_META[r] || { base: 150 };
    const base = meta.base;

    // Base latency samples
    const samples = Array.from({ length: iterations }, () => jitter(base));
    samples.sort((a, b) => a - b);
    const p50 = samples[Math.floor(samples.length * 0.5)];
    const p95 = samples[Math.floor(samples.length * 0.95)];
    const p99 = samples[samples.length - 1];

    out[r] = {
      // Core
      p50, p95, p99, latency_ms: p95,
      success_rate: rand(99.0, 100.0),
      bandwidth_mbps: rand(50, 250),
      // Cat 1: Regional Edge Performance
      edge: measureEdgePerformance(r, base),
      // Cat 2: Cross-Region Cache
      cache: measureCacheHealth(r, base),
      // Cat 3: Load & Failover
      failover: measureFailover(r, base),
      // Cat 4: Consistency
      consistency: measureConsistency(r, base),
      // Cat 5: Observability / SLA
      sla: measureSLA(r, base, p95),
      // Flat aliases for backwards-compat
      cache_hit_ratio: 0, // filled below
      ttfb_ms: 0,
      timestamp: new Date().toISOString(),
    };
    out[r].cache_hit_ratio = out[r].cache.cache_hit_ratio;
    out[r].ttfb_ms = out[r].edge.ttfb_ms;
  }
  return out;
}

// ── Traceroute ────────────────────────────────────────────────────────────────
async function traceRoute(destination, sourceRegion) {
  const meta = REGION_META[sourceRegion] || { base: 150, city: 'Local' };
  let lat = 2;
  const hops = [
    { hop:1, ip:'192.168.1.1',  hostname:'gateway.local',                       latency_ms: lat,                                   loss_percent:0, type:'gateway' },
    { hop:2, ip:'10.0.0.1',     hostname:'isp-upstream.net',                    latency_ms: (lat += jitter(8,  0.3)),               loss_percent:0, type:'isp' },
    { hop:3, ip:'203.0.113.1',  hostname:`pop-${sourceRegion}.cdn.net`,         latency_ms: (lat += jitter(20, 0.4)),               loss_percent:0, type:'cdn-pop' },
    { hop:4, ip:'198.51.100.1', hostname:'edge-cache.cdn.net',                  latency_ms: (lat += jitter(12, 0.3)),               loss_percent:0, type:'cdn-edge' },
    { hop:5, ip:'192.0.2.1',    hostname:'origin-shield.cdn.net',               latency_ms: (lat += jitter(meta.base*0.4, 0.5)),    loss_percent:0, type:'shield' },
    { hop:6, ip:'10.1.2.3',     hostname:`origin-lb.${destination}`,            latency_ms: (lat += jitter(meta.base*0.3, 0.4)),    loss_percent:0, type:'origin-lb' },
    { hop:7, ip:destination,    hostname:destination,                            latency_ms: (lat += jitter(15, 0.3)),               loss_percent:0, type:'origin' },
  ];
  return { source: sourceRegion, sourceCity: meta.city, destination, hops };
}

// ── Historical data store (localStorage) ─────────────────────────────────────
const HISTORY_KEY = 'omnitest_history';
function saveTestHistory(target, results) {
  try {
    const history = getTestHistory();
    history.unshift({ target, results, ts: Date.now() });
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 20)));
  } catch {}
}
function getTestHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; }
}
window.saveTestHistory = saveTestHistory;
window.getTestHistory  = getTestHistory;

// ── Sidebar status ────────────────────────────────────────────────────────────
async function updateSidebarStatus() {
  const el = document.getElementById('sidebar-llm-status');
  if (!el) return;
  const cfg = getSettings();
  const hasKey = cfg.llm_provider === 'ollama' ? true : cfg[`${cfg.llm_provider}_api_key`];
  el.textContent = hasKey ? `${providerLabel(cfg.llm_provider)} · Ready` : `${providerLabel(cfg.llm_provider)} · No key`;
  el.style.color = hasKey ? 'var(--green)' : 'var(--yellow)';
}

function providerLabel(p) { return { groq:'Groq', openai:'OpenAI', ollama:'Ollama', claude:'Claude' }[p] || p; }
function gradeLatency(ms) { if (ms<100) return 'A+'; if (ms<200) return 'A'; if (ms<350) return 'B'; if (ms<500) return 'C'; return 'D'; }
function latencyColor(ms) { if (ms<100) return 'var(--green)'; if (ms<300) return 'var(--yellow)'; return 'var(--red)'; }

// Global exports
window.llm = new LLMClient();
window.getSettings = getSettings;
window.saveSettings = saveSettings;
window.toast = toast;
window.runCDNTest = runCDNTest;
window.traceRoute = traceRoute;
window.REGION_META = REGION_META;
window.gradeLatency = gradeLatency;
window.latencyColor = latencyColor;
window.updateSidebarStatus = updateSidebarStatus;
window.providerLabel = providerLabel;
