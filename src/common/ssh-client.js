const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

/**
 * SSH Client wrapper for connecting to SSH servers
 */
class SSHClient {
  constructor() {
    this.connections = {};
    this.activeConnectionId = null;
  }

  /**
   * Connect to an SSH server
   * @param {Object} config - Connection configuration
   * @param {Function} onData - Callback for receiving data
   * @param {Function} onError - Callback for errors
   * @param {Function} onClose - Callback for connection close
   * @returns {Promise<string>} Connection ID
   */
  connect(config, onData, onError, onClose) {
    return new Promise((resolve, reject) => {
      // Generate a connection ID
      const connectionId = `ssh-${Date.now()}`;
      
      // Create a new SSH client
      const conn = new Client();
      
      // Set up connection config
      const connectionConfig = {
        host: config.host,
        port: config.port || 22,
        username: config.username,
        readyTimeout: 30000, // 30 seconds timeout
        keepaliveInterval: 30000, // Send keep-alive every 30 seconds
      };
      
      // Add authentication based on type
      if (config.authType === 'password') {
        connectionConfig.password = config.password;
      } else if (config.authType === 'privateKey') {
        try {
          connectionConfig.privateKey = fs.readFileSync(config.privateKeyPath);
          if (config.passphrase) {
            connectionConfig.passphrase = config.passphrase;
          }
        } catch (err) {
          reject(new Error(`Failed to read private key: ${err.message}`));
          return;
        }
      }
      
      // Set up event handlers
      conn.on('ready', () => {
        // Create a new shell session
        conn.shell((err, stream) => {
          if (err) {
            delete this.connections[connectionId];
            reject(new Error(`Failed to create shell: ${err.message}`));
            return;
          }
          
          // Store the connection and stream
          this.connections[connectionId] = {
            client: conn,
            stream,
            config
          };
          
          // Set as active connection
          this.activeConnectionId = connectionId;
          
          // Set up stream handlers
          stream.on('data', (data) => {
            if (onData) onData(data.toString('utf8'));
          });
          
          stream.on('close', () => {
            if (onClose) onClose(connectionId);
          });
          
          stream.on('error', (errStream) => {
            if (onError) onError(errStream.message);
          });
          
          // Resolve with the connection ID
          resolve(connectionId);
        });
      });
      
      conn.on('error', (errClient) => {
        delete this.connections[connectionId];
        reject(new Error(`Connection error: ${errClient.message}`));
      });

      conn.on('close', () => {
        delete this.connections[connectionId];
        if (this.activeConnectionId === connectionId) {
          this.activeConnectionId = null;
        }
      });
      
      // Connect to the server
      conn.connect(connectionConfig);
    });
  }

  /**
   * Execute a command on an SSH connection and get its output
   * @param {string} connectionId - Connection ID
   * @param {string} command - Command to execute
   * @returns {Promise<string>} Command output
   */
  executeCommand(connectionId, command) {
    return new Promise((resolve, reject) => {
      const connection = this.connections[connectionId];
      if (!connection || !connection.client) {
        return reject(new Error('SSH connection not found or client not available.'));
      }

      let output = '';
      connection.client.exec(command, (err, stream) => {
        if (err) {
          return reject(err);
        }
        stream.on('data', (data) => {
          output += data.toString('utf8');
        }).on('close', (code, signal) => {
          resolve(output);
        }).on('error', (execError) => {
            reject(execError);
        });
      });
    });
  }
  
  /**
   * Write data to an SSH connection
   * @param {string} connectionId - Connection ID
   * @param {string} data - Data to write
   */
  write(connectionId, data) {
    const connection = this.connections[connectionId];
    if (connection && connection.stream) {
      connection.stream.write(data);
    }
  }
  
  /**
   * Close an SSH connection
   * @param {string} connectionId - Connection ID
   */
  close(connectionId) {
    const connection = this.connections[connectionId];
    if (connection) {
      if (connection.stream) {
        connection.stream.end();
      }
      connection.client.end();
    }
  }
  
  /**
   * Close all SSH connections
   */
  closeAll() {
    Object.keys(this.connections).forEach(connectionId => {
      this.close(connectionId);
    });
  }
  
  /**
   * Get connection by ID
   * @param {string} connectionId - Connection ID
   * @returns {Object|null} Connection object or null if not found
   */
  getConnection(connectionId) {
    return this.connections[connectionId] || null;
  }
  
  /**
   * Resize terminal window for a connection
   * @param {string} connectionId - Connection ID
   * @param {number} cols - Number of columns
   * @param {number} rows - Number of rows
   */
  resize(connectionId, cols, rows) {
    const connection = this.connections[connectionId];
    if (connection && connection.stream) {
      connection.stream.setWindow(rows, cols);
    }
  }
}

module.exports = new SSHClient(); 