/**
 * Manages SFTP connections and file operations
 */
export class SFTPManager {
  constructor() {
    this.connections = {};
    this.activeConnectionId = null;
    this.transfers = {};
    this.currentDirectories = {};
    
    // Bind methods
    this.connect = this.connect.bind(this);
    this.disconnect = this.disconnect.bind(this);
    this.listDirectory = this.listDirectory.bind(this);
    this.createDirectory = this.createDirectory.bind(this);
    this.deleteFile = this.deleteFile.bind(this);
    this.deleteDirectory = this.deleteDirectory.bind(this);
    this.renameItem = this.renameItem.bind(this);
    this.downloadFile = this.downloadFile.bind(this);
    this.uploadFile = this.uploadFile.bind(this);
    this.handleTransferUpdate = this.handleTransferUpdate.bind(this);
    
    // Register event listeners
    window.api.onSFTPTransferUpdate(this.handleTransferUpdate);
  }
  
  /**
   * Connect to an SFTP server
   * @param {Object} connection - Connection configuration
   * @returns {Promise<string>} Connection ID
   */
  async connect(connection) {
    try {
      const result = await window.api.connectSFTP(connection);
      
      if (result.success) {
        const connectionId = result.connectionId;
        
        // Store connection
        this.connections[connectionId] = {
          connection,
          isActive: true
        };
        
        // Set active connection
        this.activeConnectionId = connectionId;
        
        // Store initial directory
        this.currentDirectories[connectionId] = '/';
        
        return connectionId;
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      throw new Error(`Failed to connect to SFTP server: ${error.message}`);
    }
  }
  
  /**
   * Disconnect from an SFTP server
   * @param {string} connectionId - Connection ID
   * @returns {Promise<void>}
   */
  async disconnect(connectionId) {
    try {
      await window.api.disconnectSFTP(connectionId);
      
      // Remove from connections
      delete this.connections[connectionId];
      delete this.currentDirectories[connectionId];
      
      // Clear active connection if it was this one
      if (this.activeConnectionId === connectionId) {
        this.activeConnectionId = null;
      }
    } catch (error) {
      console.error(`Error disconnecting from SFTP server: ${error.message}`);
    }
  }
  
  /**
   * Get active connection
   * @returns {string|null} Active connection ID or null if none
   */
  getActiveConnection() {
    return this.activeConnectionId;
  }
  
  /**
   * Set active connection
   * @param {string} connectionId - Connection ID
   */
  setActiveConnection(connectionId) {
    if (this.connections[connectionId]) {
      this.activeConnectionId = connectionId;
    }
  }
  
  /**
   * Get current directory for a connection
   * @param {string} connectionId - Connection ID
   * @returns {string} Current directory
   */
  getCurrentDirectory(connectionId) {
    return this.currentDirectories[connectionId] || '/';
  }
  
  /**
   * List directory contents
   * @param {string} connectionId - Connection ID
   * @param {string} remotePath - Remote directory path
   * @returns {Promise<Array>} Directory listing
   */
  async listDirectory(connectionId, remotePath) {
    try {
      const result = await window.api.sftpList(connectionId, remotePath);
      
      if (result.success) {
        // Update current directory
        this.currentDirectories[connectionId] = remotePath;
        
        return result.list;
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      throw new Error(`Failed to list directory: ${error.message}`);
    }
  }
  
  /**
   * Create a new directory
   * @param {string} connectionId - Connection ID
   * @param {string} remotePath - Remote directory path
   * @returns {Promise<void>}
   */
  async createDirectory(connectionId, remotePath) {
    try {
      const result = await window.api.sftpMkdir(connectionId, remotePath);
      
      if (!result.success) {
        throw new Error(result.error);
      }
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
  async deleteFile(connectionId, remotePath) {
    try {
      const result = await window.api.sftpDelete(connectionId, remotePath);
      
      if (!result.success) {
        throw new Error(result.error);
      }
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
  async deleteDirectory(connectionId, remotePath, recursive = false) {
    try {
      const result = await window.api.sftpRmdir(connectionId, remotePath, recursive);
      
      if (!result.success) {
        throw new Error(result.error);
      }
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
  async renameItem(connectionId, fromPath, toPath) {
    try {
      const result = await window.api.sftpRename(connectionId, fromPath, toPath);
      
      if (!result.success) {
        throw new Error(result.error);
      }
    } catch (error) {
      throw new Error(`Failed to rename: ${error.message}`);
    }
  }
  
  /**
   * Download a file
   * @param {string} connectionId - Connection ID
   * @param {string} remotePath - Remote file path
   * @param {string} localPath - Local file path
   * @returns {Promise<string>} Transfer ID
   */
  async downloadFile(connectionId, remotePath, localPath) {
    try {
      const result = await window.api.sftpDownload(connectionId, remotePath, localPath);
      
      if (result.success) {
        const transferId = result.transferId;
        
        // Store transfer
        this.transfers[transferId] = {
          type: 'download',
          connectionId,
          remotePath,
          localPath,
          status: 'started',
          progress: 0
        };
        
        return transferId;
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
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
  async uploadFile(connectionId, localPath, remotePath) {
    try {
      const result = await window.api.sftpUpload(connectionId, localPath, remotePath);
      
      if (result.success) {
        const transferId = result.transferId;
        
        // Store transfer
        this.transfers[transferId] = {
          type: 'upload',
          connectionId,
          remotePath,
          localPath,
          status: 'started',
          progress: 0
        };
        
        return transferId;
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      throw new Error(`Failed to start upload: ${error.message}`);
    }
  }
  
  /**
   * Cancel a transfer
   * @param {string} transferId - Transfer ID
   * @returns {Promise<boolean>} Whether the transfer was cancelled
   */
  async cancelTransfer(transferId) {
    try {
      const result = await window.api.sftpCancelTransfer(transferId);
      
      if (result.success) {
        // Update transfer status
        if (this.transfers[transferId]) {
          this.transfers[transferId].status = 'cancelled';
        }
        
        return true;
      }
      
      return false;
    } catch (error) {
      console.error(`Failed to cancel transfer: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Get file info
   * @param {string} connectionId - Connection ID
   * @param {string} remotePath - Remote file path
   * @returns {Promise<Object>} File info
   */
  async getFileInfo(connectionId, remotePath) {
    try {
      const result = await window.api.sftpStat(connectionId, remotePath);
      
      if (result.success) {
        return result.stats;
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      throw new Error(`Failed to get file info: ${error.message}`);
    }
  }
  
  /**
   * Get all active transfers
   * @returns {Object} Transfers object with transfer IDs as keys
   */
  getTransfers() {
    return this.transfers;
  }
  
  /**
   * Get a specific transfer
   * @param {string} transferId - Transfer ID
   * @returns {Object|null} Transfer object or null if not found
   */
  getTransfer(transferId) {
    return this.transfers[transferId] || null;
  }
  
  /**
   * Handle transfer update event
   * @param {string} transferId - Transfer ID
   * @param {Object} transfer - Transfer object
   */
  handleTransferUpdate(transferId, transfer) {
    // Update local transfer
    if (this.transfers[transferId]) {
      this.transfers[transferId] = {
        ...this.transfers[transferId],
        ...transfer
      };
      
      // Trigger custom event
      const event = new CustomEvent('sftp-transfer-update', {
        detail: {
          transferId,
          transfer: this.transfers[transferId]
        }
      });
      
      document.dispatchEvent(event);
    }
  }
  
  /**
   * Close all SFTP connections
   */
  async closeAll() {
    const connectionIds = Object.keys(this.connections);
    for (const connectionId of connectionIds) {
      await this.disconnect(connectionId);
    }
  }
} 