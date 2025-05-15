/**
 * Terminal örneklerini ve SSH bağlantılarını yönetir.
 * XTerm.js tabanlı terminal arayüzü sağlar, SSH bağlantılarını açar, kapatır ve yeniden bağlanma işlemlerini yönetir.
 */
export class TerminalManager {
  /**
   * TerminalManager örneğini başlatır. Tüm terminal ve bağlantı yapılarını oluşturur, olay dinleyicilerini kaydeder.
   */
  constructor() {
    /** @type {Object<string, Object>} Tüm terminal örneklerini ID'ye göre saklar. */
    this.terminals = {};
    /** @type {string|null} Aktif terminalin ID'si. */
    this.activeTerminalId = null;
    /** @type {Object<string, string>} SSH bağlantı ID'sinden terminal ID'sine eşleme. */
    this.sshConnections = {};
    /** @type {Object<string, number>} Her terminal için yeniden bağlanma zamanlayıcıları. */
    this.reconnectTimers = {};
    /** @type {Object<string, number>} Her terminal için yeniden bağlanma deneme sayacı. */
    this.reconnectAttempts = {};
    /** @type {number} Maksimum yeniden bağlanma denemesi. */
    this.MAX_RECONNECT_ATTEMPTS = 5;
    /** @type {number} Yeniden bağlanma aralığı (ms). */
    this.RECONNECT_INTERVAL = 3000;
    
    this.createTerminal = this.createTerminal.bind(this);
    this.closeTerminal = this.closeTerminal.bind(this);
    this.setActiveTerminal = this.setActiveTerminal.bind(this);
    this.handleResize = this.handleResize.bind(this);
    this.handleSSHData = this.handleSSHData.bind(this);
    this.handleSSHClose = this.handleSSHClose.bind(this);
    this.handleSSHError = this.handleSSHError.bind(this);
    this.handleKeyboardEvent = this.handleKeyboardEvent.bind(this);
    this.copySelectedText = this.copySelectedText.bind(this);
    this.pasteText = this.pasteText.bind(this);
    
    window.addEventListener('resize', this.handleResize);
    window.api.onSSHData(this.handleSSHData);
    window.api.onSSHClose(this.handleSSHClose);
    window.api.onSSHError(this.handleSSHError);
    document.addEventListener('keydown', this.handleKeyboardEvent);
  }
  
  /**
   * Klavye kısayollarını (kopyala/yapıştır) yönetir.
   * @param {KeyboardEvent} event - Klavye olayı
   */
  handleKeyboardEvent(event) {
    const activeElement = document.activeElement;
    const isInputFocused = activeElement && 
                           (activeElement.tagName === 'INPUT' || 
                            activeElement.tagName === 'TEXTAREA' || 
                            activeElement.tagName === 'SELECT' || 
                            activeElement.isContentEditable);
    if (isInputFocused) {
      if ((event.ctrlKey || event.metaKey) && (event.key === 'c' || event.key === 'v')) {
        return;
      }
    }
    if (!this.activeTerminalId) return;
    const terminalInstance = this.terminals[this.activeTerminalId];
    if (!terminalInstance) return;
    if ((event.ctrlKey || event.metaKey) && event.key === 'c') {
      if (terminalInstance.terminal.hasSelection()) {
        event.preventDefault();
        this.copySelectedText();
      }
    }
    if ((event.ctrlKey || event.metaKey) && event.key === 'v') {
      event.preventDefault();
      this.pasteText();
    }
  }
  
  /**
   * Aktif terminalde seçili metni panoya kopyalar.
   */
  async copySelectedText() {
    if (!this.activeTerminalId) return;
    const terminalInstance = this.terminals[this.activeTerminalId];
    if (!terminalInstance) return;
    const selectedText = terminalInstance.terminal.getSelection();
    if (selectedText) {
      try {
        await window.api.writeClipboard(selectedText);
      } catch (error) {
        console.error('Panoya kopyalama başarısız:', error);
      }
    }
  }
  
