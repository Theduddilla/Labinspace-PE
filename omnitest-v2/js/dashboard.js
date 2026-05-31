// dashboard.js — PDCA full feature dashboard
document.addEventListener('DOMContentLoaded', () => {

  // ── Region pills ──────────────────────────────────────────────────────────
  let selectedRegions = new Set(['usa', 'india', 'uk', 'germany']);
  document.querySelectorAll('.region-pill').forEach(pill => {
    if (selectedRegions.has(pill.dataset.region)) pill.classList.add('selected');
    pill.addEventListener('click', () => {
      const r = pill.dataset.region;
      if (selectedRegions.has(r)) { selectedRegions.delete(r); pill.classList.remove('selected'); }
      else { selectedRegions.add(r); pill.classList.add('selected'); }
    });
  });

  // ── Tab switching ─────────────────────────────────────────────────────────
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.style.display = 'none');
      tab.classList.add('active');
      const pane = document.getElementById(`pane-${tab.dataset.tab}`);
      if (pane) pane.style.display = 'block';
    });
  });

  // ── Run test ──────────────────────────────────────────────────────────────
  let lastResults = null;
  const runBtn = document.getElementById('run-test');
  const hostInput = document.getElementById('target-host');

  runBtn.addEventListener('click', async () => {
    const target = hostInput.value.trim();
    if (!target) { toast('Enter a target hostname', 'error'); return; }
    if (selectedRegions.size === 0) { toast('Select at least one region', 'error'); return; }

    runBtn.disabled = true;
    runBtn.innerHTML = '<span class="spinner"></span> Testing…';

    // Skeleton loading on stat cards
    ['stat-latency','stat-cache','stat-sla','stat-ssl','stat-shield','stat-alerts'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.className = 'stat-value skeleton'; el.textContent = ''; }
    });

    try {
      const regions = [...selectedRegions];
      const results = await runCDNTest(target, regions, 10);
      lastResults = results;
      saveTestHistory(target, results);

      renderTopStats(results);
      renderEdgeTable(results);
      renderCacheTable(results);
      renderFailoverTable(results);
      renderConsistencyTable(results);
      renderSLATable(results);

      document.getElementById('results-panel').style.display = 'block';
      await autoAnalyze(results, target);
    } catch (e) {
      toast(`Test failed: ${e.message}`, 'error');
    } finally {
      runBtn.disabled = false;
      runBtn.innerHTML = '▶ Run Test';
    }
  });

  // ── Top stat cards ────────────────────────────────────────────────────────
  function renderTopStats(results) {
    const vals = Object.values(results);
    const globalP95    = Math.round(vals.reduce((a,v)=>a+v.p95,0)/vals.length);
    const avgCache     = (vals.reduce((a,v)=>a+v.cache.cache_hit_ratio,0)/vals.length).toFixed(1);
    const slaBreaches  = vals.filter(v=>v.sla.slaBreached).length;
    const avgSSL       = Math.round(vals.reduce((a,v)=>a+v.edge.tls_ms,0)/vals.length);
    const shieldedCount= vals.filter(v=>v.cache.shield_enabled).length;
    const alerts       = vals.filter(v=>v.sla.alertLevel).map(v=>v.sla.alertLevel);
    const p1 = alerts.filter(a=>a==='P1').length;
    const p2 = alerts.filter(a=>a==='P2').length;
    const p3 = alerts.filter(a=>a==='P3').length;

    const set = (id, val, cls) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.className = `stat-value${cls ? ' '+cls : ''}`;
      el.textContent = val;
    };

    set('stat-latency', `${globalP95}ms`, globalP95 < 200 ? 'good' : globalP95 < 400 ? 'warn' : 'bad');
    set('stat-cache',   `${avgCache}%`,   parseFloat(avgCache) > 80 ? 'good' : 'warn');
    set('stat-sla',     `${slaBreaches}`, slaBreaches === 0 ? 'good' : slaBreaches < 3 ? 'warn' : 'bad');
    set('stat-ssl',     `${avgSSL}ms`,    avgSSL < 80 ? 'good' : avgSSL < 150 ? 'warn' : 'bad');
    set('stat-shield',  `${shieldedCount}/${vals.length}`, shieldedCount === vals.length ? 'good' : 'warn');
    set('stat-alerts',  p1 ? `${p1} P1` : p2 ? `${p2} P2` : p3 ? `${p3} P3` : '✓ None', p1 ? 'bad' : p2 ? 'warn' : 'good');
  }

  // ── Category 1: Edge Performance table ───────────────────────────────────
  function renderEdgeTable(results) {
    const tbody = document.getElementById('tbl-edge');
    tbody.innerHTML = '';
    Object.entries(results).sort((a,b)=>a[1].p95-b[1].p95).forEach(([region, data]) => {
      const meta = REGION_META[region] || { label: region };
      const e = data.edge;
      const grade = gradeLatency(data.p95);
      const color = latencyColor(data.p95);
      const affinityColor = e.affinityScore > 85 ? 'var(--green)' : e.affinityScore > 70 ? 'var(--yellow)' : 'var(--red)';
      const sslColor = e.tls_ms < 80 ? 'var(--green)' : e.tls_ms < 150 ? 'var(--yellow)' : 'var(--red)';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="td-name">${meta.label}</td>
        <td style="color:${color};font-weight:600;font-family:var(--font-mono);">${data.p95}ms</td>
        <td style="font-family:var(--font-mono);color:var(--muted);">${e.dns_ms}ms</td>
        <td style="font-family:var(--font-mono);color:var(--muted);">${e.tcp_ms}ms</td>
        <td style="font-family:var(--font-mono);color:${sslColor};font-weight:600;">${e.tls_ms}ms</td>
        <td style="font-family:var(--font-mono);color:var(--muted);">${e.ttfb_ms}ms</td>
        <td style="font-family:var(--font-mono);font-size:11px;color:var(--muted);">${e.assignedEdgeIP}</td>
        <td style="color:${affinityColor};font-family:var(--font-mono);">${e.affinityScore.toFixed(1)}%</td>
        <td><span class="badge badge-${grade.replace('+','plus')}">${grade}</span></td>
      `;
      tbody.appendChild(tr);
    });
  }

  // ── Category 2: Cache & Origin table ─────────────────────────────────────
  function renderCacheTable(results) {
    const tbody = document.getElementById('tbl-cache');
    tbody.innerHTML = '';
    Object.entries(results).forEach(([region, data]) => {
      const meta = REGION_META[region] || { label: region };
      const c = data.cache;
      const hitColor = c.cache_hit_ratio > 85 ? 'var(--green)' : c.cache_hit_ratio > 70 ? 'var(--yellow)' : 'var(--red)';
      const pullColor = c.origin_pull_ms > 500 ? 'var(--red)' : c.origin_pull_ms > 200 ? 'var(--yellow)' : 'var(--green)';
      const geoColor  = c.geoBlockStatus === 'BLOCKED' ? 'var(--red)' : 'var(--green)';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="td-name">${meta.label}</td>
        <td style="color:${hitColor};font-weight:600;font-family:var(--font-mono);">${c.cache_hit_ratio.toFixed(1)}%</td>
        <td style="font-family:var(--font-mono);color:var(--green);">${c.warm_latency_ms}ms</td>
        <td style="font-family:var(--font-mono);color:var(--red);">${c.cold_latency_ms}ms</td>
        <td style="font-family:var(--font-mono);color:${pullColor};">${c.origin_pull_ms}ms</td>
        <td>${c.shield_enabled
          ? '<span class="badge badge-A">Enabled</span>'
          : '<span class="badge badge-D">Disabled</span>'}</td>
        <td style="font-family:var(--font-mono);color:${c.shield_enabled ? 'var(--green)' : 'var(--muted)'};">${c.shield_enabled ? c.shield_reduction.toFixed(1)+'%' : '—'}</td>
        <td style="color:${geoColor};font-weight:600;font-family:var(--font-mono);">${c.geoBlockStatus}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  // ── Category 3: Load & Failover table ────────────────────────────────────
  function renderFailoverTable(results) {
    const tbody = document.getElementById('tbl-failover');
    tbody.innerHTML = '';
    Object.entries(results).forEach(([region, data]) => {
      const meta = REGION_META[region] || { label: region };
      const f = data.failover;
      const overloadColor = f.overloaded ? 'var(--red)' : 'var(--green)';
      const edgeColor  = f.primaryEdgeHealth > 98 ? 'var(--green)' : 'var(--yellow)';
      const origColor  = f.originHealth > 97 ? 'var(--green)' : f.originHealth > 92 ? 'var(--yellow)' : 'var(--red)';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="td-name">${meta.label}</td>
        <td style="font-family:var(--font-mono);">${f.concurrency}</td>
        <td style="color:${overloadColor};font-weight:600;">${f.overloaded ? '⚠ YES' : '✓ No'}</td>
        <td>${f.overloadIsolated
          ? '<span class="badge badge-A">Isolated</span>'
          : '<span class="badge badge-D">Not isolated</span>'}</td>
        <td style="font-family:var(--font-mono);color:${edgeColor};">${f.primaryEdgeHealth.toFixed(1)}%</td>
        <td style="font-family:var(--font-mono);color:var(--muted);">${f.edgeFailoverTime_ms}ms</td>
        <td style="font-family:var(--font-mono);color:${origColor};">${f.originHealth.toFixed(1)}%</td>
        <td style="font-family:var(--font-mono);color:var(--muted);">${f.originFailoverTime_ms}ms</td>
        <td>${f.swrEnabled
          ? `<span class="badge badge-A">SWR ${f.swrStalePeriod_s}s</span>`
          : '<span class="badge badge-C">Off</span>'}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  // ── Category 4: Consistency table ────────────────────────────────────────
  function renderConsistencyTable(results) {
    const tbody = document.getElementById('tbl-consistency');
    tbody.innerHTML = '';
    Object.entries(results).forEach(([region, data]) => {
      const meta = REGION_META[region] || { label: region };
      const con = data.consistency;
      const propColor = con.propagationComplete ? 'var(--green)' : 'var(--red)';
      const fragColor = con.keyFragmented ? 'var(--red)' : 'var(--green)';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="td-name">${meta.label}</td>
        <td style="font-family:var(--font-mono);color:${propColor};font-weight:600;">${con.propagationDelay_ms}ms</td>
        <td>${con.propagationComplete
          ? '<span class="badge badge-A">✓ Fast</span>'
          : '<span class="badge badge-D">⚠ Slow</span>'}</td>
        <td style="font-family:var(--font-mono);color:${fragColor};">${con.cacheKeyVariants}</td>
        <td style="color:${fragColor};">${con.keyFragmented ? '⚠ Yes' : '✓ No'}</td>
        <td>${con.coalescingEnabled
          ? '<span class="badge badge-A">Enabled</span>'
          : '<span class="badge badge-D">Disabled</span>'}</td>
        <td style="font-family:var(--font-mono);color:${con.coalescingEnabled ? 'var(--green)' : 'var(--muted)'};">${con.coalescedRequests}</td>
        <td style="color:${con.stampedePrevented ? 'var(--green)' : 'var(--muted)'};">${con.stampedePrevented ? '✓ Protected' : '—'}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  // ── Category 5: SLA & Observability table ────────────────────────────────
  function renderSLATable(results) {
    const tbody = document.getElementById('tbl-sla');
    tbody.innerHTML = '';
    Object.entries(results).forEach(([region, data]) => {
      const meta = REGION_META[region] || { label: region };
      const s = data.sla;
      const availColor = s.availability > 99.9 ? 'var(--green)' : s.availability > 99.5 ? 'var(--yellow)' : 'var(--red)';
      const marginColor = s.slaMargin_ms > 50 ? 'var(--green)' : s.slaMargin_ms > 0 ? 'var(--yellow)' : 'var(--red)';
      const alertColors = { P1:'var(--red)', P2:'var(--yellow)', P3:'var(--accent3)' };
      const alertBadges = { P1:'badge-D', P2:'badge-B', P3:'badge-B' };
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="td-name">${meta.label}</td>
        <td style="font-family:var(--font-mono);color:${availColor};font-weight:600;">${s.availability.toFixed(2)}%</td>
        <td style="font-family:var(--font-mono);color:var(--muted);">${s.slaTarget_ms}ms</td>
        <td style="font-family:var(--font-mono);color:${marginColor};">${data.p95}ms <small style="color:var(--muted);">(${s.slaMargin_ms > 0 ? '+' : ''}${s.slaMargin_ms.toFixed(0)} margin)</small></td>
        <td>${s.slaBreached
          ? '<span class="badge badge-D">⚠ BREACHED</span>'
          : '<span class="badge badge-A">✓ Met</span>'}</td>
        <td>${s.alertLevel
          ? `<span class="badge ${alertBadges[s.alertLevel]}" style="color:${alertColors[s.alertLevel]};">${s.alertLevel}</span>`
          : '<span style="color:var(--muted);font-size:12px;">—</span>'}</td>
        <td style="font-family:var(--font-mono);color:var(--muted);">${s.rum.p50}ms</td>
        <td style="font-family:var(--font-mono);color:var(--muted);">${s.rum.p75}ms</td>
        <td style="font-family:var(--font-mono);color:var(--muted);">${s.rum.p99}ms</td>
      `;
      tbody.appendChild(tr);
    });
  }

  // ── AI Chat ───────────────────────────────────────────────────────────────
  const messages = [];
  const SYSTEM = `You are OmniTest AI, an expert CDN performance analyst trained on Akamai, Fastly, and Cloudflare internals.
You have access to a full CDN test result with 5 categories:
1. Regional Edge Performance (TTFB, SSL/TLS latency, Edge IP affinity)
2. Cross-Region Cache (cache hit%, origin pull latency, origin shield, geo-blocking)
3. Load & Failover (overload isolation, edge failover, origin failover, stale-while-revalidate)
4. Consistency (cache propagation delay, cache key fragmentation, request coalescing)
5. Observability / SLA (availability, SLA breach, RUM percentiles, alert levels)

Rules: Be concise. Use bullet points. Bold key metrics. Highlight P1 alerts first.
When recommending fixes, be specific (e.g. "Add 'Vary: Accept-Encoding' cleanup rule", "Enable SWR with max-stale=60").
Max 300 words per response.`;

  async function autoAnalyze(results, target) {
    const prompt = buildFullPrompt(results, target);
    await sendAIMessage(prompt, true);
  }

  function buildFullPrompt(results, target) {
    const lines = Object.entries(results).map(([r, d]) => {
      const e = d.edge, c = d.cache, f = d.failover, con = d.consistency, s = d.sla;
      return [
        `\n[${(REGION_META[r]||{label:r}).label}]`,
        `  Edge: P95=${d.p95}ms, DNS=${e.dns_ms}ms, TCP=${e.tcp_ms}ms, SSL=${e.tls_ms}ms, TTFB=${e.ttfb_ms}ms, Affinity=${e.affinityScore.toFixed(1)}%`,
        `  Cache: Hit=${c.cache_hit_ratio.toFixed(1)}%, Cold=${c.cold_latency_ms}ms, OriginPull=${c.origin_pull_ms}ms, Shield=${c.shield_enabled?'ON('+c.shield_reduction.toFixed(0)+'% reduction)':'OFF'}, GeoBlock=${c.geoBlockStatus}`,
        `  Failover: Concurrency=${f.concurrency}, Overloaded=${f.overloaded}, IsolationOK=${f.overloadIsolated}, EdgeHealth=${f.primaryEdgeHealth.toFixed(1)}%, OriginHealth=${f.originHealth.toFixed(1)}%, SWR=${f.swrEnabled?'ON('+f.swrStalePeriod_s+'s)':'OFF'}`,
        `  Consistency: PropDelay=${con.propagationDelay_ms}ms, KeyVariants=${con.cacheKeyVariants}, Fragmented=${con.keyFragmented}, Coalescing=${con.coalescingEnabled}(saved ${con.coalescedRequests}/100)`,
        `  SLA: Avail=${s.availability.toFixed(2)}%, SLATarget=${s.slaTarget_ms}ms, Margin=${s.slaMargin_ms.toFixed(0)}ms, Breached=${s.slaBreached}, Alert=${s.alertLevel||'none'}, RUM p99=${s.rum.p99}ms`,
      ].join('\n');
    });
    return `Full CDN test for **${target}**:\n${lines.join('\n')}\n\nAnalyze all 5 categories. Prioritise issues by severity. Give top 5 actionable recommendations.`;
  }

  async function sendAIMessage(content, isAuto = false) {
    const aiMessages = document.getElementById('ai-messages');
    if (!aiMessages) return;
    messages.push({ role: 'user', content });
    if (!isAuto) aiMessages.appendChild(buildMsgEl('user', content));
    aiMessages.scrollTop = aiMessages.scrollHeight;

    const thinking = buildThinkingEl();
    aiMessages.appendChild(thinking);
    aiMessages.scrollTop = aiMessages.scrollHeight;

    try {
      const ctx = [{ role: 'user', content: SYSTEM + '\n\n---\n' + messages[0]?.content }, ...messages.slice(1)].slice(-8);
      let responseEl = null, full = '';

      const onToken = tok => {
        full += tok;
        if (!responseEl) {
          thinking.remove();
          const el = buildMsgEl('ai', '');
          aiMessages.appendChild(el);
          responseEl = el.querySelector('.msg-text');
        }
        responseEl.innerHTML = markdownLight(full);
        aiMessages.scrollTop = aiMessages.scrollHeight;
      };

      const result = await window.llm.chat(ctx, { onToken });
      if (!responseEl) { thinking.remove(); aiMessages.appendChild(buildMsgEl('ai', result)); }
      messages.push({ role: 'assistant', content: result || full });
    } catch (e) {
      thinking.remove();
      aiMessages.appendChild(buildMsgEl('ai', `⚠️ ${e.message}. Check Settings.`));
    }
    aiMessages.scrollTop = aiMessages.scrollHeight;
  }

  function buildMsgEl(role, content) {
    const div = document.createElement('div');
    div.className = 'ai-message';
    div.innerHTML = `<div class="msg-avatar ${role}">${role==='ai'?'✦':'◉'}</div>
      <div class="msg-content">
        <div class="msg-name">${role==='ai'?'OmniTest AI':'You'}</div>
        <div class="msg-text ${role}">${markdownLight(content)}</div>
      </div>`;
    return div;
  }
  function buildThinkingEl() {
    const div = document.createElement('div');
    div.className = 'ai-message';
    div.innerHTML = `<div class="msg-avatar ai">✦</div>
      <div class="msg-content">
        <div class="msg-name">OmniTest AI</div>
        <div class="ai-thinking"><span></span><span></span><span></span></div>
      </div>`;
    return div;
  }
  function markdownLight(t) {
    return t.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')
            .replace(/`([^`]+)`/g,'<code>$1</code>')
            .replace(/^[-*•]\s(.+)/gm,'<li>$1</li>')
            .replace(/(<li>.*<\/li>\n?)+/gs,m=>`<ul>${m}</ul>`)
            .replace(/\n\n/g,'</p><p>').replace(/\n/g,'<br>');
  }

  const doSend = () => {
    const val = document.getElementById('ai-input')?.value.trim();
    if (!val) return;
    document.getElementById('ai-input').value = '';
    sendAIMessage(val);
  };
  document.getElementById('ai-send')?.addEventListener('click', doSend);
  document.getElementById('ai-input')?.addEventListener('keydown', e => { if (e.key==='Enter'&&!e.shiftKey){e.preventDefault();doSend();} });

  document.querySelectorAll('.chip').forEach(chip =>
    chip.addEventListener('click', () => {
      if (!lastResults) { toast('Run a test first', 'info'); return; }
      sendAIMessage(chip.dataset.q);
    })
  );

  // Welcome message
  setTimeout(() => {
    const cfg = getSettings();
    const hasKey = cfg.llm_provider==='ollama' || cfg[`${cfg.llm_provider}_api_key`];
    const aiMessages = document.getElementById('ai-messages');
    if (aiMessages && !aiMessages.children.length) {
      aiMessages.appendChild(buildMsgEl('ai', hasKey
        ? 'Ready. This dashboard tests **5 categories**: Edge Performance · Cache & Origin · Load & Failover · Consistency · SLA & Observability. Run a test to get a full AI-powered analysis.'
        : '⚠️ No LLM key configured. Go to **Settings** → add your Groq API key (free at console.groq.com). Then run a test for AI-powered insights across all 5 categories.'));
    }
  }, 300);
});
