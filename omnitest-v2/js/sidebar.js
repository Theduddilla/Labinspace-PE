// sidebar.js — injects sidebar HTML and sets active state
(function () {
  const path = location.pathname.split('/').pop() || 'index.html';
  const nav = [
    { href: 'index.html',    icon: '▤', label: 'Dashboard' },
    { href: 'recorder.html', icon: '⏺', label: 'Session Recorder' },
    { href: 'mesh.html',     icon: '⬡', label: 'Mesh Analysis' },
    { href: 'settings.html', icon: '⚙', label: 'Settings' },
  ];

  const cfg = (() => { try { return JSON.parse(localStorage.getItem('omnitest_settings') || '{}'); } catch { return {}; } })();
  const provider = cfg.llm_provider || 'groq';
  const provMap = { groq: 'Groq/Llama3', openai: 'OpenAI', ollama: 'Ollama (local)', claude: 'Claude' };

  document.querySelector('.sidebar').innerHTML = `
    <div class="logo">
      <div class="logo-icon">⚡</div>
      <span class="logo-text">OmniTest CDN</span>
    </div>
    <div class="nav-section">Navigation</div>
    <nav>
      ${nav.map(n => `
        <a href="/${n.href}" class="${path === n.href ? 'active' : ''}">
          <span class="nav-icon">${n.icon}</span>
          <span>${n.label}</span>
        </a>`).join('')}
    </nav>
    <div class="sidebar-footer">
      <div class="llm-badge">
        <div class="llm-dot"></div>
        <div>
          <div style="font-size:11px;color:var(--text);">${provMap[provider] || provider}</div>
          <div id="sidebar-llm-status" style="font-size:10px;color:var(--muted);">Checking...</div>
        </div>
      </div>
      <div style="font-size:10px;color:var(--dim);padding:0 2px;">v2.0 · Open Source LLM</div>
    </div>
  `;

  // update status after shared.js loads
  window.addEventListener('load', () => {
    if (window.updateSidebarStatus) updateSidebarStatus();
  });
})();