  /**
   * Panodaki metni aktif terminale yapıştırır.
   */
  async pasteText() {
    if (!this.activeTerminalId) return;
    const terminalInstance = this.terminals[this.activeTerminalId];
    if (!terminalInstance || !terminalInstance.sshConnectionId) return;
    try {
      const text = await window.api.readClipboard();
      if (text) {
        await window.api.writeSSH(terminalInstance.sshConnectionId, text);
      }
    } catch (error) {
      console.error('Panodan yapıştırma başarısız:', error);
    }
  }
  
  /**
   * Yeni bir terminal örneği oluşturur ve SSH bağlantısı başlatır.
   * @param {Object} connection - Bağlantı yapılandırma nesnesi
   * @param {string} tabId - Terminalin ait olduğu sekmenin ID'si
   * @returns {Promise<Object|null>} Terminal örneği veya hata durumunda null
   */
  async createTerminal(connection, tabId) {
    const id = tabId || `tab-${Date.now()}-${Object.keys(this.terminals).length}`;
    const terminalElement = document.getElementById(`terminal-${id}`);
    if (!terminalElement) {
      console.error(`Terminal elementi bulunamadı: terminal-${id}`);
      return null;
    }
    const terminal = new window.Terminal({
      cursorBlink: true,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 14,
      theme: {
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
      },
      scrollback: 5000,
      allowTransparency: true
    });
    const fitAddon = new window.FitAddon.FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(terminalElement);
    this.terminals[id] = {
      terminal,
      fitAddon,
      connection,
      sshConnectionId: null,
      buffer: [],
      reconnecting: false
    };
    terminal.onData((data) => {
      this.handleTerminalInput(id, data);
    });
    await this.initSSHConnection(id);
    this.setActiveTerminal(id);
    setTimeout(() => {
      this.fitTerminal(id);
    }, 0);
    return this.terminals[id];
  }
  
  /**
   * Belirtilen terminal ID'si için SSH bağlantısı başlatır veya yeniden bağlanır.
   * @param {string} id - Terminal ID'si
   * @param {boolean} [isReconnect=false] - Yeniden bağlanma denemesi mi?
   */
  async initSSHConnection(id, isReconnect = false) {
    const terminalInstance = this.terminals[id];
    if (!terminalInstance) return;
    const { terminal, connection } = terminalInstance;
    if (isReconnect) {
      terminal.writeln('\r\nBağlantı koptu. Yeniden bağlanılıyor...');
      terminalInstance.reconnecting = true;
    } else {
      terminal.writeln('SSH sunucusuna bağlanılıyor...');
    }
    try {
      const result = await window.api.connectSSH(connection);
      if (result.success) {
        terminalInstance.sshConnectionId = result.connectionId;
        this.sshConnections[result.connectionId] = id;
        this.reconnectAttempts[id] = 0;
        if (this.reconnectTimers[id]) {
          clearTimeout(this.reconnectTimers[id]);
          delete this.reconnectTimers[id];
        }
        if (terminalInstance.reconnecting) {
          terminal.writeln('\r\nSunucuya yeniden bağlanıldı.');
          terminalInstance.reconnecting = false;
        }
        this.fitTerminal(id);
        const dimensions = this.getTerminalDimensions(id);
        if (dimensions) {
          await window.api.resizeSSH(result.connectionId, dimensions.cols, dimensions.rows);
        }
      } else {
        terminal.writeln(`\r\nBağlantı başarısız: ${result.error}`);
        this.scheduleReconnect(id);
      }
    } catch (error) {
      terminal.writeln(`\r\nBağlantı hatası: ${error.message}`);
      this.scheduleReconnect(id);
    }
  }
  
