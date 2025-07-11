export class SystemInfoTest {
  constructor() {
    this.isDebugMode = false;
    this.debugPanel = null;
  }

  init() {
    this.createDebugPanel();
    this.bindEvents();
  }

  createDebugPanel() {
    const debugPanel = document.createElement('div');
    debugPanel.id = 'system-info-debug';
    debugPanel.innerHTML = `
      <div class="debug-header">
        <div class="debug-header-main">
          <h3>🔧 Sistem Bilgisi Debug</h3>
        </div>
        <button id="toggleDebug">Gizle/Göster</button>
      </div>
      <div class="debug-content" id="debugContent">
        <div class="debug-section">
          <h4>Test Komutları</h4>
          <button id="testBasicCommands">Temel Komutları Test Et</button>
          <button id="testMemoryCommands">Bellek Komutlarını Test Et</button>
          <button id="testSystemInfo">Sistem Bilgisi Al</button>
        </div>
        <div class="debug-section">
          <h4>Komut Çıktıları</h4>
          <textarea id="debugOutput" readonly rows="10" cols="80" placeholder="Komut çıktıları burada görünecek..."></textarea>
        </div>
      </div>
    `;
    
    debugPanel.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      width: 450px;
      background: #2a2a2a;
      border: 1px solid #555;
      border-radius: 8px;
      color: white;
      font-family: monospace;
      z-index: 9999;
      display: none;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    `;

    document.body.appendChild(debugPanel);
    this.debugPanel = debugPanel;
  }

  bindEvents() {
    document.getElementById('toggleDebug').addEventListener('click', () => {
      const content = document.getElementById('debugContent');
      content.style.display = content.style.display === 'none' ? 'block' : 'none';
    });

    document.getElementById('testBasicCommands').addEventListener('click', () => {
      this.testBasicCommands();
    });

    document.getElementById('testMemoryCommands').addEventListener('click', () => {
      this.testMemoryCommands();
    });

    document.getElementById('testSystemInfo').addEventListener('click', () => {
      this.testSystemInfo();
    });

    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'D') {
        this.toggleDebugPanel();
      }
    });
  }

  toggleDebugPanel() {
    if (this.debugPanel) {
      this.debugPanel.style.display = this.debugPanel.style.display === 'none' ? 'block' : 'none';
    }
  }

  async testBasicCommands() {
    const output = document.getElementById('debugOutput');
    output.value = 'Temel komutlar test ediliyor...\n';
    
    const basicCommands = [
      'whoami',
      'uname -a',
      'pwd',
      'date',
      'uptime'
    ];

    for (const command of basicCommands) {
      try {
        output.value += `\n=== ${command} ===\n`;
        const result = await this.executeCommand(command);
        output.value += result + '\n';
      } catch (error) {
        output.value += `HATA: ${error.message}\n`;
      }
    }
  }

  async testMemoryCommands() {
    const output = document.getElementById('debugOutput');
    output.value = 'Bellek komutları test ediliyor...\n';
    
    const memoryCommands = [
      'free -h',
      'free -m',
      'cat /proc/meminfo | head -5',
      'top -bn1 | head -5'
    ];

    for (const command of memoryCommands) {
      try {
        output.value += `\n=== ${command} ===\n`;
        const result = await this.executeCommand(command);
        output.value += result + '\n';
      } catch (error) {
        output.value += `HATA: ${error.message}\n`;
      }
    }
  }

  async testSystemInfo() {
    const output = document.getElementById('debugOutput');
    output.value = 'Sistem bilgisi toplanıyor...\n';
    
    const systemCommands = [
      'lscpu | head -10',
      'df -h',
      'iostat -c 1 1',
      'vmstat 1 1',
      'cat /proc/version'
    ];

    for (const command of systemCommands) {
      try {
        output.value += `\n=== ${command} ===\n`;
        const result = await this.executeCommand(command);
        output.value += result + '\n';
      } catch (error) {
        output.value += `HATA: ${error.message}\n`;
      }
    }
  }

  async executeCommand(command) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        reject(new Error('SSH bağlantısı yok veya komut çalıştırılamadı'));
      }, 5000);
    });
  }
}

const systemInfoTest = new SystemInfoTest();
systemInfoTest.init(); 