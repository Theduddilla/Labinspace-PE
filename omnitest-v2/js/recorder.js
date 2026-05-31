// recorder.js
document.addEventListener('DOMContentLoaded', () => {
  let recording = false, calls = [], phase = 'PRE_LOGIN', interval = null;

  const startBtn   = document.getElementById('start-btn');
  const stopBtn    = document.getElementById('stop-btn');
  const exportBtn  = document.getElementById('export-btn');
  const analyzeBtn = document.getElementById('analyze-btn');
  const statusEl   = document.getElementById('rec-status');
  const statusText = document.getElementById('status-text');
  const tbody      = document.getElementById('calls-body');

  startBtn.addEventListener('click', () => {
    const url = document.getElementById('app-url').value.trim();
    if (!url) { toast('Enter an application URL', 'error'); return; }
    recording = true; calls = []; phase = 'PRE_LOGIN';
    startBtn.disabled = true; stopBtn.disabled = false; exportBtn.disabled = true; analyzeBtn.disabled = true;
    statusEl.className = 'recording-status recording';
    statusText.textContent = '⏺ Recording — Pre-Login Phase';
    tbody.innerHTML = '';
    simulateRecording(url);
    window.open(url, '_blank');
  });

  stopBtn.addEventListener('click', () => {
    recording = false;
    clearInterval(interval);
    startBtn.disabled = false; stopBtn.disabled = true;
    exportBtn.disabled = calls.length === 0; analyzeBtn.disabled = calls.length === 0;
    statusEl.className = 'recording-status';
    statusText.textContent = `⏹ Stopped — ${calls.length} calls captured`;
    if (calls.length > 0) {
      toast(`${calls.length} API calls captured`, 'success');
    }
  });

  exportBtn.addEventListener('click', () => {
    const data = {
      name: document.getElementById('session-name').value || 'session',
      url: document.getElementById('app-url').value,
      capturedAt: new Date().toISOString(),
      calls,
      summary: {
        total: calls.length,
        PRE_LOGIN: calls.filter(c => c.phase === 'PRE_LOGIN').length,
        LOGIN: calls.filter(c => c.phase === 'LOGIN').length,
        POST_LOGIN: calls.filter(c => c.phase === 'POST_LOGIN').length,
        avg_duration: Math.round(calls.reduce((a,c)=>a+c.duration,0)/calls.length),
      }
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `omnitest-${Date.now()}.json` });
    a.click();
    toast('Session exported', 'success');
  });

  analyzeBtn.addEventListener('click', async () => {
    analyzeBtn.disabled = true; analyzeBtn.innerHTML = '<span class="spinner"></span> Analyzing…';
    const aiPanel = document.getElementById('ai-analysis');
    aiPanel.innerHTML = `<div class="ai-thinking"><span></span><span></span><span></span></div>`;
    aiPanel.closest('.panel').style.display = 'block';

    try {
      const summary = calls.map(c => `${c.phase} | ${c.method} ${c.url} → ${c.status} (${c.duration}ms)`).join('\n');
      const prompt = `Analyze these recorded API calls from a web session. Identify performance bottlenecks, slow endpoints, and optimization opportunities:\n\n${summary}`;
      const result = await window.llm.chat([
        { role: 'user', content: 'You are a web performance expert. Analyze API call logs concisely. Use bullet points. Focus on: slow calls (>300ms), failed calls, phase-by-phase comparison, and specific improvements.\n\n' + prompt }
      ]);
      aiPanel.innerHTML = `<div style="font-size:13px;line-height:1.8;">${result.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>').replace(/\n/g,'<br>')}</div>`;
    } catch (e) {
      aiPanel.innerHTML = `<span style="color:var(--red);">⚠️ ${e.message}</span>`;
    } finally {
      analyzeBtn.disabled = false; analyzeBtn.textContent = '✦ AI Analyze';
    }
  });

  function simulateRecording(url) {
    const SAMPLE = [
      { method:'GET',  url:'/',                     status:200, duration:234, phase:'PRE_LOGIN'  },
      { method:'GET',  url:'/static/main.css',      status:200, duration:45,  phase:'PRE_LOGIN'  },
      { method:'GET',  url:'/static/app.js',        status:200, duration:123, phase:'PRE_LOGIN'  },
      { method:'GET',  url:'/api/config',           status:200, duration:67,  phase:'PRE_LOGIN'  },
      { method:'POST', url:'/api/auth/login',       status:200, duration:489, phase:'LOGIN'      },
      { method:'GET',  url:'/api/auth/session',     status:200, duration:78,  phase:'LOGIN'      },
      { method:'GET',  url:'/api/user/profile',     status:200, duration:189, phase:'POST_LOGIN' },
      { method:'GET',  url:'/api/dashboard/stats',  status:200, duration:312, phase:'POST_LOGIN' },
      { method:'GET',  url:'/api/notifications',    status:200, duration:156, phase:'POST_LOGIN' },
      { method:'POST', url:'/api/analytics/event',  status:200, duration:88,  phase:'POST_LOGIN' },
      { method:'GET',  url:'/api/timesheet/current',status:200, duration:234, phase:'POST_LOGIN' },
      { method:'GET',  url:'/cdn/images/hero.png',  status:200, duration:34,  phase:'POST_LOGIN' },
    ];
    let i = 0;
    interval = setInterval(() => {
      if (!recording || i >= SAMPLE.length) { clearInterval(interval); return; }
      const call = { ...SAMPLE[i], n: i+1, timestamp: new Date().toISOString() };
      calls.push(call);
      addRow(call);
      phase = call.phase;
      statusText.textContent = `⏺ Recording — ${phase.replace('_',' ')} Phase`;
      i++;
    }, 600);
  }

  function addRow(call) {
    const phaseColors = { PRE_LOGIN:'var(--accent)', LOGIN:'var(--yellow)', POST_LOGIN:'var(--green)' };
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${call.n}</td>
      <td><span class="badge badge-${call.method === 'GET' ? 'A' : 'B'}">${call.method}</span></td>
      <td style="font-family:var(--font-mono);font-size:11px;">${call.url}</td>
      <td>${call.status}</td>
      <td style="color:${call.duration > 300 ? 'var(--red)' : call.duration > 150 ? 'var(--yellow)' : 'var(--green)'};">${call.duration}ms</td>
      <td><span style="font-size:11px;color:${phaseColors[call.phase]};">${call.phase.replace('_',' ')}</span></td>
    `;
    tbody.appendChild(tr);
    tr.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
});
