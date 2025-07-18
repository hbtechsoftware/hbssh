const { spawn } = require('child_process');
const os = require('os');
const path = require('path');

class SimpleTerminal {
  constructor() {
    this.terminals = new Map();
    this.counter = 0;
  }

  create(options = {}) {
    const terminalId = `simple-terminal-${++this.counter}`;
    const cwd = options.cwd || os.homedir();
    
    const terminal = {
      id: terminalId,
      cwd: cwd,
      env: { ...process.env, ...options.env },
      history: [],
      onData: null,
      onExit: null
    };
    
    this.terminals.set(terminalId, terminal);
    
    // Send initial welcome message and prompt
    setTimeout(() => {
      this.sendOutput(terminalId, `Welcome to Simple Terminal\r\n`);
      this.sendOutput(terminalId, `Current directory: ${cwd}\r\n`);
      this.showPrompt(terminalId);
    }, 100);
    
    return {
      success: true,
      terminalId: terminalId,
      pid: process.pid
    };
  }

  sendOutput(terminalId, data) {
    const terminal = this.terminals.get(terminalId);
    if (terminal && terminal.onData) {
      terminal.onData(data);
    }
  }

  showPrompt(terminalId) {
    const terminal = this.terminals.get(terminalId);
    if (terminal) {
      const user = os.userInfo().username;
      const hostname = os.hostname();
      const currentDir = path.basename(terminal.cwd);
      // Colorful prompt - will be enhanced by terminal manager
      const prompt = `${user}@${hostname}:${currentDir}$ `;
      this.sendOutput(terminalId, prompt);
    }
  }

