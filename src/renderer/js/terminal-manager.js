// Import XTerm.js - using the global variables exposed by the script tag in index.html
/**
 * Manages terminal instances and SSH connections
 */
export class TerminalManager {
  constructor() {
    this.terminals = {};
    this.activeTerminalId = null;
    this.sshConnections = {};
    this.reconnectTimers = {};
    this.reconnectAttempts = {};
    this.MAX_RECONNECT_ATTEMPTS = 5;
    this.RECONNECT_INTERVAL = 3000; // 3 seconds
    
    // Bind methods
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
    
    // Listen for window resize events
    window.addEventListener('resize', this.handleResize);
    
    // Set up SSH event listeners
    window.api.onSSHData(this.handleSSHData);
    window.api.onSSHClose(this.handleSSHClose);
    window.api.onSSHError(this.handleSSHError);
    
    // Set up keyboard event listeners
    document.addEventListener('keydown', this.handleKeyboardEvent);
  }
  
  /**
   * Handle keyboard events for copy/paste
   * @param {KeyboardEvent} event - Keyboard event
   */
  handleKeyboardEvent(event) {
    // Only process if we have an active terminal
    if (!this.activeTerminalId) return;
    
    // Get active terminal instance
    const terminalInstance = this.terminals[this.activeTerminalId];
    if (!terminalInstance) return;
    
    // Check for copy (Ctrl+C, Cmd+C)
    if ((event.ctrlKey || event.metaKey) && event.key === 'c') {
      // Check if there is a selection in the terminal
      if (terminalInstance.terminal.hasSelection()) {
        event.preventDefault();
        this.copySelectedText();
      }
    }
    
    // Check for paste (Ctrl+V, Cmd+V)
    if ((event.ctrlKey || event.metaKey) && event.key === 'v') {
      event.preventDefault();
      this.pasteText();
    }
  }
  
  /**
   * Copy selected text from the active terminal
   */
  async copySelectedText() {
    if (!this.activeTerminalId) return;
    
    const terminalInstance = this.terminals[this.activeTerminalId];
    if (!terminalInstance) return;
    
    // Get selected text from terminal
    const selectedText = terminalInstance.terminal.getSelection();
    
    // Copy to clipboard using the main process
    if (selectedText) {
      try {
        await window.api.writeClipboard(selectedText);
      } catch (error) {
        console.error('Failed to copy text to clipboard:', error);
      }
    }
  }
  
  /**
   * Paste text from clipboard to the active terminal
   */
  async pasteText() {
    if (!this.activeTerminalId) return;
    
    const terminalInstance = this.terminals[this.activeTerminalId];
    if (!terminalInstance || !terminalInstance.sshConnectionId) return;
    
    try {
      // Read from clipboard using the main process
      const text = await window.api.readClipboard();
      
      // Send clipboard content to SSH connection
      if (text) {
        await window.api.writeSSH(terminalInstance.sshConnectionId, text);
      }
    } catch (error) {
      console.error('Failed to paste text from clipboard:', error);
    }
  }
  