  /**
   * Belirtilen terminal için yeniden bağlanma zamanlayıcısı başlatır.
   * @param {string} id - Terminal ID'si
   */
  scheduleReconnect(id) {
    const terminalInstance = this.terminals[id];
    if (!terminalInstance) return;
    if (this.reconnectAttempts[id] === undefined) {
      this.reconnectAttempts[id] = 0;
    }
    this.reconnectAttempts[id]++;
    if (this.reconnectAttempts[id] > this.MAX_RECONNECT_ATTEMPTS) {
      terminalInstance.terminal.writeln(`\r\n${this.MAX_RECONNECT_ATTEMPTS} denemeden sonra yeniden bağlanılamadı.`);
      return;
    }
    if (this.reconnectTimers[id]) {
      clearTimeout(this.reconnectTimers[id]);
    }
    this.reconnectTimers[id] = setTimeout(() => {
      if (this.terminals[id]) {
        this.initSSHConnection(id, true);
      } else {
        delete this.reconnectTimers[id];
        delete this.reconnectAttempts[id];
      }
    }, this.RECONNECT_INTERVAL);
    terminalInstance.terminal.writeln(`\r\n${this.RECONNECT_INTERVAL / 1000} saniye sonra yeniden bağlanılacak... (Deneme ${this.reconnectAttempts[id]} / ${this.MAX_RECONNECT_ATTEMPTS})`);
  }
  
  /**
   * Terminalden gelen kullanıcı girişini işler ve SSH bağlantısına iletir.
   * @param {string} id - Terminal ID'si
   * @param {string} data - Kullanıcıdan gelen veri
   */
  async handleTerminalInput(id, data) {
    const terminalInstance = this.terminals[id];
    if (!terminalInstance) return;
    if (!terminalInstance.sshConnectionId) {
      terminalInstance.buffer.push(data);
      return;
    }
    try {
      await window.api.writeSSH(terminalInstance.sshConnectionId, data);
    } catch (error) {
      console.error('SSH bağlantısına veri gönderilemedi:', error);
      terminalInstance.buffer.push(data);
    }
  }
  
  /**
   * SSH bağlantısından gelen veriyi ilgili terminale yazar.
   * @param {string} connectionId - SSH bağlantı ID'si
   * @param {string} data - SSH sunucusundan gelen veri
   */
  handleSSHData(connectionId, data) {
    const terminalId = this.sshConnections[connectionId];
    if (!terminalId) return;
    const terminalInstance = this.terminals[terminalId];
    if (!terminalInstance) return;
    terminalInstance.terminal.write(data);
  }
  
  /**
   * SSH bağlantısı kapandığında ilgili terminali bilgilendirir ve yeniden bağlanmayı başlatır.
   * @param {string} connectionId - SSH bağlantı ID'si
   */
  handleSSHClose(connectionId) {
    const terminalId = this.sshConnections[connectionId];
    if (!terminalId) return;
    const terminalInstance = this.terminals[terminalId];
    if (!terminalInstance) return;
    terminalInstance.sshConnectionId = null;
    delete this.sshConnections[connectionId];
    terminalInstance.terminal.writeln('\r\nBağlantı uzak sunucu tarafından kapatıldı.');
    this.scheduleReconnect(terminalId);
  }
  
  /**
   * SSH bağlantı hatasını terminalde gösterir.
   * @param {string} connectionId - SSH bağlantı ID'si
   * @param {string} error - Hata mesajı
   */
  handleSSHError(connectionId, error) {
    const terminalId = this.sshConnections[connectionId];
    if (!terminalId) return;
    const terminalInstance = this.terminals[terminalId];
    if (!terminalInstance) return;
    terminalInstance.terminal.writeln(`\r\nBağlantı hatası: ${error}`);
  }
  
