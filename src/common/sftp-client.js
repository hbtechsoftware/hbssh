const SftpClient = require('ssh2-sftp-client');
const path = require('path');
const fs = require('fs');
const EventEmitter = require('events');

/**
 * SFTP Client wrapper for file operations
 */
class SftpManager extends EventEmitter {
  constructor() {
    super();
    this.connections = {};
    this.transfers = {};
    this.transferCounter = 0;
  }

  /**
   * Connect to an SFTP server
   * @param {Object} config - Connection configuration
   * @returns {Promise<string>} Connection ID
   */
  async connect(config) {
    // Generate a connection ID
    const connectionId = `sftp-${Date.now()}`;
    
    try {
      // Create a new SFTP client
      const sftp = new SftpClient();
      
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
          throw new Error(`Failed to read private key: ${err.message}`);
        }
      }
      
      // Connect to the server
      await sftp.connect(connectionConfig);
      
      // Store the connection
      this.connections[connectionId] = {
        sftp,
        config,
        currentDirectory: '/'
      };
      
      return connectionId;
    } catch (error) {
      throw new Error(`SFTP Connection error: ${error.message}`);
    }
  }
  
  /**
   * Disconnect from SFTP server
   * @param {string} connectionId - Connection ID
   * @returns {Promise<void>}
   */
  async disconnect(connectionId) {
    const connection = this.connections[connectionId];
    if (connection) {
      try {
        await connection.sftp.end();
      } catch (error) {
        console.error('Error disconnecting from SFTP server:', error);
      } finally {
        delete this.connections[connectionId];
      }
    }
  }
  
  /**
   * List files in a directory
   * @param {string} connectionId - Connection ID
   * @param {string} remotePath - Remote directory path
   * @returns {Promise<Array>} List of files
   */
  async list(connectionId, remotePath) {
    const connection = this.connections[connectionId];
    if (!connection) {
      throw new Error('Connection not found');
    }
    
    try {
      // Update current directory
      connection.currentDirectory = remotePath;
      
      // Get file list
      const list = await connection.sftp.list(remotePath);
      return list.map(item => ({
        ...item,
        isDirectory: item.type === 'd',
        isFile: item.type === '-',
        isSymlink: item.type === 'l'
      }));
    } catch (error) {
      throw new Error(`Failed to list directory: ${error.message}`);
    }
  }
  
  /**
   * Create a directory
   * @param {string} connectionId - Connection ID
   * @param {string} remotePath - Remote directory path
   * @returns {Promise<void>}
   */
  async mkdir(connectionId, remotePath) {
    const connection = this.connections[connectionId];
    if (!connection) {
      throw new Error('Connection not found');
    }
    
    try {
      await connection.sftp.mkdir(remotePath, true);
    } catch (error) {
      throw new Error(`Failed to create directory: ${error.message}`);
    }
  }
  
  /**
   * Delete a file
   * @param {string} connectionId - Connection ID
   * @param {string} remotePath - Remote file path
   * @returns {Promise<void>}
   */
  async delete(connectionId, remotePath) {
    const connection = this.connections[connectionId];
    if (!connection) {
      throw new Error('Connection not found');
    }
    
    try {
      await connection.sftp.delete(remotePath);
    } catch (error) {
      throw new Error(`Failed to delete file: ${error.message}`);
    }
  }
  
  /**
   * Delete a directory
   * @param {string} connectionId - Connection ID
   * @param {string} remotePath - Remote directory path
   * @param {boolean} recursive - Whether to delete recursively
   * @returns {Promise<void>}
   */
  async rmdir(connectionId, remotePath, recursive = false) {
    const connection = this.connections[connectionId];
    if (!connection) {
      throw new Error('Connection not found');
    }
    
    try {
      await connection.sftp.rmdir(remotePath, recursive);
    } catch (error) {
      throw new Error(`Failed to delete directory: ${error.message}`);
    }
  }
  
  /**
   * Rename a file or directory
   * @param {string} connectionId - Connection ID
   * @param {string} fromPath - Source path
   * @param {string} toPath - Destination path
   * @returns {Promise<void>}
   */
  async rename(connectionId, fromPath, toPath) {
    const connection = this.connections[connectionId];
    if (!connection) {
      throw new Error('Connection not found');
    }
    
    try {
      await connection.sftp.rename(fromPath, toPath);
    } catch (error) {
      throw new Error(`Failed to rename: ${error.message}`);
    }
  }
  
  /**
   * Read a remote file and return its content as a string
   * @param {string} connectionId - Connection ID
   * @param {string} remotePath - Remote file path
   * @returns {Promise<string>} File content
   */
  async readFile(connectionId, remotePath) {
    const connection = this.connections[connectionId];
    if (!connection) {
      throw new Error('SFTP Connection not found');
    }
    if (!connection.sftp) {
        throw new Error('SFTP client is not initialized');
    }

    try {
      // ssh2-sftp-client's get method can accept a WritableStream or return a Buffer if destination is null/undefined
      const buffer = await connection.sftp.get(remotePath);
      return buffer.toString('utf8');
    } catch (error) {
      console.error(`[${connectionId}] SFTP readFile error for ${remotePath}:`, error);
      throw new Error(`Failed to read file ${remotePath}: ${error.message}`);
    }
  }

  /**
   * Write content to a remote file
   * @param {string} connectionId - Connection ID
   * @param {string} remotePath - Remote file path
   * @param {string|Buffer} content - Content to write
   * @returns {Promise<void>}
   */
  async writeFile(connectionId, remotePath, content) {
    const connection = this.connections[connectionId];
    if (!connection) {
      throw new Error('SFTP Connection not found');
    }
    if (!connection.sftp) {
        throw new Error('SFTP client is not initialized');
    }

    try {
      // ssh2-sftp-client's put method can accept a Buffer, string (path to local file), or ReadableStream
      const bufferContent = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
      await connection.sftp.put(bufferContent, remotePath);
    } catch (error) {
      console.error(`[${connectionId}] SFTP writeFile error for ${remotePath}:`, error);
      throw new Error(`Failed to write file ${remotePath}: ${error.message}`);
    }
  }
  
  /**
   * Download a file
   * @param {string} connectionId - Connection ID
   * @param {string} remotePath - Remote file path
   * @param {string} localPath - Local file path
   * @returns {Promise<string>} Transfer ID
   */
  async download(connectionId, remotePath, localPath) {
    const connection = this.connections[connectionId];
    if (!connection) {
      throw new Error('Connection not found');
    }
    
    // Generate transfer ID
    const transferId = `transfer-${Date.now()}-${this.transferCounter++}`;
    
    // Create transfer object
    this.transfers[transferId] = {
      type: 'download',
      remotePath,
      localPath,
      status: 'started',
      progress: 0,
      error: null,
      startTime: Date.now()
    };
    
    // Get file stats to calculate progress
    try {
      const stats = await connection.sftp.stat(remotePath);
      this.transfers[transferId].size = stats.size;
      
      // Start download in background
      this.downloadFile(connectionId, transferId, remotePath, localPath, stats.size);
      
      return transferId;
    } catch (error) {
      this.transfers[transferId].status = 'error';
      this.transfers[transferId].error = error.message;
      throw new Error(`Failed to start download: ${error.message}`);
    }
  }
  
  /**
   * Upload a file
   * @param {string} connectionId - Connection ID
   * @param {string} localPath - Local file path
   * @param {string} remotePath - Remote file path
   * @returns {Promise<string>} Transfer ID
   */
  async upload(connectionId, localPath, remotePath) {
    const connection = this.connections[connectionId];
    if (!connection) {
      throw new Error('Connection not found');
    }
    
    // Generate transfer ID
    const transferId = `transfer-${Date.now()}-${this.transferCounter++}`;
    
    // Create transfer object
    this.transfers[transferId] = {
      type: 'upload',
      remotePath,
      localPath,
      status: 'started',
      progress: 0,
      error: null,
      startTime: Date.now()
    };
    
    // Get file stats to calculate progress
    try {
      const stats = fs.statSync(localPath);
      this.transfers[transferId].size = stats.size;
      
      // Start upload in background
      this.uploadFile(connectionId, transferId, localPath, remotePath, stats.size);
      
      return transferId;
    } catch (error) {
      this.transfers[transferId].status = 'error';
      this.transfers[transferId].error = error.message;
      throw new Error(`Failed to start upload: ${error.message}`);
    }
  }
  
  /**
   * Get transfer status
   * @param {string} transferId - Transfer ID
   * @returns {Object|null} Transfer object or null if not found
   */
  getTransferStatus(transferId) {
    return this.transfers[transferId] || null;
  }
  
  /**
   * Cancel a transfer
   * @param {string} transferId - Transfer ID
   * @returns {boolean} Whether the transfer was cancelled
   */
  cancelTransfer(transferId) {
    const transfer = this.transfers[transferId];
    if (!transfer) {
      return false;
    }
    
    transfer.status = 'cancelled';
    this.emit('transfer-update', transferId, transfer);
    return true;
  }
  
  /**
   * Get current directory
   * @param {string} connectionId - Connection ID
   * @returns {string} Current directory
   */
  getCurrentDirectory(connectionId) {
    const connection = this.connections[connectionId];
    if (!connection) {
      throw new Error('Connection not found');
    }
    
    return connection.currentDirectory;
  }
  
  /**
   * Set current directory
   * @param {string} connectionId - Connection ID
   * @param {string} remotePath - Remote directory path
   */
  setCurrentDirectory(connectionId, remotePath) {
    const connection = this.connections[connectionId];
    if (!connection) {
      throw new Error('Connection not found');
    }
    
    connection.currentDirectory = remotePath;
  }
  
  /**
   * Get file info
   * @param {string} connectionId - Connection ID
   * @param {string} remotePath - Remote file path
   * @returns {Promise<Object>} File info
   */
  async stat(connectionId, remotePath) {
    const connection = this.connections[connectionId];
    if (!connection) {
      throw new Error('Connection not found');
    }
    
    try {
      const stats = await connection.sftp.stat(remotePath);
      return {
        ...stats,
        isDirectory: stats.isDirectory(),
        isFile: stats.isFile(),
        isSymbolicLink: stats.isSymbolicLink()
      };
    } catch (error) {
      throw new Error(`Failed to get file info: ${error.message}`);
    }
  }
  
  /**
   * Download file implementation
   * @private
   */
  async downloadFile(connectionId, transferId, remotePath, localPath, totalSize) {
    const connection = this.connections[connectionId];
    if (!connection) {
      this.transfers[transferId].status = 'error';
      this.transfers[transferId].error = 'Connection not found';
      this.emit('transfer-update', transferId, this.transfers[transferId]);
      return;
    }
    
    const transfer = this.transfers[transferId];
    
    try {
      // Create progress tracking
      let lastProgress = 0;
      const updateProgress = (bytesTransferred) => {
        const progress = Math.round((bytesTransferred / totalSize) * 100);
        if (progress > lastProgress) {
          lastProgress = progress;
          transfer.progress = progress;
          this.emit('transfer-update', transferId, transfer);
        }
      };
      
      // Start download
      await connection.sftp.fastGet(remotePath, localPath, {
        step: (total_transferred, chunk, total) => {
          updateProgress(total_transferred);
        }
      });
      
      // Update transfer status
      transfer.status = 'completed';
      transfer.progress = 100;
      transfer.completedTime = Date.now();
      this.emit('transfer-update', transferId, transfer);
    } catch (error) {
      // Update transfer status on error
      transfer.status = 'error';
      transfer.error = error.message;
      this.emit('transfer-update', transferId, transfer);
    }
  }
  
  /**
   * Upload file implementation
   * @private
   */
  async uploadFile(connectionId, transferId, localPath, remotePath, totalSize) {
    const connection = this.connections[connectionId];
    if (!connection) {
      this.transfers[transferId].status = 'error';
      this.transfers[transferId].error = 'Connection not found';
      this.emit('transfer-update', transferId, this.transfers[transferId]);
      return;
    }
    
    const transfer = this.transfers[transferId];
    
    try {
      // Create progress tracking
      let lastProgress = 0;
      const updateProgress = (bytesTransferred) => {
        const progress = Math.round((bytesTransferred / totalSize) * 100);
        if (progress > lastProgress) {
          lastProgress = progress;
          transfer.progress = progress;
          this.emit('transfer-update', transferId, transfer);
        }
      };
      
      // Start upload
      await connection.sftp.fastPut(localPath, remotePath, {
        step: (total_transferred, chunk, total) => {
          updateProgress(total_transferred);
        }
      });
      
      // Update transfer status
      transfer.status = 'completed';
      transfer.progress = 100;
      transfer.completedTime = Date.now();
      this.emit('transfer-update', transferId, transfer);
    } catch (error) {
      // Update transfer status on error
      transfer.status = 'error';
      transfer.error = error.message;
      this.emit('transfer-update', transferId, transfer);
    }
  }
  
  /**
   * Close all connections
   */
  async closeAll() {
    const connectionIds = Object.keys(this.connections);
    for (const connectionId of connectionIds) {
      await this.disconnect(connectionId);
    }
  }
}

module.exports = new SftpManager(); 