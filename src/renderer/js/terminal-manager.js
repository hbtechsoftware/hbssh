/**
 * Manages terminal instances and SSH connections.
 * Provides an XTerm.js-based terminal interface, opens and closes SSH connections, and handles reconnection processes.
 */
export class TerminalManager {
  /**
   * Initializes the TerminalManager instance. Creates all terminal and connection structures, registers event listeners.
   */
  constructor() {
    /** @type {Object<string, Object>} Stores all terminal instances by ID. */
    this.terminals = {};
    /** @type {string|null} The ID of the active terminal. */
    this.activeTerminalId = null;
    /** @type {Object<string, string>} Mapping from SSH connection ID to terminal ID. */
    this.sshConnections = {};
    /** @type {Object<string, number>} Reconnection timers for each terminal. */
    this.reconnectTimers = {};
    /** @type {Object<string, number>} Reconnection attempt counter for each terminal. */
    this.reconnectAttempts = {};
    /** @type {number} Maximum reconnection attempts. */
    this.MAX_RECONNECT_ATTEMPTS = 5;
    /** @type {number} Reconnection interval (ms). */
    this.RECONNECT_INTERVAL = 3000;
    
    /** @type {Object<string, Array<string>>} Command history for each terminal. */
    this.commandHistory = {};
    /** @type {Object<string, number>} Current history position for each terminal. */
    this.historyPosition = {};
    /** @type {Object<string, string>} Current command being typed for each terminal. */
    this.currentCommand = {};
    /** @type {Object<string, string>} Current line buffer for each terminal. */
    this.currentLine = {};
    /** @type {Array<string>} Common commands for auto-completion. */
    this.commonCommands = [
      'ls', 'cd', 'pwd', 'mkdir', 'rmdir', 'rm', 'cp', 'mv', 'cat', 'grep', 'find', 'chmod', 'chown',
      'ps', 'kill', 'top', 'htop', 'df', 'du', 'free', 'uname', 'whoami', 'id', 'groups',
      'ssh', 'scp', 'rsync', 'wget', 'curl', 'ping', 'netstat', 'ss', 'iptables',
      'vim', 'nano', 'emacs', 'less', 'more', 'head', 'tail', 'sort', 'uniq', 'wc',
      'tar', 'gzip', 'gunzip', 'zip', 'unzip', 'systemctl', 'service', 'mount', 'umount',
      'history', 'alias', 'which', 'whereis', 'locate', 'updatedb', 'crontab', 'jobs'
    ];
    /** @type {HTMLElement|null} Auto-completion suggestion box. */
    this.suggestionBox = null;
    /** @type {Object} Terminal enhancement settings. */
    this.enhancementSettings = {
      enablePromptStyling: true,
      enableOutputHighlighting: true,
      enableEmojis: false,
      enableAnimations: false
    };
    
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
    this.handleCommandHistory = this.handleCommandHistory.bind(this);
    this.handleAutoCompletion = this.handleAutoCompletion.bind(this);
    this.showSuggestions = this.showSuggestions.bind(this);
    this.hideSuggestions = this.hideSuggestions.bind(this);
    
    window.addEventListener('resize', this.handleResize);
    window.api.onSSHData(this.handleSSHData);
    window.api.onSSHClose(this.handleSSHClose);
    window.api.onSSHError(this.handleSSHError);
    document.addEventListener('keydown', this.handleKeyboardEvent);
  }
  
