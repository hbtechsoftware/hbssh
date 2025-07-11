/**
 * Tema ve özelleştirme yöneticisi
 */
export class ThemeManager {
  constructor() {
    this.currentTheme = 'dark';
    this.settings = {
      theme: 'dark',
      enablePromptStyling: true,
      enableOutputHighlighting: true,
      enableAnimations: false,
      enableParticles: false,
      enableGlowEffects: false,
      terminalOpacity: 0.9,
      fontSize: 14,
      cursorStyle: 'block'
    };
    
    this.themeConfigs = {
      dark: {
        name: 'Dark',
        terminal: {
          background: '#1e1e1e',
          foreground: '#e1e1e1',
          cursor: '#ffffff',
          selection: 'rgba(255, 255, 255, 0.3)',
          black: '#000000',
          red: '#e06c75',
          green: '#98c379',
          yellow: '#e5c07b',
          blue: '#61afef',
          magenta: '#c678dd',
          cyan: '#56b6c2',
          white: '#abb2bf'
        }
      },
      neon: {
        name: 'Neon',
        terminal: {
          background: '#0a0a0a',
          foreground: '#00ffff',
          cursor: '#ff00ff',
          selection: 'rgba(255, 0, 255, 0.3)',
          black: '#000000',
          red: '#ff0040',
          green: '#00ff41',
          yellow: '#ffff00',
          blue: '#0080ff',
          magenta: '#ff00ff',
          cyan: '#00ffff',
          white: '#ffffff'
        }
      },
      matrix: {
        name: 'Matrix',
        terminal: {
          background: '#000000',
          foreground: '#00ff00',
          cursor: '#00ff41',
          selection: 'rgba(0, 255, 0, 0.3)',
          black: '#000000',
          red: '#ff0000',
          green: '#00ff00',
          yellow: '#ffff00',
          blue: '#0000ff',
          magenta: '#ff00ff',
          cyan: '#00ffff',
          white: '#ffffff'
        }
      },
      cyberpunk: {
        name: 'Cyberpunk',
        terminal: {
          background: '#0f0f0f',
          foreground: '#f39c12',
          cursor: '#e74c3c',
          selection: 'rgba(231, 76, 60, 0.3)',
          black: '#000000',
          red: '#e74c3c',
          green: '#27ae60',
          yellow: '#f39c12',
          blue: '#3498db',
          magenta: '#9b59b6',
          cyan: '#1abc9c',
          white: '#ecf0f1'
        }
      },
      ocean: {
        name: 'Ocean',
        terminal: {
          background: '#001f3f',
          foreground: '#7fdbff',
          cursor: '#39cccc',
          selection: 'rgba(57, 204, 204, 0.3)',
          black: '#000000',
          red: '#ff4136',
          green: '#2ecc40',
          yellow: '#ffdc00',
          blue: '#0074d9',
          magenta: '#b10dc9',
          cyan: '#39cccc',
          white: '#ffffff'
        }
      },
      sunset: {
        name: 'Sunset',
        terminal: {
          background: '#ff7f50',
          foreground: '#ffffff',
          cursor: '#ffe66d',
          selection: 'rgba(255, 230, 109, 0.3)',
          black: '#000000',
          red: '#ff6b6b',
          green: '#4ecdc4',
          yellow: '#ffe66d',
          blue: '#74b9ff',
          magenta: '#fd79a8',
          cyan: '#00cec9',
          white: '#ffffff'
        }
      }
    };
    
    this.loadSettings();
    this.initializeEventListeners();
  }
  
  /**
   * Ayarları localStorage'dan yükler
   */
  loadSettings() {
    const savedSettings = localStorage.getItem('hbssh-theme-settings');
    if (savedSettings) {
      this.settings = { ...this.settings, ...JSON.parse(savedSettings) };
    }
    this.currentTheme = this.settings.theme;
  }
  
  /**
   * Ayarları localStorage'a kaydeder
   */
  saveSettings() {
    localStorage.setItem('hbssh-theme-settings', JSON.stringify(this.settings));
  }
  
