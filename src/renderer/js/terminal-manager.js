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
   * Writes data received from the SSH connection to the corresponding terminal.
   * @param {string} connectionId - The SSH connection ID.
   * @param {string} data - The data from the SSH server.
   */
  handleSSHData(connectionId, data) {
    const terminalId = this.sshConnections[connectionId];
    if (!terminalId) return;
    const terminalInstance = this.terminals[terminalId];
    if (!terminalInstance) return;
    terminalInstance.terminal.write(data);
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
      if (this.activeTerminalId === id) {
        this.activeTerminalId = null;
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