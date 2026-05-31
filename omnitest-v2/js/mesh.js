// mesh.js
document.addEventListener('DOMContentLoaded', () => {
  const traceBtn    = document.getElementById('trace-path');
  const meshBtn     = document.getElementById('trace-mesh');
  const destInput   = document.getElementById('dest-host');
  const regionSel   = document.getElementById('source-region');
  const hopTimeline = document.getElementById('hop-timeline');
  const bottleneckEl= document.getElementById('bottleneck-analysis');
  const aiSection   = document.getElementById('mesh-ai');

  const SYSTEM = `You are a network routing expert. Analyze traceroute hop data and identify:
1. Bottleneck hops (largest latency jumps)
2. Whether delays are CDN/edge, ISP, or origin issues
3. Concrete fixes (origin shield, routing optimization, anycast, etc.)
Be specific, concise, use bullet points. Max 200 words.`;

  traceBtn.addEventListener('click', async () => {
    const dest = destInput.value.trim();
    if (!dest) { toast('Enter a destination host', 'error'); return; }
    traceBtn.disabled = true;
    traceBtn.innerHTML = '<span class="spinner"></span> Tracing…';
    hopTimeline.innerHTML = '<div style="padding:30px;text-align:center;color:var(--muted);">Tracing route…</div>';
    bottleneckEl.innerHTML = '';
    try {
      const region = regionSel.value;
      const trace = await traceRoute(dest, region);
      renderHops(trace);
      renderBottleneck(trace);
      await analyzeTrace(trace);
    } catch (e) {
      hopTimeline.innerHTML = `<div style="padding:30px;text-align:center;color:var(--red);">❌ ${e.message}</div>`;
    } finally {
      traceBtn.disabled = false;
      traceBtn.innerHTML = '⬡ Trace Path';
    }
  });

  meshBtn.addEventListener('click', async () => {
    const dest = destInput.value.trim();
    if (!dest) { toast('Enter a destination host', 'error'); return; }
    meshBtn.disabled = true;
    meshBtn.innerHTML = '<span class="spinner"></span> Tracing all…';
    try {
      const regions = Object.keys(REGION_META);
      const all = await Promise.all(regions.map(r => traceRoute(dest, r)));
      renderMeshChart(all);
    } catch (e) {
      toast(`Mesh trace failed: ${e.message}`, 'error');
    } finally {
      meshBtn.disabled = false;
      meshBtn.innerHTML = '◎ Trace All Regions';
    }
  });

  function renderHops(trace) {
    hopTimeline.innerHTML = '';
    const { hops } = trace;
    hops.forEach((hop, i) => {
      const jump = i > 0 ? hop.latency_ms - hops[i-1].latency_ms : 0;
      const isBottleneck = jump > 40;
      const typeColor = {
        'cdn-pop': 'var(--accent)', 'cdn-edge': 'var(--accent2)',
        'origin-lb': 'var(--yellow)', 'origin': 'var(--green)',
        'shield': 'var(--accent3)', 'gateway': 'var(--muted)', 'isp': 'var(--muted)',
      }[hop.type] || 'var(--muted)';

      const node = document.createElement('div');
      node.className = `hop-node${isBottleneck ? ' bottleneck' : ''}`;
      node.innerHTML = `
        <div style="font-size:10px;color:var(--muted);font-family:var(--font-mono);">HOP ${hop.hop}</div>
        <div style="font-size:11px;margin:4px 0;color:${typeColor};font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">${hop.type}</div>
        <div class="hop-latency" style="color:${latencyColor(hop.latency_ms)};">${hop.latency_ms}ms</div>
        <div style="font-size:10px;color:var(--muted);font-family:var(--font-mono);margin-top:4px;word-break:break-all;">${hop.ip}</div>
        ${isBottleneck ? `<div style="font-size:10px;color:var(--red);margin-top:4px;">+${jump}ms ▲</div>` : ''}
        ${hop.loss_percent > 0 ? `<div style="font-size:10px;color:var(--red);">${hop.loss_percent}% loss</div>` : ''}
      `;
      hopTimeline.appendChild(node);
      if (i < hops.length - 1) {
        const arr = document.createElement('span');
        arr.className = 'hop-arrow';
        arr.textContent = '→';
        hopTimeline.appendChild(arr);
      }
    });
  }

  function renderBottleneck(trace) {
    const { hops } = trace;
    let maxJump = { idx: 0, jump: 0 };
    for (let i = 1; i < hops.length; i++) {
      const j = hops[i].latency_ms - hops[i-1].latency_ms;
      if (j > maxJump.jump) maxJump = { idx: i, jump: j };
    }
    const total = hops[hops.length-1].latency_ms;
    const cdn_hops = hops.filter(h => h.type.startsWith('cdn'));
    const cdn_latency = cdn_hops.length ? cdn_hops[cdn_hops.length-1].latency_ms - hops[1].latency_ms : 0;
    const origin_latency = total - (cdn_hops.length ? cdn_hops[cdn_hops.length-1].latency_ms : 0);

    bottleneckEl.innerHTML = `
      <div class="panel" style="margin-top:20px;">
        <div class="panel-header"><span class="panel-title">⬡ Bottleneck Analysis</span></div>
        <div class="panel-body">
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:16px;">
            <div><div class="stat-label">Total RTT</div><div class="stat-value ${total > 300 ? 'bad' : total > 150 ? 'warn' : 'good'}">${total}ms</div></div>
            <div><div class="stat-label">CDN Overhead</div><div class="stat-value">${cdn_latency}ms</div></div>
            <div><div class="stat-label">Origin Latency</div><div class="stat-value ${origin_latency > 200 ? 'bad' : 'warn'}">${origin_latency}ms</div></div>
            <div><div class="stat-label">Worst Jump</div><div class="stat-value bad">+${maxJump.jump}ms</div><div class="stat-delta">Hop ${maxJump.idx} → ${maxJump.idx+1}</div></div>
          </div>
          ${maxJump.jump > 50 ? `
            <div style="margin-top:16px;padding:14px;background:rgba(248,113,113,0.07);border:1px solid rgba(248,113,113,0.2);border-radius:12px;font-size:13px;">
              ⚠️ <strong>Critical bottleneck</strong> at Hop ${maxJump.idx+1} — ${maxJump.jump}ms spike.
              ${hops[maxJump.idx]?.type === 'cdn-pop' ? 'CDN PoP issue — consider switching edge configuration.' : 
                hops[maxJump.idx]?.type?.includes('origin') ? 'Origin server is slow — enable Origin Shield or scale origin.' : 
                'ISP/backbone routing issue — contact provider or use anycast.'}
            </div>` : ''}
        </div>
      </div>`;
  }

  function renderMeshChart(traces) {
    const el = document.getElementById('comparison-chart');
    if (!el || typeof Plotly === 'undefined') return;
    const labels = traces.map(t => REGION_META[t.source]?.label || t.source);
    const latencies = traces.map(t => t.hops[t.hops.length-1].latency_ms);
    const colors = latencies.map(l => l > 300 ? '#f87171' : l > 150 ? '#fbbf24' : '#34d399');

    Plotly.newPlot(el, [{
      x: labels, y: latencies, type: 'bar',
      marker: { color: colors, opacity: 0.85 },
      text: latencies.map(l => `${l}ms`), textposition: 'outside',
    }], {
      plot_bgcolor: '#090d1a', paper_bgcolor: '#090d1a',
      font: { color: '#8b92b0', family: 'JetBrains Mono' },
      margin: { t: 20, b: 60, l: 50, r: 20 },
      xaxis: { gridcolor: '#1e2448', tickfont: { size: 11 } },
      yaxis: { title: 'P95 Latency (ms)', gridcolor: '#1e2448' },
    }, { responsive: true, displayModeBar: false });
  }

  async function analyzeTrace(trace) {
    if (!aiSection) return;
    aiSection.innerHTML = `
      <div class="panel" style="margin-top:20px;">
        <div class="ai-panel-header">
          <div class="ai-avatar">✦</div>
          <div><div class="ai-panel-title">AI Route Analysis</div><div class="ai-panel-subtitle">Analyzing hop data…</div></div>
        </div>
        <div class="panel-body">
          <div class="ai-thinking"><span></span><span></span><span></span></div>
        </div>
      </div>`;

    try {
      const hopsText = trace.hops.map(h =>
        `Hop ${h.hop} (${h.type}): ${h.hostname} — ${h.latency_ms}ms`).join('\n');
      const prompt = `Traceroute from ${trace.sourceCity} to ${trace.destination}:\n${hopsText}\nAnalyze routing issues and give recommendations.`;

      const result = await window.llm.chat([
        { role: 'user', content: SYSTEM + '\n\n' + prompt }
      ]);

      aiSection.innerHTML = `
        <div class="panel" style="margin-top:20px;">
          <div class="ai-panel-header">
            <div class="ai-avatar">✦</div>
            <div><div class="ai-panel-title">AI Route Analysis</div><div class="ai-panel-subtitle">Powered by ${providerLabel(getSettings().llm_provider)}</div></div>
          </div>
          <div class="panel-body" style="font-size:13px;line-height:1.8;">
            ${result.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>').replace(/\n/g,'<br>')}
          </div>
        </div>`;
    } catch (e) {
      aiSection.innerHTML = `<div class="panel" style="margin-top:20px;"><div class="panel-body" style="color:var(--muted);">⚠️ AI unavailable: ${e.message}</div></div>`;
    }
  }
});