  async executeCommand(terminalId, command) {
    const terminal = this.terminals.get(terminalId);
    if (!terminal) return;

    const cmd = command.trim();
    if (!cmd) {
      this.showPrompt(terminalId);
      return;
    }

    terminal.history.push(cmd);

    // Handle built-in commands
    if (cmd === 'pwd') {
      this.sendOutput(terminalId, `${terminal.cwd}\r\n`);
      this.showPrompt(terminalId);
      return;
    }

    if (cmd === 'ls' || cmd.startsWith('ls ')) {
      const fs = require('fs');
      try {
        const files = fs.readdirSync(terminal.cwd);
        if (files.length > 0) {
          // Format files in columns
          const columns = 4;
          let formatted = '';
          for (let i = 0; i < files.length; i++) {
            if (i > 0 && i % columns === 0) {
              formatted += '\r\n';
            }
            formatted += files[i].padEnd(20);
          }
          formatted += '\r\n';
          this.sendOutput(terminalId, formatted);
        }
      } catch (error) {
        this.sendOutput(terminalId, `ls: cannot access '${terminal.cwd}': ${error.message}\r\n`);
      }
      this.showPrompt(terminalId);
      return;
    }

    if (cmd === 'clear') {
      this.sendOutput(terminalId, '\x1b[2J\x1b[H');
      this.showPrompt(terminalId);
      return;
    }

    if (cmd.startsWith('cd ')) {
      const newDir = cmd.substring(3).trim();
      let targetDir;
      
      if (newDir === '~') {
        targetDir = os.homedir();
      } else if (newDir.startsWith('~/')) {
        targetDir = path.join(os.homedir(), newDir.substring(2));
      } else if (path.isAbsolute(newDir)) {
        targetDir = newDir;
      } else {
        targetDir = path.join(terminal.cwd, newDir);
      }

      try {
        const fs = require('fs');
        const stats = fs.statSync(targetDir);
        if (stats.isDirectory()) {
          terminal.cwd = targetDir;
          this.sendOutput(terminalId, '');
        } else {
          this.sendOutput(terminalId, `cd: not a directory: ${newDir}\r\n`);
        }
      } catch (error) {
        this.sendOutput(terminalId, `cd: no such file or directory: ${newDir}\r\n`);
      }
      
      this.showPrompt(terminalId);
      return;
    }

    // Execute external commands
    try {
      const args = cmd.split(' ');
      const command = args[0];
      const commandArgs = args.slice(1);

      const child = spawn(command, commandArgs, {
        cwd: terminal.cwd,
        env: terminal.env,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      child.stdout.on('data', (data) => {
        let output = data.toString();
        
        // Special formatting for ls command
        if (command === 'ls') {
          // Split by whitespace and format as columns
          const items = output.trim().split(/\s+/);
          if (items.length > 0) {
            // Create a nice column layout
            const columns = 4;
            let formatted = '';
            for (let i = 0; i < items.length; i++) {
              if (i > 0 && i % columns === 0) {
                formatted += '\r\n';
              }
              formatted += items[i].padEnd(20);
            }
            formatted += '\r\n';
            this.sendOutput(terminalId, formatted);
          }
        } else {
          // Regular output formatting
          if (!output.endsWith('\n') && !output.endsWith('\r\n')) {
            output += '\r\n';
          }
          this.sendOutput(terminalId, output);
        }
      });

      child.stderr.on('data', (data) => {
        let output = data.toString();
        if (!output.endsWith('\n') && !output.endsWith('\r\n')) {
          output += '\r\n';
        }
        this.sendOutput(terminalId, output);
      });

      child.on('close', (code) => {
        // Only show error for non-zero exit codes that are not common interruptions
        if (code !== 0 && code !== -2 && code !== 130) {
          this.sendOutput(terminalId, `Command failed with exit code ${code}\r\n`);
        }
        this.showPrompt(terminalId);
      });

      child.on('error', (error) => {
        this.sendOutput(terminalId, `${command}: command not found\r\n`);
        this.showPrompt(terminalId);
      });

    } catch (error) {
      this.sendOutput(terminalId, `Error: ${error.message}\r\n`);
      this.showPrompt(terminalId);
    }
  }

  write(terminalId, data) {
    const terminal = this.terminals.get(terminalId);
    if (!terminal) {
      return { success: false, error: 'Terminal not found' };
    }

    // Handle different key codes
    if (data === '\t') {
      // Tab completion
      this.handleTabCompletion(terminalId);
    } else if (data === '\r' || data === '\n') {
      this.sendOutput(terminalId, '\r\n');
      if (terminal.currentCommand) {
        this.executeCommand(terminalId, terminal.currentCommand);
        terminal.currentCommand = '';
      } else {
        this.showPrompt(terminalId);
      }
    } else if (data === '\u007f' || data === '\b') {
      // Backspace
      if (terminal.currentCommand && terminal.currentCommand.length > 0) {
        terminal.currentCommand = terminal.currentCommand.slice(0, -1);
        this.sendOutput(terminalId, '\b \b');
      }
    } else if (data >= ' ' && data <= '~') {
      // Printable characters
      terminal.currentCommand = (terminal.currentCommand || '') + data;
      this.sendOutput(terminalId, data);
    }

    return { success: true };
  }

  handleTabCompletion(terminalId) {
    const terminal = this.terminals.get(terminalId);
    if (!terminal || !terminal.currentCommand) return;

    const command = terminal.currentCommand;
    const parts = command.split(' ');
    const lastPart = parts[parts.length - 1];

    // If we're completing the first word (command)
    if (parts.length === 1) {
      const commands = ['ls', 'cd', 'pwd', 'mkdir', 'rm', 'cp', 'mv', 'cat', 'echo', 'clear', 'touch', 'grep', 'find', 'chmod', 'chown'];
      const matches = commands.filter(cmd => cmd.startsWith(lastPart));
      
      if (matches.length === 1) {
        const completion = matches[0].substring(lastPart.length);
        terminal.currentCommand += completion + ' ';
        this.sendOutput(terminalId, completion + ' ');
      } else if (matches.length > 1) {
        this.sendOutput(terminalId, '\r\n');
        this.sendOutput(terminalId, matches.join('  ') + '\r\n');
        this.showPrompt(terminalId);
        this.sendOutput(terminalId, terminal.currentCommand);
      }
    } else {
      // Complete file/directory names
      const fs = require('fs');
      try {
        let targetDir = terminal.cwd;
        let searchPattern = lastPart;
        
        // Handle relative paths
        if (lastPart.includes('/')) {
          const pathParts = lastPart.split('/');
          searchPattern = pathParts[pathParts.length - 1];
          const dirPath = pathParts.slice(0, -1).join('/');
          
          if (dirPath.startsWith('/')) {
            targetDir = dirPath;
          } else if (dirPath.startsWith('~')) {
            targetDir = path.join(os.homedir(), dirPath.substring(1));
          } else {
            targetDir = path.join(terminal.cwd, dirPath);
          }
        }

        const files = fs.readdirSync(targetDir);
        const matches = files.filter(file => file.startsWith(searchPattern));
        
        if (matches.length === 1) {
          const completion = matches[0].substring(searchPattern.length);
          const stats = fs.statSync(path.join(targetDir, matches[0]));
          const suffix = stats.isDirectory() ? '/' : ' ';
          
          terminal.currentCommand += completion + suffix;
          this.sendOutput(terminalId, completion + suffix);
        } else if (matches.length > 1) {
          // Find common prefix
          let commonPrefix = matches[0];
          for (let i = 1; i < matches.length; i++) {
            let j = 0;
            while (j < commonPrefix.length && j < matches[i].length && commonPrefix[j] === matches[i][j]) {
              j++;
            }
            commonPrefix = commonPrefix.substring(0, j);
          }
          
          if (commonPrefix.length > searchPattern.length) {
            const completion = commonPrefix.substring(searchPattern.length);
            terminal.currentCommand += completion;
            this.sendOutput(terminalId, completion);
          } else {
            // Show all matches
            this.sendOutput(terminalId, '\r\n');
            const columns = 4;
            let output = '';
            for (let i = 0; i < matches.length; i++) {
              if (i > 0 && i % columns === 0) {
                output += '\r\n';
              }
              const stats = fs.statSync(path.join(targetDir, matches[i]));
              const displayName = stats.isDirectory() ? matches[i] + '/' : matches[i];
              output += displayName.padEnd(20);
            }
            this.sendOutput(terminalId, output + '\r\n');
            this.showPrompt(terminalId);
            this.sendOutput(terminalId, terminal.currentCommand);
          }
        }
      } catch (error) {
        // Silent fail for tab completion
      }
    }
  }

  setDataHandler(terminalId, handler) {
    const terminal = this.terminals.get(terminalId);
    if (terminal) {
      terminal.onData = handler;
    }
  }

  setExitHandler(terminalId, handler) {
    const terminal = this.terminals.get(terminalId);
    if (terminal) {
      terminal.onExit = handler;
    }
  }

  resize(terminalId, cols, rows) {
    return { success: true };
  }

  kill(terminalId) {
    const terminal = this.terminals.get(terminalId);
    if (terminal) {
      if (terminal.onExit) {
        terminal.onExit(0);
      }
      this.terminals.delete(terminalId);
      return { success: true };
    }
    return { success: false, error: 'Terminal not found' };
  }

  getTerminalInfo(terminalId) {
    return this.terminals.get(terminalId);
  }

  getActiveTerminals() {
    return Array.from(this.terminals.keys());
  }

  cleanup() {
    this.terminals.clear();
  }
}

module.exports = SimpleTerminal;