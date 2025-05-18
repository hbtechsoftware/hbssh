/**
 * Manages SFTP connections and file operations.
 * This class provides essential methods for interacting with SFTP servers:
 * connecting, disconnecting, listing directories, creating/deleting/renaming files/directories,
 * downloading/uploading files, and managing transfer statuses.
 */
export class SFTPManager {
  /**
   * Creates a new instance of the SFTPManager class.
   * Initializes internal structures for storing connections, transfers, and current directories.
   * Binds methods to the `this` context and registers event listeners.
   */
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
   * Connects to an SFTP server.
   * @param {Object} connection - The connection configuration object.
   * @param {string} connection.host - The server address.
   * @param {number} connection.port - The server port.
   * @param {string} connection.username - The username.
   * @param {string} [connection.password] - The password (optional).
   * @param {string} [connection.privateKey] - The path to the private key (optional).
   * @returns {Promise<string>} A Promise that resolves with the connection ID on successful connection.
   * @throws {Error} Throws an error if the connection fails or an API error occurs.
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
   * Disconnects from an SFTP server.
   * @param {string} connectionId - The ID of the connection to disconnect.
   * @returns {Promise<void>} A Promise that resolves when the operation is complete.
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
   * Gets the ID of the active SFTP connection.
   * @returns {string|null} The active connection ID, or `null` if there is no active connection.
   */
  getActiveConnection() {
    return this.activeConnectionId;
  }
  
  /**
   * Sets the active SFTP connection.
   * @param {string} connectionId - The ID of the connection to set as active.
   */
  setActiveConnection(connectionId) {
    if (this.connections[connectionId]) {
      this.activeConnectionId = connectionId;
    }
  }
  
  /**
   * Gets the current working directory for the specified connection.
   * @param {string} connectionId - The connection ID.
   * @returns {string} The path of the current working directory, defaults to '/'.
   */
  getCurrentDirectory(connectionId) {
    return this.currentDirectories[connectionId] || '/';
  }
  
  /**
   * Lists the contents of a remote directory.
   * @param {string} connectionId - The ID of the SFTP connection.
   * @param {string} remotePath - The path of the remote directory to list.
   * @returns {Promise<Array<Object>>} A Promise that resolves with an array of objects representing the directory contents.
   *                                  Each object typically includes properties like `name`, `type`, `size`, `modifyTime`.
   * @throws {Error} Throws an error if listing fails or an API error occurs.
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
   * Creates a new directory on the remote server.
   * @param {string} connectionId - The ID of the SFTP connection.
   * @param {string} remotePath - The remote path of the directory to create.
   * @param {string} [sshConnectionId] - The SSH connection ID to pass to the `sftp-mkdir` handler in `main.js` (optional, may be needed for sudo).
   * @returns {Promise<void>} Resolves if the operation is successful.
   * @throws {Error} Throws an error if directory creation fails or an API error occurs.
   */
  async createDirectory(connectionId, remotePath, sshConnectionId) {
    try {
      const result = await window.api.sftpMkdir(connectionId, remotePath, sshConnectionId);
      
      if (!result.success) {
        throw new Error(result.error);
      }
    } catch (error) {
      throw new Error(`Failed to create directory: ${error.message}`);
    }
  }
  
  /**
   * Deletes a file on the remote server.
   * @param {string} connectionId - The ID of the SFTP connection.
   * @param {string} remotePath - The remote path of the file to delete.
   * @param {string} [sshConnectionId] - The SSH connection ID to pass to the `sftp-delete` handler in `main.js` (optional, may be needed for sudo).
   * @returns {Promise<void>} Resolves if the operation is successful.
   * @throws {Error} Throws an error if file deletion fails or an API error occurs.
   */
  async deleteFile(connectionId, remotePath, sshConnectionId) {
    try {
      const result = await window.api.sftpDelete(connectionId, remotePath, sshConnectionId);
      
      if (!result.success) {
        throw new Error(result.error);
      }
    } catch (error) {
      throw new Error(`Failed to delete file: ${error.message}`);
    }
  }
  
  /**
   * Deletes a directory on the remote server.
   * @param {string} connectionId - The ID of the SFTP connection.
   * @param {string} remotePath - The remote path of the directory to delete.
   * @param {boolean} [recursive=false] - Whether to delete the directory recursively with its contents.
   * @param {string} [sshConnectionId] - The SSH connection ID to pass to the `sftp-rmdir` handler in `main.js` (optional, may be needed for sudo).
   * @returns {Promise<void>} Resolves if the operation is successful.
   * @throws {Error} Throws an error if directory deletion fails or an API error occurs.
   */
  async deleteDirectory(connectionId, remotePath, recursive = false, sshConnectionId) {
    try {
      const result = await window.api.sftpRmdir(connectionId, remotePath, recursive, sshConnectionId);
      
      if (!result.success) {
        throw new Error(result.error);
      }
    } catch (error) {
      throw new Error(`Failed to delete directory: ${error.message}`);
    }
  }
  
