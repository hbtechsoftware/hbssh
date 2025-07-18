const { spawn } = require('child_process');
const os = require('os');

class LocalTerminal {
  constructor() {
    this.processes = new Map();
    this.processCounter = 0;
  }

  /**
   * Spawns a new local terminal process
   * @param {Object} options - Terminal options
   * @param {string} options.shell - Shell to use (optional, defaults to system default)
   * @param {string} options.cwd - Working directory (optional, defaults to home directory)
   * @param {Object} options.env - Environment variables (optional, defaults to process.env)
   * @param {number} options.cols - Terminal columns (optional, defaults to 80)
   * @param {number} options.rows - Terminal rows (optional, defaults to 24)
   * @returns {Object} Terminal process info
   */
  spawn(options = {}) {
    const terminalId = `local-terminal-${++this.processCounter}`;
    
    // Determine shell based on platform
    let shell;
    if (options.shell) {
      shell = options.shell;
    } else {
      switch (os.platform()) {
        case 'win32':
          shell = process.env.ComSpec || 'cmd.exe';
          break;
        case 'darwin':
        case 'linux':
          shell = process.env.SHELL || '/bin/bash';
          break;
        default:
          shell = '/bin/sh';
      }
    }

    // Set up environment
    const env = {
      ...process.env,
      ...options.env,
      TERM: 'xterm-256color',
      COLUMNS: (options.cols || 80).toString(),
      LINES: (options.rows || 24).toString(),
      PS1: '\\u@\\h:\\w\\$ ', // Standard bash prompt
      FORCE_COLOR: '1'
    };

    // Create a shell wrapper script for better interaction
    let shellCommand, shellArgs;
    if (os.platform() === 'win32') {
      shellCommand = process.env.ComSpec || 'cmd.exe';
      shellArgs = [];
    } else {
      // Use script command to create a proper PTY-like environment
      shellCommand = 'script';
      shellArgs = ['-q', '/dev/null', shell];
    }
    
    const child = spawn(shellCommand, shellArgs, {
      cwd: options.cwd || os.homedir(),
      env: env,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Store process info
    this.processes.set(terminalId, {
      process: child,
      shell: shell,
      cwd: options.cwd || os.homedir(),
      cols: options.cols || 80,
      rows: options.rows || 24
    });

    return {
      success: true,
      terminalId: terminalId,
      pid: child.pid
    };
  }

  /**
   * Writes data to a terminal process
   * @param {string} terminalId - Terminal ID
   * @param {string} data - Data to write
   * @returns {Object} Operation result
   */
  write(terminalId, data) {
    const terminalInfo = this.processes.get(terminalId);
    if (!terminalInfo) {
      return { success: false, error: 'Terminal not found' };
    }

    try {
      terminalInfo.process.stdin.write(data);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Resizes a terminal process
   * @param {string} terminalId - Terminal ID
   * @param {number} cols - Number of columns
   * @param {number} rows - Number of rows
   * @returns {Object} Operation result
   */
  resize(terminalId, cols, rows) {
    const terminalInfo = this.processes.get(terminalId);
    if (!terminalInfo) {
      return { success: false, error: 'Terminal not found' };
    }

    try {
      // Update stored dimensions
      terminalInfo.cols = cols;
      terminalInfo.rows = rows;
      
      // Send resize signal to process if supported
      if (terminalInfo.process.kill && !terminalInfo.process.killed) {
        process.kill(terminalInfo.process.pid, 'SIGWINCH');
      }
      
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Kills a terminal process
   * @param {string} terminalId - Terminal ID
   * @returns {Object} Operation result
   */
  kill(terminalId) {
    const terminalInfo = this.processes.get(terminalId);
    if (!terminalInfo) {
      return { success: false, error: 'Terminal not found' };
    }

    try {
      terminalInfo.process.kill();
      this.processes.delete(terminalId);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Gets terminal process info
   * @param {string} terminalId - Terminal ID
   * @returns {Object|null} Terminal info or null if not found
   */
  getTerminalInfo(terminalId) {
    return this.processes.get(terminalId) || null;
  }

  /**
   * Gets all active terminal IDs
   * @returns {Array<string>} Array of terminal IDs
   */
  getActiveTerminals() {
    return Array.from(this.processes.keys());
  }

  /**
   * Cleanup all terminals
   */
  cleanup() {
    for (const [terminalId, terminalInfo] of this.processes) {
      try {
        terminalInfo.process.kill();
      } catch (error) {
        console.error(`Error killing terminal ${terminalId}:`, error);
      }
    }
    this.processes.clear();
  }
}

module.exports = LocalTerminal;