  /**
   * Handles keyboard shortcuts (copy/paste).
   * @param {KeyboardEvent} event - The keyboard event.
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
   * Copies the selected text in the active terminal to the clipboard.
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
        console.error('Failed to copy to clipboard:', error);
      }
    }
  }
  
  /**
   * Pastes text from the clipboard to the active terminal.
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
      console.error('Failed to paste from clipboard:', error);
    }
  }
  
  /**
   * Creates a new terminal instance and initiates an SSH connection.
   * @param {Object} connection - The connection configuration object.
   * @param {string} tabId - The ID of the tab to which the terminal belongs.
   * @returns {Promise<Object|null>} The terminal instance, or null in case of an error.
   */
  async createTerminal(connection, tabId) {
    const id = tabId || `tab-${Date.now()}-${Object.keys(this.terminals).length}`;
    const terminalElement = document.getElementById(`terminal-${id}`);
    if (!terminalElement) {
      console.error(`Terminal element not found: terminal-${id}`);
      return null;
    }
    // Tema ayarlarını al
    const themeConfig = window.themeManager ? window.themeManager.themeConfigs[window.themeManager.currentTheme] : null;
    const settings = window.themeManager ? window.themeManager.settings : {};
    
    const terminal = new window.Terminal({
      cursorBlink: true,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: settings.fontSize || 14,
      cursorStyle: settings.cursorStyle || 'block',
      theme: themeConfig ? themeConfig.terminal : {
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
    
    // Terminal element'ine tema sınıfını ekle
    if (window.themeManager) {
      terminalElement.classList.add(window.themeManager.currentTheme + '-theme');
      terminalElement.style.opacity = window.themeManager.settings.terminalOpacity || 0.9;
      
      // Terminal instance'ı global tema ayarlarına bağla
      terminalElement.classList.add('terminal-instance');
    }
    this.terminals[id] = {
      terminal,
      fitAddon,
      connection,
      sshConnectionId: null,
      buffer: [],
      reconnecting: false
    };
    
    this.commandHistory[id] = [];
    this.historyPosition[id] = -1;
    this.currentCommand[id] = '';
    this.currentLine[id] = '';
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
   * Initiates or reconnects an SSH connection for the specified terminal ID.
   * @param {string} id - The terminal ID.
   * @param {boolean} [isReconnect=false] - Is this a reconnection attempt?
   */
  async initSSHConnection(id, isReconnect = false) {
    const terminalInstance = this.terminals[id];
    if (!terminalInstance) return;
    const { terminal, connection } = terminalInstance;
    if (isReconnect) {
      terminal.writeln('\r\nConnection lost. Reconnecting...');
      terminalInstance.reconnecting = true;
    } else {
      terminal.writeln('Connecting to SSH server...');
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
          terminal.writeln('\r\nReconnected to server.');
          terminalInstance.reconnecting = false;
        }
        this.fitTerminal(id);
        const dimensions = this.getTerminalDimensions(id);
        if (dimensions) {
          await window.api.resizeSSH(result.connectionId, dimensions.cols, dimensions.rows);
        }
      } else {
        terminal.writeln(`\r\nConnection failed: ${result.error}`);
        this.scheduleReconnect(id);
      }
    } catch (error) {
      terminal.writeln(`\r\nConnection error: ${error.message}`);
      this.scheduleReconnect(id);
    }
  }
  
  /**
   * Schedules a reconnection attempt for the specified terminal.
   * @param {string} id - The terminal ID.
   */
  scheduleReconnect(id) {
    const terminalInstance = this.terminals[id];
    if (!terminalInstance) return;
    if (this.reconnectAttempts[id] === undefined) {
      this.reconnectAttempts[id] = 0;
    }
    this.reconnectAttempts[id]++;
    if (this.reconnectAttempts[id] > this.MAX_RECONNECT_ATTEMPTS) {
      terminalInstance.terminal.writeln(`\r\nFailed to reconnect after ${this.MAX_RECONNECT_ATTEMPTS} attempts.`);
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
    terminalInstance.terminal.writeln(`\r\nReconnecting in ${this.RECONNECT_INTERVAL / 1000} seconds... (Attempt ${this.reconnectAttempts[id]} / ${this.MAX_RECONNECT_ATTEMPTS})`);
  }
  
  /**
   * Handles user input from the terminal and forwards it to the SSH connection.
   * @param {string} id - The terminal ID.
   * @param {string} data - The data from the user.
   */
  async handleTerminalInput(id, data) {
    const terminalInstance = this.terminals[id];
    if (!terminalInstance) return;
    
    const keyCode = data.charCodeAt(0);
    
    if (keyCode === 9) {
      console.log('⌨️ Tab tuşuna basıldı, auto-completion başlatılıyor');
      
      // Mevcut satırı kontrol et
      const currentLine = this.currentLine[id] || '';
      console.log(`🔍 AutoComplete: id=${id}, line="${currentLine}"`);
      
      // Eğer hiç komut yazılmamışsa veya sadece boşluk varsa, shell'e tab gönder
      if (!currentLine || currentLine.trim() === '') {
        console.log('💨 Boş satır - tab karakterini shell\'e gönder');
        if (terminalInstance.sshConnectionId) {
          await window.api.writeSSH(terminalInstance.sshConnectionId, '\t');
        }
        return;
      }
      
      const words = currentLine.trim().split(/\s+/);
      const firstWord = words[0];
      
      // Eğer sadece komut adı yazılıyorsa (tek kelime), kendi sistemimizi kullan
      if (words.length === 1) {
        console.log('🎯 Komut adı tamamlanıyor, kendi sistemimizi kullan');
        this.handleAutoCompletion(id);
        return;
      }
      
      // Eğer komut + argüman varsa (dosya/klasör adı), shell'e tab gönder
      console.log('📁 Dosya/klasör adı tamamlanıyor, tab karakterini shell\'e gönder');
      if (terminalInstance.sshConnectionId) {
        await window.api.writeSSH(terminalInstance.sshConnectionId, '\t');
      }
      return;
    }
    
    if (keyCode === 27) {
      const nextChar = data.length > 1 ? data.charCodeAt(1) : null;
      if (nextChar === 91) {
        const arrowKey = data.length > 2 ? data.charCodeAt(2) : null;
        if (arrowKey === 65) {
          this.handleCommandHistory(id, 'up');
          return;
        } else if (arrowKey === 66) {
          this.handleCommandHistory(id, 'down');
          return;
        }
      }
    }
    
    if (keyCode === 13) {
      const command = this.cleanCommand(this.currentLine[id]);
      if (command && command.length > 0) {
        this.addToHistory(id, command);
      }
      this.currentLine[id] = '';
      this.historyPosition[id] = -1;
      this.hideSuggestions();
      console.log('🔄 Enter tuşu: komut girişi tamamlandı, suggestion box gizlendi');
    } else if (keyCode === 127 || keyCode === 8) {
      this.currentLine[id] = this.currentLine[id].slice(0, -1);
      console.log(`⌫ Backspace: "${this.currentLine[id]}"`);
    } else if (keyCode >= 32 && keyCode <= 126) {
      this.currentLine[id] += data;
      console.log(`✏️ +${data}: "${this.currentLine[id]}"`);
    }
    
    if (!terminalInstance.sshConnectionId) {
      terminalInstance.buffer.push(data);
      return;
    }
    
    try {
      await window.api.writeSSH(terminalInstance.sshConnectionId, data);
    } catch (error) {
      console.error('Failed to send data to SSH connection:', error);
      terminalInstance.buffer.push(data);
    }
  }

  /**
   * Temizler komut metnini ANSI kodları ve özel karakterlerden arındırır.
   * @param {string} command - Ham komut metni.
   * @returns {string} Temizlenmiş komut metni.
   */
  cleanCommand(command) {
    if (!command) return '';
    
    // ANSI escape sequence'larını temizle
    let cleaned = command.replace(/\x1b\[[0-9;]*m/g, '');
    
    // Bracketed paste mode kodlarını temizle
    cleaned = cleaned.replace(/\x1b\[200~/g, '');
    cleaned = cleaned.replace(/\x1b\[201~/g, '');
    
    // Diğer escape sequence'ları temizle
    cleaned = cleaned.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
    
    // Control karakterleri temizle
    cleaned = cleaned.replace(/[\x00-\x1F\x7F]/g, '');
    
    // Prompt pattern'lerini temizle
    cleaned = cleaned.replace(/.*@.*:.*[\$#]\s*/, '');
    
    // Başlangıçtaki sayısal karakterleri temizle (2004h gibi)
    cleaned = cleaned.replace(/^\d+h?/, '');
    
    // Başlangıçtaki garip karakterleri temizle
    cleaned = cleaned.replace(/^[^\w\s\/\-\.]+/, '');
    
    return cleaned.trim();
  }
  
  /**
   * Writes data received from the SSH connection to the corresponding terminal.
   * @param {string} connectionId - The SSH connection ID.
   * @param {string} data - The data from the SSH server.
   */
  handleSSHData(connectionId, data) {
    const terminalId = this.sshConnections[connectionId];
    if (!terminalId) return;
    const terminalInstance = this.terminals[terminalId];
    if (!terminalInstance) return;
    
    const enhancedData = this.enhanceTerminalOutput(data);
    terminalInstance.terminal.write(enhancedData);
  }

  /**
   * Enhances terminal output with smart highlighting and styling.
   * @param {string} data - Raw terminal data.
   * @returns {string} Enhanced data with ANSI codes.
   */
  enhanceTerminalOutput(data) {
    if (!data || typeof data !== 'string') return data;
    
    let processed = data;
    
    // 1. Basit prompt renklendirme (user@host:directory$)
    if (this.enhancementSettings.enablePromptStyling) {
      processed = this.enhancePromptSimple(processed);
    }
    
    // 2. Temel komut renklendirme
    if (this.enhancementSettings.enableOutputHighlighting) {
      processed = this.enhanceOutputSimple(processed);
    }
    
    return processed;
  }

  /**
   * Basit prompt renklendirme
   */
  enhancePromptSimple(data) {
    let result = data;
    
    // user@host:directory$ formatını renklendir
    result = result.replace(/(\w+)@(\w+):([^$]+)\$/g, (match, user, host, directory) => {
      const colorUser = `\x1b[32m${user}\x1b[0m`;      // Yeşil kullanıcı
      const colorHost = `\x1b[36m${host}\x1b[0m`;      // Cyan host
      const colorDir = `\x1b[34m${directory}\x1b[0m`;  // Mavi dizin
      const colorPrompt = `\x1b[33m$\x1b[0m`;          // Sarı $
      
      return `${colorUser}@${colorHost}:${colorDir}${colorPrompt}`;
    });
    
    // user@host:directory# formatını renklendir
    result = result.replace(/(\w+)@(\w+):([^#]+)#/g, (match, user, host, directory) => {
      const colorUser = `\x1b[31m${user}\x1b[0m`;      // Kırmızı kullanıcı (root)
      const colorHost = `\x1b[36m${host}\x1b[0m`;      // Cyan host
      const colorDir = `\x1b[34m${directory}\x1b[0m`;  // Mavi dizin
      const colorPrompt = `\x1b[31m#\x1b[0m`;          // Kırmızı #
      
      return `${colorUser}@${colorHost}:${colorDir}${colorPrompt}`;
    });
    
    return result;
  }

  /**
   * Basit çıktı renklendirme
   */
  enhanceOutputSimple(data) {
    let result = data;
    
    // Temel komutları renklendir
    result = result.replace(/\b(ls|cd|pwd|mkdir|rm|cp|mv|cat|grep|find|chmod|chown|ps|top|free|df|du|kill|sudo|apt|yum|git|nano|vim|wget|curl|ssh|scp|tar|zip|unzip|systemctl|service)\b/g, 
      '\x1b[35m$1\x1b[0m'); // Magenta komutlar
    
    // Hata mesajları
    result = result.replace(/\b(error|failed|denied|invalid|not found|permission denied)\b/gi, 
      '\x1b[31m$1\x1b[0m'); // Kırmızı hatalar
    
    // Başarı mesajları
    result = result.replace(/\b(success|completed|done|ok|successful|running|active)\b/gi, 
      '\x1b[32m$1\x1b[0m'); // Yeşil başarı
    
    return result;
  }

  /**
   * Toggles terminal enhancement settings.
   * @param {string} setting - Setting name to toggle.
   */
  toggleEnhancement(setting) {
    if (this.enhancementSettings.hasOwnProperty(setting)) {
      this.enhancementSettings[setting] = !this.enhancementSettings[setting];
      console.log(`Terminal enhancement '${setting}' is now ${this.enhancementSettings[setting] ? 'enabled' : 'disabled'}`);
    }
  }

  /**
   * Enhances terminal prompt with beautiful styling.
   * @param {string} data - Terminal data.
   * @returns {string} Data with enhanced prompt.
   */
  enhancePrompt(data) {
    // Match common prompt patterns
    const promptPatterns = [
      // user@host:directory$
      /(\w+)@(\w+):([^$\s]+)\$/g,
      // user@host:directory#  
      /(\w+)@(\w+):([^#\s]+)#/g,
      // [user@host directory]$
      /\[(\w+)@(\w+)\s+([^\]]+)\]\$/g
    ];
    
    let result = data;
    
    promptPatterns.forEach(pattern => {
      result = result.replace(pattern, (match, user, host, directory) => {
        // Modern prompt styling with gradient-like colors
        const styledUser = `\x1b[38;5;118m${user}\x1b[0m`; // Modern bright green
        const styledHost = `\x1b[38;5;87m${host}\x1b[0m`; // Modern bright cyan
        const styledDir = this.styleDirectoryModern(directory); // Smart modern directory styling
        const styledPrompt = `\x1b[38;5;219m${match.slice(-1)}\x1b[0m`; // Modern pink for $ or #
        const styledAt = `\x1b[38;5;245m@\x1b[0m`; // Modern gray for @
        const styledColon = `\x1b[38;5;245m:\x1b[0m`; // Modern gray for :
        
        if (match.includes('[') && match.includes(']')) {
          return `\x1b[38;5;245m[\x1b[0m${styledUser}${styledAt}${styledHost} ${styledDir}\x1b[38;5;245m]\x1b[0m${styledPrompt}`;
        } else {
          return `${styledUser}${styledAt}${styledHost}${styledColon}${styledDir}${styledPrompt}`;
        }
      });
    });
    
    return result;
  }

  /**
   * Styles directory path with smart highlighting.
   * @param {string} directory - Directory path.
   * @returns {string} Styled directory path.
   */
  styleDirectory(directory) {
    if (!directory) return '';
    
    const emojis = this.enhancementSettings.enableEmojis;
    
    // Special directories
    if (directory === '~' || directory === '/root' || directory.endsWith('/home/' + directory.split('/').pop())) {
      return `\x1b[1;93m${emojis ? '🏠 ' : ''}${directory}\x1b[0m`; // Yellow home
    }
    
    if (directory === '/') {
      return `\x1b[1;91m${emojis ? '⚡ ' : ''}${directory}\x1b[0m`; // Red root
    }
    
    if (directory.includes('etc')) {
      return `\x1b[1;95m${emojis ? '⚙️  ' : ''}${directory}\x1b[0m`; // Magenta config
    }
    
    if (directory.includes('var') || directory.includes('log')) {
      return `\x1b[1;33m${emojis ? '📋 ' : ''}${directory}\x1b[0m`; // Yellow logs
    }
    
    if (directory.includes('.git') || directory.includes('git')) {
      return `\x1b[1;31m${emojis ? '🔥 ' : ''}${directory}\x1b[0m`; // Red git
    }
    
    if (directory.includes('nginx') || directory.includes('apache')) {
      return `\x1b[1;96m${emojis ? '🌐 ' : ''}${directory}\x1b[0m`; // Cyan web server
    }
    
    if (directory.includes('docker')) {
      return `\x1b[1;34m${emojis ? '🐳 ' : ''}${directory}\x1b[0m`; // Blue docker
    }
    
    if (directory.includes('tmp') || directory.includes('temp')) {
      return `\x1b[1;90m${emojis ? '🗑️  ' : ''}${directory}\x1b[0m`; // Gray temp
    }
    
    // Default directory styling
    return `\x1b[1;94m${emojis ? '📁 ' : ''}${directory}\x1b[0m`; // Blue folder
  }

  /**
   * Styles directory path with modern colors and smart highlighting.
   * @param {string} directory - Directory path.
   * @returns {string} Styled directory path with modern colors.
   */
  styleDirectoryModern(directory) {
    if (!directory) return '';
    
    const emojis = this.enhancementSettings.enableEmojis;
    
    // Special directories with modern colors
    if (directory === '~' || directory === '/root' || directory.endsWith('/home/' + directory.split('/').pop())) {
      return `\x1b[38;5;228m${emojis ? '🏠 ' : ''}${directory}\x1b[0m`; // Modern bright yellow
    }
    
    if (directory === '/') {
      return `\x1b[38;5;208m${emojis ? '⚡ ' : ''}${directory}\x1b[0m`; // Modern orange
    }
    
    if (directory.includes('etc')) {
      return `\x1b[38;5;177m${emojis ? '⚙️  ' : ''}${directory}\x1b[0m`; // Modern lavender
    }
    
    if (directory.includes('var') || directory.includes('log')) {
      return `\x1b[38;5;179m${emojis ? '📋 ' : ''}${directory}\x1b[0m`; // Modern tan
    }
    
    if (directory.includes('.git') || directory.includes('git')) {
      return `\x1b[38;5;204m${emojis ? '🔥 ' : ''}${directory}\x1b[0m`; // Modern coral
    }
    
    if (directory.includes('nginx') || directory.includes('apache')) {
      return `\x1b[38;5;123m${emojis ? '🌐 ' : ''}${directory}\x1b[0m`; // Modern aqua
    }
    
    if (directory.includes('docker')) {
      return `\x1b[38;5;117m${emojis ? '🐳 ' : ''}${directory}\x1b[0m`; // Modern sky blue
    }
    
    if (directory.includes('tmp') || directory.includes('temp')) {
      return `\x1b[38;5;243m${emojis ? '🗑️  ' : ''}${directory}\x1b[0m`; // Modern gray
    }
    
    if (directory.includes('opt') || directory.includes('usr')) {
      return `\x1b[38;5;147m${emojis ? '📦 ' : ''}${directory}\x1b[0m`; // Modern light purple
    }
    
    // Default directory styling with modern blue
    return `\x1b[38;5;111m${emojis ? '📁 ' : ''}${directory}\x1b[0m`; // Modern blue folder
  }

  /**
   * Enhances terminal output with smart element highlighting.
   * @param {string} data - Terminal data.
   * @returns {string} Enhanced output.
   */
  enhanceOutput(data) {
    let result = data;
    const emojis = this.enhancementSettings.enableEmojis;
    
    // 1. IP Addresses - Modern cyan
    result = result.replace(/\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/g, 
      `\x1b[38;5;81m${emojis ? '🌐 ' : ''}$1\x1b[0m`);
    
    // 2. URLs - Modern blue
    result = result.replace(/(https?:\/\/[^\s]+)/g, 
      `\x1b[38;5;75m${emojis ? '🔗 ' : ''}$1\x1b[0m`);
    
    // 3. File paths - Modern purple
    result = result.replace(/(\/[\w\.\-\/]+)/g, 
      '\x1b[38;5;141m$1\x1b[0m');
    
    // 4. Error messages - Modern red
    result = result.replace(/(error|failed|denied|invalid|not found|permission denied)/gi, 
      `\x1b[38;5;196m${emojis ? '❌ ' : ''}$1\x1b[0m`);
    
    // 5. Success messages - Modern green
    result = result.replace(/(success|completed|done|ok|successful|connected|running)/gi, 
      `\x1b[38;5;46m${emojis ? '✅ ' : ''}$1\x1b[0m`);
    
    // 6. Warnings - Modern yellow
    result = result.replace(/(warning|warn|critical|caution)/gi, 
      `\x1b[38;5;226m${emojis ? '⚠️  ' : ''}$1\x1b[0m`);
    
    // 7. Numbers and sizes - Modern orange
    result = result.replace(/\b(\d+(?:\.\d+)?(?:[KMGT]B?)?)\b/g, 
      `\x1b[38;5;214m${emojis ? '💎 ' : ''}$1\x1b[0m`);
    
    // 8. Ports - Modern magenta
    result = result.replace(/:(\d{2,5})\b/g, 
      `:\x1b[38;5;207m${emojis ? '🔌 ' : ''}$1\x1b[0m`);
    
    // 9. File permissions - Modern gray
    result = result.replace(/([r-][w-][x-]){3}/g, 
      `\x1b[38;5;244m${emojis ? '🔐 ' : ''}$&\x1b[0m`);
    
    // 10. Process names - Modern teal
    result = result.replace(/\b(nginx|apache|mysql|postgres|redis|docker|ssh|systemd|cron)\b/gi, 
      `\x1b[38;5;73m${emojis ? '⚙️ ' : ''}$1\x1b[0m`);
    
    // 11. Git branches - Modern pink
    result = result.replace(/\b(main|master|develop|dev|feature\/[\w-]+)\b/g, 
      `\x1b[38;5;213m${emojis ? '🔀 ' : ''}$1\x1b[0m`);
    
    // 12. Time/Date - Modern light blue
    result = result.replace(/\b(\d{2}:\d{2}:\d{2}|\d{4}-\d{2}-\d{2})/g, 
      `\x1b[38;5;117m${emojis ? '⏰ ' : ''}$1\x1b[0m`);
    
    // 13. Status indicators - Modern colors
    result = result.replace(/\b(active|enabled|started|online)\b/gi, 
      `\x1b[38;5;82m${emojis ? '🟢 ' : ''}$1\x1b[0m`);
    
    result = result.replace(/\b(inactive|disabled|stopped|offline)\b/gi, 
      `\x1b[38;5;203m${emojis ? '🔴 ' : ''}$1\x1b[0m`);
    
    // 14. Commands - Modern light green
    result = result.replace(/\b(ls|cd|pwd|mkdir|rm|cp|mv|cat|grep|find|ps|top|htop|free|df|du|kill|chmod|chown|sudo|apt|yum|systemctl|service|git|npm|node|python|java|docker|curl|wget|ssh|scp|rsync|tar|zip|unzip)\b/g, 
      `\x1b[38;5;155m$1\x1b[0m`);
    
    // 15. Email addresses - Modern indigo
    result = result.replace(/\b[\w\.-]+@[\w\.-]+\.\w+\b/g, 
      `\x1b[38;5;99m${emojis ? '📧 ' : ''}$&\x1b[0m`);
    
    // 16. Memory/CPU percentages - Modern gradient-like
    result = result.replace(/(\d+(?:\.\d+)?)\s*%/g, 
      `\x1b[38;5;220m${emojis ? '📊 ' : ''}$1%\x1b[0m`);
    
    return result;
  }
  
  /**
   * Informs the respective terminal when an SSH connection is closed and initiates reconnection.
   * @param {string} connectionId - The SSH connection ID.
   */
  handleSSHClose(connectionId) {
    const terminalId = this.sshConnections[connectionId];
    if (!terminalId) return;
    const terminalInstance = this.terminals[terminalId];
    if (!terminalInstance) return;
    terminalInstance.sshConnectionId = null;
    delete this.sshConnections[connectionId];
    terminalInstance.terminal.writeln('\r\nConnection closed by remote server.');
    this.scheduleReconnect(terminalId);
  }
  
  /**
   * Displays an SSH connection error in the terminal.
   * @param {string} connectionId - The SSH connection ID.
   * @param {string} error - The error message.
   */
  handleSSHError(connectionId, error) {
    const terminalId = this.sshConnections[connectionId];
    if (!terminalId) return;
    const terminalInstance = this.terminals[terminalId];
    if (!terminalInstance) return;
    terminalInstance.terminal.writeln(`\r\nConnection error: ${error}`);
  }
  
  /**
   * Adds a command to the history for the specified terminal.
   * @param {string} id - The terminal ID.
   * @param {string} command - The command to add to history.
   */
  addToHistory(id, command) {
    if (!this.commandHistory[id]) {
      this.commandHistory[id] = [];
    }
    
    const cleanedCommand = this.cleanCommand(command);
    if (cleanedCommand && cleanedCommand.length > 0) {
      if (this.commandHistory[id][this.commandHistory[id].length - 1] !== cleanedCommand) {
        this.commandHistory[id].push(cleanedCommand);
        if (this.commandHistory[id].length > 100) {
          this.commandHistory[id].shift();
        }
      }
    }
  }

  /**
   * Handles command history navigation with arrow keys.
   * @param {string} id - The terminal ID.
   * @param {string} direction - 'up' or 'down'.
   */
  async handleCommandHistory(id, direction) {
    const terminalInstance = this.terminals[id];
    if (!terminalInstance || !terminalInstance.sshConnectionId) return;
    
    const history = this.commandHistory[id] || [];
    if (history.length === 0) return;
    
    if (direction === 'up') {
      if (this.historyPosition[id] === -1) {
        this.currentCommand[id] = this.cleanCommand(this.currentLine[id]);
        this.historyPosition[id] = history.length - 1;
      } else if (this.historyPosition[id] > 0) {
        this.historyPosition[id]--;
      }
    } else if (direction === 'down') {
      if (this.historyPosition[id] >= 0 && this.historyPosition[id] < history.length - 1) {
        this.historyPosition[id]++;
      } else if (this.historyPosition[id] === history.length - 1) {
        this.historyPosition[id] = -1;
      }
    }
    
    let newCommand = '';
    if (this.historyPosition[id] === -1) {
      newCommand = this.currentCommand[id];
    } else {
      newCommand = this.cleanCommand(history[this.historyPosition[id]]);
    }
    
    // Mevcut satırı tamamen temizle
    const currentLineLength = this.currentLine[id].length;
    if (currentLineLength > 0) {
      await window.api.writeSSH(terminalInstance.sshConnectionId, '\b'.repeat(currentLineLength));
      await window.api.writeSSH(terminalInstance.sshConnectionId, ' '.repeat(currentLineLength));
      await window.api.writeSSH(terminalInstance.sshConnectionId, '\b'.repeat(currentLineLength));
    }
    
    // Temizlenmiş komutu set et
    this.currentLine[id] = newCommand;
    if (newCommand.length > 0) {
      await window.api.writeSSH(terminalInstance.sshConnectionId, newCommand);
    }
  }

  /**
   * Handles auto-completion when Tab key is pressed.
   * @param {string} id - The terminal ID.
   */
  async handleAutoCompletion(id) {
    const terminalInstance = this.terminals[id];
    if (!terminalInstance || !terminalInstance.sshConnectionId) return;
    
    const currentLine = this.currentLine[id] || '';
    console.log(`🔍 AutoComplete: id=${id}, line="${currentLine}"`);
    
    if (!currentLine) {
      console.log('❌ CurrentLine boş, auto-completion iptal');
      return;
    }
    
    const words = currentLine.split(' ');
    const lastWord = words[words.length - 1];
    
    console.log(`📝 LastWord: "${lastWord}"`);
    
    if (lastWord.length === 0) {
      console.log('❌ Son kelime boş, auto-completion iptal');
      return;
    }
    
    const matches = this.commonCommands.filter(cmd => 
      cmd.toLowerCase().startsWith(lastWord.toLowerCase())
    );
    
    console.log(`🎯 Matches (${matches.length}):`, matches.slice(0, 5));
    
    if (matches.length === 1) {
      const completion = matches[0].substring(lastWord.length);
      this.currentLine[id] += completion;
      await window.api.writeSSH(terminalInstance.sshConnectionId, completion);
    } else if (matches.length > 1) {
      const commonPrefix = this.findCommonPrefix(matches, lastWord);
      if (commonPrefix && commonPrefix.length > lastWord.length) {
        const completion = commonPrefix.substring(lastWord.length);
        this.currentLine[id] += completion;
        await window.api.writeSSH(terminalInstance.sshConnectionId, completion);
        
        const remainingMatches = this.commonCommands.filter(cmd => 
          cmd.toLowerCase().startsWith(commonPrefix.toLowerCase())
        );
        if (remainingMatches.length > 1) {
          setTimeout(() => {
            this.showSuggestions(id, remainingMatches, commonPrefix);
          }, 100);
        }
      } else {
        this.showSuggestions(id, matches, lastWord);
      }
    }
  }

  /**
   * Finds the common prefix among matches.
   * @param {Array<string>} matches - Array of matching commands.
   * @param {string} partial - The partial text typed.
   * @returns {string} The common prefix.
   */
  findCommonPrefix(matches, partial) {
    if (matches.length === 0) return partial;
    if (matches.length === 1) return matches[0];
    
    let prefix = matches[0].toLowerCase();
    for (let i = 1; i < matches.length; i++) {
      const match = matches[i].toLowerCase();
      let j = 0;
      while (j < prefix.length && j < match.length && prefix[j] === match[j]) {
        j++;
      }
      prefix = prefix.substring(0, j);
      if (prefix.length <= partial.length) break;
    }
    
    return prefix.length > partial.length ? prefix : partial;
  }

  /**
   * Shows auto-completion suggestions in a popup.
   * @param {string} id - The terminal ID.
   * @param {Array<string>} suggestions - Array of suggestions.
   * @param {string} partial - The partial command being typed.
   */
  showSuggestions(id, suggestions, partial) {
    this.hideSuggestions();
    
    const terminalElement = document.getElementById(`terminal-${id}`);
    if (!terminalElement) return;
    
    const suggestionBox = document.createElement('div');
    suggestionBox.className = 'terminal-suggestions';
    
    const commandDescriptions = {
      'ls': 'dosya ve klasörleri listele',
      'cd': 'klasör değiştir',
      'pwd': 'mevcut konumu göster',
      'mkdir': 'klasör oluştur',
      'rm': 'dosya sil',
      'cp': 'dosya kopyala',
      'mv': 'dosya taşı/yeniden adlandır',
      'cat': 'dosya içeriğini göster',
      'grep': 'metin ara',
      'find': 'dosya bul',
      'chmod': 'dosya izinlerini değiştir',
      'ps': 'çalışan süreçleri göster',
      'kill': 'süreç sonlandır',
      'top': 'sistem izleyici',
      'df': 'disk kullanımı',
      'free': 'bellek kullanımı',
      'ssh': 'uzak sunucuya bağlan',
      'wget': 'dosya indir',
      'curl': 'web isteği gönder',
      'ping': 'ağ bağlantısını test et',
      'vim': 'metin editörü',
      'nano': 'basit metin editörü',
      'tar': 'arşiv oluştur/aç',
      'systemctl': 'sistem servislerini yönet'
    };
    
    suggestionBox.innerHTML = `
      <div class="suggestions-header">📝 Komut Önerileri (${suggestions.length})</div>
      ${suggestions.slice(0, 8).map(suggestion => {
        const highlightedCommand = this.highlightPartialMatch(suggestion, partial);
        const description = commandDescriptions[suggestion] || 'sistem komutu';
        return `
          <div class="suggestion-item" data-suggestion="${suggestion}">
            <div class="suggestion-main">
              <span class="suggestion-command">${highlightedCommand}</span>
              <span class="suggestion-desc">${description}</span>
            </div>
            <span class="suggestion-key">Tab</span>
          </div>
        `;
      }).join('')}
      ${suggestions.length > 8 ? `<div class="suggestions-more">+${suggestions.length - 8} komut daha...</div>` : ''}
    `;
    
    suggestionBox.addEventListener('click', (e) => {
      const suggestionItem = e.target.closest('.suggestion-item');
      if (suggestionItem) {
        const suggestion = suggestionItem.dataset.suggestion;
        this.applySuggestion(id, suggestion, partial);
      }
    });
    
    terminalElement.appendChild(suggestionBox);
    this.suggestionBox = suggestionBox;
    
    setTimeout(() => {
      this.hideSuggestions();
    }, 8000);
  }

  /**
   * Highlights the matching part in a command suggestion.
   * @param {string} command - The full command.
   * @param {string} partial - The partial text typed by user.
   * @returns {string} HTML with highlighted matching part.
   */
  highlightPartialMatch(command, partial) {
    if (!partial || partial.length === 0) {
      return command;
    }
    
    const matchIndex = command.toLowerCase().indexOf(partial.toLowerCase());
    if (matchIndex === -1) {
      return command;
    }
    
    const before = command.substring(0, matchIndex);
    const match = command.substring(matchIndex, matchIndex + partial.length);
    const after = command.substring(matchIndex + partial.length);
    
    return `${before}<span class="highlight-match">${match}</span>${after}`;
  }

  /**
   * Applies a selected suggestion to the terminal.
   * @param {string} id - The terminal ID.
   * @param {string} suggestion - The selected suggestion.
   * @param {string} partial - The partial command to replace.
   */
  async applySuggestion(id, suggestion, partial) {
    const terminalInstance = this.terminals[id];
    if (!terminalInstance || !terminalInstance.sshConnectionId) return;
    
    const completion = suggestion.substring(partial.length);
    this.currentLine[id] = this.currentLine[id].slice(0, -partial.length) + suggestion;
    
    await window.api.writeSSH(terminalInstance.sshConnectionId, '\b'.repeat(partial.length));
    await window.api.writeSSH(terminalInstance.sshConnectionId, suggestion);
    
    this.hideSuggestions();
  }

  /**
   * Hides the auto-completion suggestions popup.
   */
  hideSuggestions() {
    if (this.suggestionBox) {
      this.suggestionBox.remove();
      this.suggestionBox = null;
    }
    
    // Tüm terminal-suggestions elementlerini kaldır (güvenlik için)
    const allSuggestions = document.querySelectorAll('.terminal-suggestions');
    allSuggestions.forEach(element => {
      element.remove();
    });
  }

  /**
   * Returns the current dimensions (columns and rows) of the terminal.
   * @param {string} id - The terminal ID.
   * @returns {{cols: number, rows: number}} The dimensions of the terminal.
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
   * Closes a terminal instance and terminates its SSH connection.
   * @param {string} id - The ID of the terminal to close.
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
          console.error('Failed to close SSH connection:', error);
        }
      }
      terminalInstance.terminal.dispose();
      delete this.terminals[id];
      
      delete this.commandHistory[id];
      delete this.historyPosition[id];
      delete this.currentCommand[id];
      delete this.currentLine[id];
      
      if (this.activeTerminalId === id) {
        this.activeTerminalId = null;
        this.hideSuggestions();
      }
    }
  }
  
  /**
   * Sets the active terminal and fits it to its container.
   * @param {string} id - The ID of the terminal to make active.
   */
  setActiveTerminal(id) {
    this.activeTerminalId = id;
    this.fitTerminal(id);
  }
  
  /**
   * Fits the terminal to its container and notifies the SSH connection of the new dimensions.
   * @param {string} id - The terminal ID.
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
        console.error('Failed to fit terminal:', error);
      }
    }
  }
  
  /**
   * Fits the active terminal when the window is resized.
   */
  handleResize() {
    if (this.activeTerminalId) {
      this.fitTerminal(this.activeTerminalId);
    }
  }
  
  /**
   * Returns the active terminal instance.
   * @returns {Object|null} The active terminal instance, or null if none exists.
   */
  getActiveTerminal() {
    if (!this.activeTerminalId) return null;
    return this.terminals[this.activeTerminalId] || null;
  }
  
  /**
   * Reloads (reconnects) a terminal session.
   * @param {string} id - The ID of the terminal to reload.
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
        console.error('Failed to close SSH connection:', error);
      }
    }
    terminalInstance.terminal.clear();
    await this.initSSHConnection(id);
  }
} 