  /**
   * Renames/moves a file or directory on the remote server.
   * @param {string} connectionId - The ID of the SFTP connection.
   * @param {string} fromPath - The source file/directory path.
   * @param {string} toPath - The target file/directory path.
   * @param {string} [sshConnectionId] - The SSH connection ID to pass to the `sftp-rename` handler in `main.js` (optional).
   * @returns {Promise<void>} Resolves if the operation is successful.
   * @throws {Error} Throws an error if renaming fails or an API error occurs.
   */
  async renameItem(connectionId, fromPath, toPath, sshConnectionId) {
    try {
      const result = await window.api.sftpRename(connectionId, fromPath, toPath, sshConnectionId);
      
      if (!result.success) {
        throw new Error(result.error);
      }
    } catch (error) {
      throw new Error(`Failed to rename: ${error.message}`);
    }
  }
  
  /**
   * Downloads a remote file to a local path.
   * @param {string} connectionId - The ID of the SFTP connection.
   * @param {string} remotePath - The path of the remote file to download.
   * @param {string} localPath - The local path where the file will be saved.
   * @returns {Promise<string>} A Promise that resolves with the transfer ID on successful initiation.
   * @throws {Error} Throws an error if download initiation fails or an API error occurs.
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
   * Uploads a local file to a remote path.
   * @param {string} connectionId - The ID of the SFTP connection.
   * @param {string} localPath - The path of the local file to upload.
   * @param {string} remotePath - The remote path where the file will be uploaded.
   * @param {string} [sshConnectionId] - The SSH connection ID to pass to the `sftp-upload` (or indirectly `sftp-write-file`) handler in `main.js` (optional, may be needed for sudo).
   * @returns {Promise<string>} A Promise that resolves with the transfer ID on successful initiation.
   * @throws {Error} Throws an error if upload initiation fails or an API error occurs.
   */
  async uploadFile(connectionId, localPath, remotePath, sshConnectionId) {
    try {
      // The sftpUpload API might not directly take sshConnectionId; it might use infrastructure like sftpWriteFile instead.
      // So, one should check the sftpUpload definition in preload.js.
      // For now, we add it assuming sshConnectionId might be needed if file creation/overwrite in main.js is done with sudo.
      const result = await window.api.sftpUpload(connectionId, localPath, remotePath, sshConnectionId);
      
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
   * Cancels an ongoing file transfer.
   * @param {string} transferId - The ID of the transfer to cancel.
   * @returns {Promise<boolean>} A Promise that resolves with `true` if the operation is successful, `false` otherwise.
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
   * Gets information (stat) about a remote file or directory.
   * @param {string} connectionId - The ID of the SFTP connection.
   * @param {string} remotePath - The path of the remote file/directory to get information about.
   * @returns {Promise<Object>} A Promise that resolves with an object containing file/directory information (e.g., size, permissions, modification time).
   * @throws {Error} Throws an error if getting information fails or an API error occurs.
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
   * Gets a list of all active file transfers.
   * @returns {Object<string, Object>} An object containing transfer IDs as keys and transfer details as values.
   *                                   Each transfer object includes information like `type`, `connectionId`, `remotePath`, `localPath`, `status`, `progress`.
   */
  getTransfers() {
    return this.transfers;
  }
  
  /**
   * Gets the details of a file transfer with a specific ID.
   * @param {string} transferId - The ID of the transfer to get.
   * @returns {Object|null} The transfer object, or `null` if not found.
   */
  getTransfer(transferId) {
    return this.transfers[transferId] || null;
  }
  
  /**
   * Handles `sftp-transfer-update` events from the main process.
   * Updates the local transfer status and triggers an `sftp-transfer-update` custom event.
   * @param {string} transferId - The ID of the updated transfer.
   * @param {Object} transfer - The object containing updated transfer information.
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
   * Closes all active SFTP connections.
   * @returns {Promise<void>} A Promise that resolves when all connections are disconnected.
   */
  async closeAll() {
    const connectionIds = Object.keys(this.connections);
    for (const connectionId of connectionIds) {
      await this.disconnect(connectionId);
    }
  }
} 