  /**
   * Terminalin mevcut boyutlarını (kolon ve satır) döndürür.
   * @param {string} id - Terminal ID'si
   * @returns {{cols: number, rows: number}} Terminalin boyutları
   */
  getTerminalDimensions(id) {
    const terminalInstance = this.terminals[id];
    if (!terminalInstance) {
      console.error(`[${id}] TerminalManager: Terminal instance for ID '${id}' not found when trying to get dimensions. Returning default.`);
      return { cols: 80, rows: 24 }; 
    }
    if (!terminalInstance.terminal) {
      console.error(`[${id}] TerminalManager: Xterm.js instance not found in terminalInstance for dimension calculation. Returning default.`);
      return { cols: 80, rows: 24 };
    }
    if (typeof terminalInstance.terminal.cols === 'undefined' || typeof terminalInstance.terminal.rows === 'undefined') {
      console.warn(`[${id}] TerminalManager: Xterm.js cols/rows are undefined. Terminal might not be fully initialized or visible. Using default dimensions.`);
      return { cols: 80, rows: 24 }; 
    }
    return {
      cols: terminalInstance.terminal.cols,
      rows: terminalInstance.terminal.rows,
    };
  }
  
  /**
   * Bir terminal örneğini kapatır ve SSH bağlantısını sonlandırır.
   * @param {string} id - Kapatılacak terminalin ID'si
   */
  async closeTerminal(id) {
    const terminalInstance = this.terminals[id];
    if (terminalInstance) {
      if (this.reconnectTimers[id]) {
        clearTimeout(this.reconnectTimers[id]);
        delete this.reconnectTimers[id];
      }
      delete this.reconnectAttempts[id];
      if (terminalInstance.sshConnectionId) {
        try {
          await window.api.disconnectSSH(terminalInstance.sshConnectionId);
          delete this.sshConnections[terminalInstance.sshConnectionId];
        } catch (error) {
          console.error('SSH bağlantısı kapatılamadı:', error);
        }
      }
      terminalInstance.terminal.dispose();
      delete this.terminals[id];
      if (this.activeTerminalId === id) {
        this.activeTerminalId = null;
      }
    }
  }
  
  /**
   * Aktif terminali ayarlar ve terminali konteynerine sığdırır.
   * @param {string} id - Aktif yapılacak terminalin ID'si
   */
  setActiveTerminal(id) {
    this.activeTerminalId = id;
    this.fitTerminal(id);
  }
  
  /**
   * Terminali konteynerine sığdırır ve SSH bağlantısına yeni boyutları bildirir.
   * @param {string} id - Terminal ID'si
   */
  fitTerminal(id) {
    const terminalInstance = this.terminals[id];
    if (terminalInstance && terminalInstance.fitAddon) {
      try {
        terminalInstance.fitAddon.fit();
        if (terminalInstance.sshConnectionId) {
          const dimensions = this.getTerminalDimensions(id);
          if (dimensions) {
            window.api.resizeSSH(terminalInstance.sshConnectionId, dimensions.cols, dimensions.rows);
          }
        }
      } catch (error) {
        console.error('Terminal sığdırma başarısız:', error);
      }
    }
  }
  
  /**
   * Pencere yeniden boyutlandığında aktif terminali sığdırır.
   */
  handleResize() {
    if (this.activeTerminalId) {
      this.fitTerminal(this.activeTerminalId);
    }
  }
  
  /**
   * Aktif terminal örneğini döndürür.
   * @returns {Object|null} Aktif terminal örneği veya yoksa null
   */
  getActiveTerminal() {
    if (!this.activeTerminalId) return null;
    return this.terminals[this.activeTerminalId] || null;
  }
  
  /**
   * Bir terminal oturumunu yeniden başlatır (yeniden bağlanır).
   * @param {string} id - Yeniden yüklenecek terminalin ID'si
   */
  async reloadTerminal(id) {
    const terminalInstance = this.terminals[id];
    if (!terminalInstance) return;
    if (terminalInstance.sshConnectionId) {
      try {
        await window.api.disconnectSSH(terminalInstance.sshConnectionId);
        delete this.sshConnections[terminalInstance.sshConnectionId];
        terminalInstance.sshConnectionId = null;
      } catch (error) {
        console.error('SSH bağlantısı kapatılamadı:', error);
      }
    }
    terminalInstance.terminal.clear();
    await this.initSSHConnection(id);
  }
} 