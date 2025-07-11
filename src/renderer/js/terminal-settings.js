export class TerminalSettings {
  constructor(terminalManager) {
    this.terminalManager = terminalManager;
    this.settingsPanel = null;
    this.isVisible = false;
    
    this.init();
  }

  init() {
    this.createSettingsPanel();
    this.bindEvents();
  }

  createSettingsPanel() {
    const panel = document.createElement('div');
    panel.id = 'terminal-settings-panel';
    panel.className = 'settings-panel';
    panel.innerHTML = `
      <div class="settings-header">
        <h3>🎨 Terminal Renklendirme</h3>
        <div class="settings-shortcuts">
          <button id="closeSettings" class="close-btn">✕</button>
        </div>
      </div>
      
      <div class="settings-content">
        <div class="settings-info" style="background: linear-gradient(135deg, #1a1a1a, #2a2a2a); border: 1px solid #333; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px; text-align: center;">
          <p style="margin: 0; color: #61afef; font-size: 14px; font-weight: 500;">🌈 Terminal'i basit renklerle güzelleştirin</p>
        </div>
        <div class="settings-section">
          <h4>✨ Görsel Geliştirmeler</h4>
          
          <div class="setting-item">
            <label class="setting-label">
              <input type="checkbox" id="enablePromptStyling" checked>
              <span class="checkmark"></span>
              <div class="setting-info">
                <strong>Prompt Renklendirme</strong>
                <small>kullanıcı@sunucu:dizin$ şeklinde basit renkli prompt</small>
              </div>
            </label>
          </div>

          <div class="setting-item">
            <label class="setting-label">
              <input type="checkbox" id="enableOutputHighlighting" checked>
              <span class="checkmark"></span>
              <div class="setting-info">
                <strong>Komut Renklendirme</strong>
                <small>ls, cd, pwd gibi temel komutları renklendir</small>
              </div>
            </label>
          </div>

          <div class="setting-item">
            <label class="setting-label">
              <input type="checkbox" id="enableEmojis">
              <span class="checkmark"></span>
              <div class="setting-info">
                <strong>Emoji İkonları</strong>
                <small>🏠 📁 ⚡ 🔥 🌐 gibi eğlenceli ikonlar</small>
              </div>
            </label>
          </div>

          <div class="setting-item">
            <label class="setting-label">
              <input type="checkbox" id="enableAnimations">
              <span class="checkmark"></span>
              <div class="setting-info">
                <strong>Animasyonlar</strong>
                <small>Gelecekte: Yazma efektleri ve geçişler</small>
              </div>
            </label>
          </div>
        </div>

        <div class="settings-section">
          <h4>🎯 Hızlı Eylemler</h4>
          
          <div class="setting-actions">
            <button class="action-btn primary" id="resetToDefaults">
              🔄 Varsayılana Sıfırla
            </button>
            <button class="action-btn secondary" id="toggleAllFeatures">
              ⚡ Tümünü Aç/Kapat
            </button>
          </div>
        </div>

        <div class="settings-section">
          <h4>🚀 Özellik Önizleme</h4>
          <div class="preview-container">
            <div class="preview-terminal">
              <div class="preview-line">
                <span class="preview-user">homeserver</span>@<span class="preview-host">homeserver</span>:<span class="preview-dir">~</span><span class="preview-prompt">$</span> <span class="preview-command">ls</span> -la
              </div>
              <div class="preview-line">
                <span class="preview-user">root</span>@<span class="preview-host">server</span>:<span class="preview-dir">/home</span><span class="preview-prompt">#</span> <span class="preview-command">pwd</span>
              </div>
              <div class="preview-line">
                <span class="preview-error">error</span>: Permission denied
              </div>
              <div class="preview-line">
                <span class="preview-success">success</span>: File copied
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    panel.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 500px;
      max-height: 80vh;
      background: linear-gradient(135deg, #1e1e1e, #2a2a2a);
      border: 1px solid #444;
      border-radius: 12px;
      color: white;
      font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
      z-index: 10000;
      display: none;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
      backdrop-filter: blur(10px);
      overflow: hidden;
    `;

    document.body.appendChild(panel);
    this.settingsPanel = panel;
  }

  bindEvents() {
    // Keyboard shortcut
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'H') {
        e.preventDefault();
        this.toggle();
      }
    });

    // Close button
    document.getElementById('closeSettings').addEventListener('click', () => {
      this.hide();
    });

    // Setting toggles
    const settings = ['enablePromptStyling', 'enableOutputHighlighting', 'enableEmojis', 'enableAnimations'];
    settings.forEach(setting => {
      const checkbox = document.getElementById(setting);
      checkbox.addEventListener('change', (e) => {
        this.terminalManager.enhancementSettings[setting] = e.target.checked;
        this.updatePreview();
      });
    });

    // Action buttons
    document.getElementById('resetToDefaults').addEventListener('click', () => {
      this.resetToDefaults();
    });

    document.getElementById('toggleAllFeatures').addEventListener('click', () => {
      this.toggleAllFeatures();
    });

    // Close when clicking outside
    this.settingsPanel.addEventListener('click', (e) => {
      if (e.target === this.settingsPanel) {
        this.hide();
      }
    });
  }

  toggle() {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  show() {
    this.settingsPanel.style.display = 'block';
    this.isVisible = true;
    this.updateSettingsFromState();
    this.updatePreview();
  }

  hide() {
    this.settingsPanel.style.display = 'none';
    this.isVisible = false;
  }

  updateSettingsFromState() {
    const settings = this.terminalManager.enhancementSettings;
    Object.keys(settings).forEach(key => {
      const checkbox = document.getElementById(key);
      if (checkbox) {
        checkbox.checked = settings[key];
      }
    });
  }

  updatePreview() {
    const preview = document.querySelector('.preview-terminal');
    const settings = this.terminalManager.enhancementSettings;
    
    if (settings.enableEmojis) {
      preview.classList.add('with-emojis');
    } else {
      preview.classList.remove('with-emojis');
    }

    if (settings.enableOutputHighlighting) {
      preview.classList.add('with-highlighting');
    } else {
      preview.classList.remove('with-highlighting');
    }
  }

  resetToDefaults() {
    this.terminalManager.enhancementSettings = {
      enablePromptStyling: true,
      enableOutputHighlighting: true,
      enableEmojis: false,
      enableAnimations: false
    };
    this.updateSettingsFromState();
    this.updatePreview();
  }

  toggleAllFeatures() {
    const settings = this.terminalManager.enhancementSettings;
    const allEnabled = Object.values(settings).every(v => v);
    
    Object.keys(settings).forEach(key => {
      settings[key] = !allEnabled;
    });
    
    this.updateSettingsFromState();
    this.updatePreview();
  }
} 