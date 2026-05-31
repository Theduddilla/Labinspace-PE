// settings.js
document.addEventListener('DOMContentLoaded', () => {
  loadForm();

  // Provider toggle
  document.querySelectorAll('.provider-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.provider-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      document.getElementById('provider-input').value = card.dataset.provider;
      showProviderFields(card.dataset.provider);
    });
  });

  document.getElementById('save-btn').addEventListener('click', () => {
    const cfg = {
      llm_provider:    document.getElementById('provider-input').value,
      groq_api_key:    document.getElementById('groq-key').value.trim(),
      openai_api_key:  document.getElementById('openai-key').value.trim(),
      claude_api_key:  document.getElementById('claude-key').value.trim(),
      ollama_url:      document.getElementById('ollama-url').value.trim(),
      ollama_model:    document.getElementById('ollama-model').value.trim(),
      groq_model:      document.getElementById('groq-model').value,
      openai_model:    document.getElementById('openai-model').value,
      claude_model:    document.getElementById('claude-model').value,
      alert_threshold_ms: parseInt(document.getElementById('alert-threshold').value) || 500,
      default_iterations: parseInt(document.getElementById('iterations').value) || 10,
      sla_p95_ms:         parseInt(document.getElementById('sla-p95')?.value) || 400,
      sla_availability:   parseFloat(document.getElementById('sla-avail')?.value) || 99.9,
    };
    saveSettings(cfg);
    if (window.llm) window.llm.cfg; // trigger refresh
    toast('Settings saved ✓', 'success');
    updateSidebarStatus();
  });

  document.getElementById('test-btn').addEventListener('click', async () => {
    const btn = document.getElementById('test-btn');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Testing…';
    try {
      const result = await window.llm.testConnection();
      if (result.ok) {
        const models = result.models ? `Models: ${result.models.slice(0,4).join(', ')}` : result.echo || 'OK';
        toast(`✅ Connected — ${models}`, 'success', 5000);
      } else {
        toast(`❌ ${result.error}`, 'error', 5000);
      }
    } catch (e) {
      toast(`❌ ${e.message}`, 'error');
    } finally {
      btn.disabled = false; btn.textContent = 'Test Connection';
    }
  });

  document.getElementById('reset-btn').addEventListener('click', () => {
    localStorage.removeItem('omnitest_settings');
    loadForm();
    toast('Reset to defaults', 'info');
  });

  function loadForm() {
    const cfg = getSettings();
    document.getElementById('provider-input').value = cfg.llm_provider;
    document.querySelectorAll('.provider-card').forEach(c => {
      c.classList.toggle('active', c.dataset.provider === cfg.llm_provider);
    });
    showProviderFields(cfg.llm_provider);

    document.getElementById('groq-key').value = cfg.groq_api_key || '';
    document.getElementById('openai-key').value = cfg.openai_api_key || '';
    document.getElementById('claude-key').value = cfg.claude_api_key || '';
    document.getElementById('ollama-url').value = cfg.ollama_url || 'http://localhost:11434';
    document.getElementById('ollama-model').value = cfg.ollama_model || 'llama3:8b';
    document.getElementById('groq-model').value = cfg.groq_model || 'llama3-8b-8192';
    document.getElementById('openai-model').value = cfg.openai_model || 'gpt-4o-mini';
    document.getElementById('claude-model').value = cfg.claude_model || 'claude-haiku-3-5-20241022';
    document.getElementById('alert-threshold').value = cfg.alert_threshold_ms || 500;
    document.getElementById('alert-threshold').value = cfg.alert_threshold_ms || 500;
    document.getElementById('iterations').value = cfg.default_iterations || 10;
    if (document.getElementById('sla-p95')) document.getElementById('sla-p95').value = cfg.sla_p95_ms || 400;
    if (document.getElementById('sla-avail')) document.getElementById('sla-avail').value = cfg.sla_availability || 99.9;
  }

  function showProviderFields(provider) {
    ['groq','openai','claude','ollama'].forEach(p => {
      const el = document.getElementById(`fields-${p}`);
      if (el) el.style.display = p === provider ? 'block' : 'none';
    });
  }
});