  /**
   * Olay dinleyicilerini başlatır
   */
  initializeEventListeners() {
    // Tema butonu
    document.getElementById('themeSettingsBtn').addEventListener('click', () => {
      this.openThemeModal();
    });
    
    // Modal kapatma
    document.getElementById('closeThemeModal').addEventListener('click', () => {
      this.closeThemeModal();
    });
    
    // Tema seçenekleri
    document.querySelectorAll('.theme-option').forEach(option => {
      option.addEventListener('click', () => {
        this.selectTheme(option.dataset.theme);
      });
    });
    
    // Uygula butonu
    document.getElementById('applyThemeBtn').addEventListener('click', () => {
      this.applyTheme();
    });
    
    // Sıfırla butonu
    document.getElementById('resetThemeBtn').addEventListener('click', () => {
      this.resetTheme();
    });
    
    // Slider'lar
    document.getElementById('terminalOpacity').addEventListener('input', (e) => {
      document.getElementById('opacityValue').textContent = Math.round(e.target.value * 100) + '%';
    });
    
    document.getElementById('fontSize').addEventListener('input', (e) => {
      document.getElementById('fontSizeValue').textContent = e.target.value + 'px';
    });
    
    // Modal dışında tıklama
    document.getElementById('themeModal').addEventListener('click', (e) => {
      if (e.target.id === 'themeModal') {
        this.closeThemeModal();
      }
    });
  }
  
  /**
   * Tema modalını açar
   */
  openThemeModal() {
    this.updateModalValues();
    document.getElementById('themeModal').classList.add('show');
  }
  
  /**
   * Tema modalını kapatır
   */
  closeThemeModal() {
    document.getElementById('themeModal').classList.remove('show');
  }
  
  /**
   * Modal değerlerini günceller
   */
  updateModalValues() {
    // Tema seçimi
    document.querySelectorAll('.theme-option').forEach(option => {
      option.classList.remove('selected');
      if (option.dataset.theme === this.currentTheme) {
        option.classList.add('selected');
      }
    });
    
    // Checkbox'lar
    document.getElementById('enablePromptStyling').checked = this.settings.enablePromptStyling;
    document.getElementById('enableOutputHighlighting').checked = this.settings.enableOutputHighlighting;
    document.getElementById('enableAnimations').checked = this.settings.enableAnimations;
    document.getElementById('enableParticles').checked = this.settings.enableParticles;
    document.getElementById('enableGlowEffects').checked = this.settings.enableGlowEffects;
    
    // Slider'lar
    document.getElementById('terminalOpacity').value = this.settings.terminalOpacity;
    document.getElementById('opacityValue').textContent = Math.round(this.settings.terminalOpacity * 100) + '%';
    document.getElementById('fontSize').value = this.settings.fontSize;
    document.getElementById('fontSizeValue').textContent = this.settings.fontSize + 'px';
    document.getElementById('cursorStyle').value = this.settings.cursorStyle;
  }
  
  /**
   * Tema seçer
   */
  selectTheme(theme) {
    this.currentTheme = theme;
    document.querySelectorAll('.theme-option').forEach(option => {
      option.classList.remove('selected');
      if (option.dataset.theme === theme) {
        option.classList.add('selected');
      }
    });
  }
  
  /**
   * Temayı uygular
   */
  applyTheme() {
    // Ayarları güncelle
    this.settings.theme = this.currentTheme;
    this.settings.enablePromptStyling = document.getElementById('enablePromptStyling').checked;
    this.settings.enableOutputHighlighting = document.getElementById('enableOutputHighlighting').checked;
    this.settings.enableAnimations = document.getElementById('enableAnimations').checked;
    this.settings.enableParticles = document.getElementById('enableParticles').checked;
    this.settings.enableGlowEffects = document.getElementById('enableGlowEffects').checked;
    this.settings.terminalOpacity = parseFloat(document.getElementById('terminalOpacity').value);
    this.settings.fontSize = parseInt(document.getElementById('fontSize').value);
    this.settings.cursorStyle = document.getElementById('cursorStyle').value;
    
    // Ayarları kaydet
    this.saveSettings();
    
    // Temayı uygula
    this.applyThemeToApp();
    
    // Modalı kapat
    this.closeThemeModal();
  }
  