  /**
   * Create a new terminal instance
   * @param {Object} connection - Connection configuration
   * @param {string} tabId - Tab ID for the terminal
   * @returns {Object} Terminal instance
   */
  async createTerminal(connection, tabId) {
    // If no tab ID provided, use the connection name
    const id = tabId || `tab-${Date.now()}-${Object.keys(this.terminals).length}`;
    
    // Get the terminal container element
    const terminalElement = document.getElementById(`terminal-${id}`);
    if (!terminalElement) {
      console.error(`Terminal element not found for ID: terminal-${id}`);
      return null;
    }
    
    // Create XTerm.js terminal using the globally available Terminal constructor
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
      scrollback: 5000, // Increase scrollback buffer
      allowTransparency: true
    });
    
    // Create and load fit addon using the globally available FitAddon constructor
    const fitAddon = new window.FitAddon.FitAddon();
    terminal.loadAddon(fitAddon);
    
    // Open terminal in the container
    terminal.open(terminalElement);
    
    // Store terminal instance
    this.terminals[id] = {
      terminal,
      fitAddon,
      connection,
      sshConnectionId: null,
      buffer: [],
      reconnecting: false
    };
    
    // Set up terminal input handling
    terminal.onData((data) => {
      this.handleTerminalInput(id, data);
    });
    
    // Initialize SSH connection
    await this.initSSHConnection(id);
    
    // Set as active terminal
    this.setActiveTerminal(id);
    
    // Fit terminal to container
    setTimeout(() => {
      this.fitTerminal(id);
    }, 0);
    
    return this.terminals[id];
  }
  
  /**
   * Initialize SSH connection to a server
   * @param {string} id - Terminal ID
   * @param {boolean} isReconnect - Whether this is a reconnection attempt
   */
  async initSSHConnection(id, isReconnect = false) {
    const terminalInstance = this.terminals[id];
    if (!terminalInstance) return;
    
    const { terminal, connection } = terminalInstance;
    
    // If reconnecting, update status in the terminal
    if (isReconnect) {
      terminal.writeln('\r\nConnection lost. Reconnecting...');
      terminalInstance.reconnecting = true;
    } else {
      // Display connecting message
      terminal.writeln('Connecting to SSH server...');
    }
    
    try {
      // Connect to SSH server
      const result = await window.api.connectSSH(connection);
      
      if (result.success) {
        // Store SSH connection ID
        terminalInstance.sshConnectionId = result.connectionId;
        this.sshConnections[result.connectionId] = id;
        
        // Reset reconnect attempts
        this.reconnectAttempts[id] = 0;
        
        // Clear reconnection timer if any
        if (this.reconnectTimers[id]) {
          clearTimeout(this.reconnectTimers[id]);
          delete this.reconnectTimers[id];
        }
        
        // Update status in terminal if it was reconnecting
        if (terminalInstance.reconnecting) {
          terminal.writeln('\r\nReconnected to server.');
          terminalInstance.reconnecting = false;
        }
        
        // Fit terminal to container after connection is established
        this.fitTerminal(id);
        
        // Resize the terminal window on the server
        const dimensions = this.getTerminalDimensions(id);
        if (dimensions) {
          await window.api.resizeSSH(result.connectionId, dimensions.cols, dimensions.rows);
        }
      } else {
        // Connection failed
        terminal.writeln(`\r\nConnection failed: ${result.error}`);
        
        // Try to reconnect if appropriate
        this.scheduleReconnect(id);
      }
    } catch (error) {
      terminal.writeln(`\r\nConnection error: ${error.message}`);
      
      // Try to reconnect if appropriate
      this.scheduleReconnect(id);
    }
  }
  
  /**
   * Schedule a reconnection attempt
   * @param {string} id - Terminal ID
   */
  scheduleReconnect(id) {
    const terminalInstance = this.terminals[id];
    if (!terminalInstance) return;
    
    // Initialize reconnect attempts counter if not exists
    if (this.reconnectAttempts[id] === undefined) {
      this.reconnectAttempts[id] = 0;
    }
    
    // Increment reconnect attempts
    this.reconnectAttempts[id]++;
    
    // Check if max attempts reached
    if (this.reconnectAttempts[id] > this.MAX_RECONNECT_ATTEMPTS) {
      terminalInstance.terminal.writeln(`\r\nFailed to reconnect after ${this.MAX_RECONNECT_ATTEMPTS} attempts.`);
      return;
    }
    
    // Clear existing timer if any
    if (this.reconnectTimers[id]) {
      clearTimeout(this.reconnectTimers[id]);
    }
    
    // Schedule reconnection
    this.reconnectTimers[id] = setTimeout(() => {
      // If terminal still exists, attempt to reconnect
      if (this.terminals[id]) {
        this.initSSHConnection(id, true);
      } else {
        delete this.reconnectTimers[id];
        delete this.reconnectAttempts[id];
      }
    }, this.RECONNECT_INTERVAL);
    
    // Show reconnection status in terminal
    terminalInstance.terminal.writeln(`\r\nReconnecting in ${this.RECONNECT_INTERVAL / 1000} seconds... (Attempt ${this.reconnectAttempts[id]} of ${this.MAX_RECONNECT_ATTEMPTS})`);
  }
  
  /**
   * Handle terminal input
   * @param {string} id - Terminal ID
   * @param {string} data - Input data
   */
  async handleTerminalInput(id, data) {
    const terminalInstance = this.terminals[id];
    if (!terminalInstance) return;
    
    // If not connected, buffer the input
    if (!terminalInstance.sshConnectionId) {
      terminalInstance.buffer.push(data);
      return;
    }
    
    try {
      // Send data to SSH connection
      await window.api.writeSSH(terminalInstance.sshConnectionId, data);
    } catch (error) {
      console.error('Failed to send data to SSH connection:', error);
      
      // Buffer the input for later if there's an error
      terminalInstance.buffer.push(data);
    }
  }
  
  /**
   * Handle SSH data
   * @param {string} connectionId - SSH connection ID
   * @param {string} data - Data received from SSH server
   */
  handleSSHData(connectionId, data) {
    const terminalId = this.sshConnections[connectionId];
    if (!terminalId) return;
    
    const terminalInstance = this.terminals[terminalId];
    if (!terminalInstance) return;
    
    // Write data to terminal
    terminalInstance.terminal.write(data);
  }
  
  /**
   * Handle SSH close
   * @param {string} connectionId - SSH connection ID
   */
  handleSSHClose(connectionId) {
    const terminalId = this.sshConnections[connectionId];
    if (!terminalId) return;
    
    const terminalInstance = this.terminals[terminalId];
    if (!terminalInstance) return;
    
    // Remove SSH connection ID
    terminalInstance.sshConnectionId = null;
    delete this.sshConnections[connectionId];
    
    // Write message to terminal
    terminalInstance.terminal.writeln('\r\nConnection closed by remote server.');
    
    // Attempt to reconnect
    this.scheduleReconnect(terminalId);
  }
  
  /**
   * Handle SSH error
   * @param {string} connectionId - SSH connection ID
   * @param {string} error - Error message
   */
  handleSSHError(connectionId, error) {
    const terminalId = this.sshConnections[connectionId];
    if (!terminalId) return;
    
    const terminalInstance = this.terminals[terminalId];
    if (!terminalInstance) return;
    
    // Write error to terminal
    terminalInstance.terminal.writeln(`\r\nConnection error: ${error}`);
  }
  
  /**
   * Get terminal dimensions
   * @param {string} id - Terminal ID
   * @returns {Object|null} Object with cols and rows properties or null if terminal not found
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
      // Bu genellikle terminal.open() çağrılmadan veya terminal görünür olmadan önce olur.
      // Veya fitAddon henüz düzgün çalışmamış olabilir.
      return { cols: 80, rows: 24 }; 
    }
    return {
      cols: terminalInstance.terminal.cols,
      rows: terminalInstance.terminal.rows,
    };
  }
  
  /**
   * Close a terminal instance
   * @param {string} id - Terminal ID to close
   */
  async closeTerminal(id) {
    const terminalInstance = this.terminals[id];
    
    if (terminalInstance) {
      // Clear any reconnection timers
      if (this.reconnectTimers[id]) {
        clearTimeout(this.reconnectTimers[id]);
        delete this.reconnectTimers[id];
      }
      
      // Clear reconnection attempts
      delete this.reconnectAttempts[id];
      
      // Disconnect SSH if connected
      if (terminalInstance.sshConnectionId) {
        try {
          await window.api.disconnectSSH(terminalInstance.sshConnectionId);
          delete this.sshConnections[terminalInstance.sshConnectionId];
        } catch (error) {
          console.error('Failed to disconnect SSH:', error);
        }
      }
      
      // Close the terminal
      terminalInstance.terminal.dispose();
      
      // Remove from terminals object
      delete this.terminals[id];
      
      // If this was the active terminal, clear active terminal
      if (this.activeTerminalId === id) {
        this.activeTerminalId = null;
      }
    }
  }
  
  /**
   * Set active terminal
   * @param {string} id - Terminal ID to set as active
   */
  setActiveTerminal(id) {
    this.activeTerminalId = id;
    
    // Fit the terminal to its container
    this.fitTerminal(id);
  }
  
  /**
   * Fit terminal to its container
   * @param {string} id - Terminal ID to fit
   */
  fitTerminal(id) {
    const terminalInstance = this.terminals[id];
    
    if (terminalInstance && terminalInstance.fitAddon) {
      try {
        terminalInstance.fitAddon.fit();
        
        // If connected to SSH, resize the terminal window on the server
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
   * Handle window resize event
   */
  handleResize() {
    // Fit the active terminal
    if (this.activeTerminalId) {
      this.fitTerminal(this.activeTerminalId);
    }
  }
  
  /**
   * Get active terminal instance
   * @returns {Object|null} Active terminal instance or null if none active
   */
  getActiveTerminal() {
    if (!this.activeTerminalId) return null;
    return this.terminals[this.activeTerminalId] || null;
  }
  
  /**
   * Reload a terminal session (reconnect)
   * @param {string} id - Terminal ID to reload
   */
  async reloadTerminal(id) {
    const terminalInstance = this.terminals[id];
    if (!terminalInstance) return;
    
    // Disconnect current session if connected
    if (terminalInstance.sshConnectionId) {
      try {
        await window.api.disconnectSSH(terminalInstance.sshConnectionId);
        delete this.sshConnections[terminalInstance.sshConnectionId];
        terminalInstance.sshConnectionId = null;
      } catch (error) {
        console.error('Failed to disconnect SSH:', error);
      }
    }
    
    // Clear terminal
    terminalInstance.terminal.clear();
    
    // Reconnect
    await this.initSSHConnection(id);
  }
} 