  /**
   * Temayı sıfırlar
   */
  resetTheme() {
    this.settings = {
      theme: 'dark',
      enablePromptStyling: true,
      enableOutputHighlighting: true,
      enableAnimations: false,
      enableParticles: false,
      enableGlowEffects: false,
      terminalOpacity: 0.9,
      fontSize: 14,
      cursorStyle: 'block'
    };
    this.currentTheme = 'dark';
    this.updateModalValues();
  }
  
  /**
   * Temayı uygulamaya uygular
   */
  applyThemeToApp() {
    // Terminal instance'larını güncelle
    if (window.terminalManager) {
      Object.values(window.terminalManager.terminals).forEach(terminalInstance => {
        if (terminalInstance.terminal) {
          const themeConfig = this.themeConfigs[this.currentTheme];
          
          // Terminal temasını güncelle
          terminalInstance.terminal.options.theme = themeConfig.terminal;
          terminalInstance.terminal.options.fontSize = this.settings.fontSize;
          terminalInstance.terminal.options.cursorStyle = this.settings.cursorStyle;
          
          // Terminal enhancement ayarlarını güncelle
          if (window.terminalManager.enhancementSettings) {
            window.terminalManager.enhancementSettings.enablePromptStyling = this.settings.enablePromptStyling;
            window.terminalManager.enhancementSettings.enableOutputHighlighting = this.settings.enableOutputHighlighting;
            window.terminalManager.enhancementSettings.enableAnimations = this.settings.enableAnimations;
          }
        }
      });
    }
    
    // Terminal container'lara tema sınıfı ekle
    document.querySelectorAll('.terminal-instance').forEach(terminal => {
      // Eski tema sınıflarını kaldır
      terminal.classList.remove('dark-theme', 'neon-theme', 'matrix-theme', 'cyberpunk-theme', 'ocean-theme', 'sunset-theme');
      // Yeni tema sınıfını ekle
      terminal.classList.add(this.currentTheme + '-theme');
    });
    
    // Parçacık efektleri
    if (this.settings.enableParticles) {
      this.createParticles();
    } else {
      this.removeParticles();
    }
    
    // Işık efektleri
    if (this.settings.enableGlowEffects) {
      document.body.classList.add('glow-effect');
    } else {
      document.body.classList.remove('glow-effect');
    }
    
    // Terminal şeffaflığı
    document.querySelectorAll('.terminal-instance').forEach(terminal => {
      terminal.style.opacity = this.settings.terminalOpacity;
    });
    
    console.log(`Tema uygulandı: ${this.currentTheme}`);
  }
  
  /**
   * Parçacık efektleri oluşturur
   */
  createParticles() {
    // Mevcut parçacıkları temizle
    this.removeParticles();
    
    const container = document.createElement('div');
    container.className = 'particles-container';
    container.id = 'particlesContainer';
    
    document.body.appendChild(container);
    
    // Parçacık oluştur
    for (let i = 0; i < 20; i++) {
      const particle = document.createElement('div');
      particle.className = 'particle';
      particle.style.left = Math.random() * 100 + '%';
      particle.style.animationDelay = Math.random() * 3 + 's';
      particle.style.animationDuration = (Math.random() * 3 + 2) + 's';
      container.appendChild(particle);
    }
  }
  
  /**
   * Parçacık efektlerini kaldırır
   */
  removeParticles() {
    const container = document.getElementById('particlesContainer');
    if (container) {
      container.remove();
    }
  }
  
  /**
   * Başlangıçta temayı uygular
   */
  initializeTheme() {
    this.applyThemeToApp();
  }
  
  /**
   * Mevcut tema ayarlarını döndürür
   */
  getCurrentTheme() {
    return this.currentTheme;
  }
  
  /**
   * Tema ayarlarını döndürür
   */
  getSettings() {
    return this.settings;
  }
} 