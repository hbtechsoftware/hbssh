const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing all of its APIs
contextBridge.exposeInMainWorld('api', {
  /**
   * Gets all saved SSH connections.
   * @returns {Promise<Array<Object>>} A Promise that resolves with an array of connection objects.
   */
  getSavedConnections: () => ipcRenderer.invoke('get-saved-connections'),

  /**
   * Saves a new connection or updates an existing one.
   * @param {Object} connection - The connection object to save.
   * @returns {Promise<Array<Object>>} A Promise that resolves with the updated list of all connections.
   */
  saveConnection: (connection) => ipcRenderer.invoke('save-connection', connection),

  /**
   * Deletes the connection with the specified ID.
   * @param {string} connectionId - The ID of the connection to delete.
   * @returns {Promise<Array<Object>>} A Promise that resolves with the updated list of all connections.
   */
  deleteConnection: (connectionId) => ipcRenderer.invoke('delete-connection', connectionId),
  
  /**
   * Establishes an SSH connection with the specified configuration.
   * @param {Object} connection - The connection configuration object.
   * @returns {Promise<Object>} A Promise that resolves with the connection result.
   */
  connectSSH: (connection) => ipcRenderer.invoke('connect-ssh', connection),

  /**
   * Writes data to the specified SSH connection.
   * @param {string} connectionId - The ID of the SSH connection.
   * @param {string} data - The data to write.
   * @returns {Promise<Object>} A Promise that resolves with the result of the write operation.
   */
  writeSSH: (connectionId, data) => ipcRenderer.invoke('write-ssh', connectionId, data),

  /**
   * Resizes the terminal of the specified SSH connection.
   * @param {string} connectionId - The ID of the SSH connection.
   * @param {number} cols - The number of columns.
   * @param {number} rows - The number of rows.
   * @returns {Promise<Object>} A Promise that resolves with the result of the resize operation.
   */
  resizeSSH: (connectionId, cols, rows) => ipcRenderer.invoke('resize-ssh', connectionId, cols, rows),

  /**
   * Disconnects the specified SSH connection.
   * @param {string} connectionId - The ID of the SSH connection to disconnect.
   * @returns {Promise<Object>} A Promise that resolves with the result of the disconnection operation.
   */
  disconnectSSH: (connectionId) => ipcRenderer.invoke('disconnect-ssh', connectionId),
  
  /**
   * Establishes an SFTP connection with the specified configuration.
   * @param {Object} connection - The connection configuration object.
   * @returns {Promise<Object>} A Promise that resolves with the connection result.
   */
  connectSFTP: (connection) => ipcRenderer.invoke('connect-sftp', connection),

  /**
   * Disconnects the specified SFTP connection.
   * @param {string} connectionId - The ID of the SFTP connection to disconnect.
   * @returns {Promise<Object>} A Promise that resolves with the result of the disconnection operation.
   */
  disconnectSFTP: (connectionId) => ipcRenderer.invoke('disconnect-sftp', connectionId),

  /**
   * Lists the contents of a remote directory on the specified SFTP connection.
   * @param {string} connectionId - The ID of the SFTP connection.
   * @param {string} remotePath - The path of the remote directory to list.
   * @returns {Promise<Object>} A Promise that resolves with the result of the directory listing operation.
   */
  sftpList: (connectionId, remotePath) => ipcRenderer.invoke('sftp-list', connectionId, remotePath),

  /**
   * Creates a remote directory on the specified SFTP connection.
   * @param {string} connectionId - The ID of the SFTP connection.
   * @param {string} remotePath - The path of the remote directory to create.
   * @param {string} sshConnectionId - The ID of the associated SSH connection (for sudo operations).
   * @returns {Promise<Object>} A Promise that resolves with the result of the directory creation operation.
   */
  sftpMkdir: (connectionId, remotePath, sshConnectionId) => ipcRenderer.invoke('sftp-mkdir', { connectionId, remotePath, sshConnectionId }),

  /**
   * Deletes a remote file on the specified SFTP connection.
   * @param {string} sftpConnectionId - The ID of the SFTP connection.
   * @param {string} remotePath - The path of the remote file to delete.
   * @param {string} sshConnectionId - The ID of the associated SSH connection (for sudo operations).
   * @returns {Promise<Object>} A Promise that resolves with the result of the file deletion operation.
   */
  sftpDelete: (sftpConnectionId, remotePath, sshConnectionId) => ipcRenderer.invoke('sftp-delete', { sftpConnectionId, remotePath, sshConnectionId }),

  /**
   * Deletes a remote directory (and optionally its contents) on the specified SFTP connection.
   * @param {string} sftpConnectionId - The ID of the SFTP connection.
   * @param {string} remotePath - The path of the remote directory to delete.
   * @param {boolean} recursive - Whether to delete recursively with its contents.
   * @param {string} sshConnectionId - The ID of the associated SSH connection (for sudo operations).
   * @returns {Promise<Object>} A Promise that resolves with the result of the directory deletion operation.
   */
  sftpRmdir: (sftpConnectionId, remotePath, recursive, sshConnectionId) => ipcRenderer.invoke('sftp-rmdir', { sftpConnectionId, remotePath, recursive, sshConnectionId }),

  /**
   * Renames/moves a remote file or directory on the specified SFTP connection.
   * @param {string} connectionId - The ID of the SFTP connection.
   * @param {string} fromPath - The source file/directory path.
   * @param {string} toPath - The target file/directory path.
   * @param {string} sshConnectionId - The ID of the associated SSH connection.
   * @returns {Promise<Object>} A Promise that resolves with the result of the rename/move operation.
   */
  sftpRename: (connectionId, fromPath, toPath, sshConnectionId) => ipcRenderer.invoke('sftp-rename', { connectionId, fromPath, toPath, sshConnectionId }),

  /**
   * Downloads a remote file from the specified SFTP connection to a local path.
   * @param {string} connectionId - The ID of the SFTP connection.
   * @param {string} remotePath - The path of the remote file to download.
   * @param {string} localPath - The local path where the file will be saved.
   * @returns {Promise<Object>} A Promise that resolves with the result of the download operation.
   */
  sftpDownload: (connectionId, remotePath, localPath) => ipcRenderer.invoke('sftp-download', connectionId, remotePath, localPath),

  /**
   * Uploads a local file to a remote path on the specified SFTP connection.
   * @param {string} connectionId - The ID of the SFTP connection.
   * @param {string} localPath - The path of the local file to upload.
   * @param {string} remotePath - The remote path where the file will be uploaded.
   * @returns {Promise<Object>} A Promise that resolves with the result of the upload operation.
   */
  sftpUpload: (connectionId, localPath, remotePath) => ipcRenderer.invoke('sftp-upload', connectionId, localPath, remotePath),

  /**
   * Gets the status of an SFTP transfer with the specified transfer ID.
   * @param {string} transferId - The ID of the transfer.
   * @returns {Promise<Object>} A Promise that resolves with the transfer status.
   */
  sftpGetTransferStatus: (transferId) => ipcRenderer.invoke('sftp-get-transfer-status', transferId),

  /**
   * Cancels an SFTP transfer with the specified transfer ID.
   * @param {string} transferId - The ID of the transfer.
   * @returns {Promise<Object>} A Promise that resolves with the result of the cancel operation.
   */
  sftpCancelTransfer: (transferId) => ipcRenderer.invoke('sftp-cancel-transfer', transferId),

  /**
   * Gets the current working directory for the specified SFTP connection.
   * @param {string} connectionId - The ID of the SFTP connection.
   * @returns {Promise<Object>} A Promise that resolves with the current working directory.
   */
  sftpGetCurrentDirectory: (connectionId) => ipcRenderer.invoke('sftp-get-current-directory', connectionId),

  /**
   * Sets the current working directory for the specified SFTP connection.
   * @param {string} connectionId - The ID of the SFTP connection.
   * @param {string} remotePath - The new working directory path to set.
   * @returns {Promise<Object>} A Promise that resolves with the result of the operation.
   */
  sftpSetCurrentDirectory: (connectionId, remotePath) => ipcRenderer.invoke('sftp-set-current-directory', connectionId, remotePath),

  /**
   * Gets information (stat) about a remote file or directory on the specified SFTP connection.
   * @param {string} connectionId - The ID of the SFTP connection.
   * @param {string} remotePath - The path of the remote file/directory to get information about.
   * @returns {Promise<Object>} A Promise that resolves with the file/directory information.
   */
  sftpStat: (connectionId, remotePath) => ipcRenderer.invoke('sftp-stat', connectionId, remotePath),
  
  /**
   * Shows an open file dialog.
   * @param {Object} options - Options for Electron's `dialog.showOpenDialog` method.
   * @returns {Promise<Object>} A Promise that resolves with the file selection result.
   */
  openFileDialog: (options) => ipcRenderer.invoke('open-file-dialog', options),

  /**
   * Shows a save file dialog.
   * @param {Object} options - Options for Electron's `dialog.showSaveDialog` method.
   * @returns {Promise<Object>} A Promise that resolves with the file saving result.
   */
  saveFileDialog: (options) => ipcRenderer.invoke('save-file-dialog', options),

  /**
   * Gets the path to the user's home directory.
   * @returns {Promise<string>} A Promise that resolves with the home directory path.
   */
  getHomePath: () => ipcRenderer.invoke('get-home-path'),
  
  /**
   * Shows a message dialog.
   * @param {Object} options - Options for Electron's `dialog.showMessageBox` method.
   * @returns {Promise<Object>} A Promise that resolves with the message box result.
   */
  showMessage: (options) => ipcRenderer.invoke('show-message', options),

  /**
   * Shows a confirmation dialog.
   * @param {Object} options - Options for Electron's `dialog.showMessageBox` method (usually type: 'question').
   * @returns {Promise<Object>} A Promise that resolves with the confirmation box result.
   */
  showConfirmDialog: (options) => ipcRenderer.invoke('show-confirm-dialog', options),
  
  /**
   * Reads text from the clipboard.
   * @returns {Promise<string>} A Promise that resolves with the text from the clipboard.
   */
  readClipboard: () => ipcRenderer.invoke('read-clipboard'),

  /**
   * Writes text to the clipboard.
   * @param {string} text - The text to write to the clipboard.
   * @returns {Promise<void>} A Promise that resolves when the operation is complete.
   */
  writeClipboard: (text) => ipcRenderer.invoke('write-clipboard', text),
  
  /**
   * Listens for SSH data from the main process.
   * @param {function(connectionId: string, data: string): void} callback - Called when SSH data is received.
   *   - {string} connectionId - The ID of the SSH connection.
   *   - {string} data - The data received from the SSH connection.
   * @returns {function(): void} A function to remove the event listener.
   */
  onSSHData: (callback) => {
    ipcRenderer.on('ssh-data', (event, connectionId, data) => callback(connectionId, data));
    return () => ipcRenderer.removeListener('ssh-data', callback);
  },

  /**
   * Listens for an SSH connection close.
   * @param {function(connectionId: string): void} callback - Called when an SSH connection is closed.
   *   - {string} connectionId - The ID of the closed SSH connection.
   * @returns {function(): void} A function to remove the event listener.
   */
  onSSHClose: (callback) => {
    ipcRenderer.on('ssh-close', (event, connectionId) => callback(connectionId));
    return () => ipcRenderer.removeListener('ssh-close', callback);
  },

  /**
   * Listens for SSH connection errors.
   * @param {function(connectionId: string, error: Error): void} callback - Called when an SSH connection error occurs.
   *   - {string} connectionId - The ID of the SSH connection where the error occurred.
   *   - {Error} error - The error object.
   * @returns {function(): void} A function to remove the event listener.
   */
  onSSHError: (callback) => {
    ipcRenderer.on('ssh-error', (event, connectionId, error) => callback(connectionId, error));
    return () => ipcRenderer.removeListener('ssh-error', callback);
  },
  
  /**
   * Listens for SFTP transfer updates.
   * @param {function(transferId: string, transfer: Object): void} callback - Called when an SFTP transfer is updated.
   *   - {string} transferId - The ID of the transfer.
   *   - {Object} transfer - The transfer status object.
   * @returns {function(): void} A function to remove the event listener.
   */
  onSFTPTransferUpdate: (callback) => {
    ipcRenderer.on('sftp-transfer-update', (event, transferId, transfer) => callback(transferId, transfer));
    return () => ipcRenderer.removeListener('sftp-transfer-update', callback);
  },
  
  /**
   * Listens for the 'New Connection' action from the menu.
   * @param {function(): void} callback - Called when the action is triggered.
   * @returns {function(): void} A function to remove the event listener.
   */
  onNewConnection: (callback) => {
    ipcRenderer.on('menu-new-connection', callback);
    return () => ipcRenderer.removeListener('menu-new-connection', callback);
  },

  /**
   * Listens for the 'New Tab' action from the menu.
   * @param {function(): void} callback - Called when the action is triggered.
   * @returns {function(): void} A function to remove the event listener.
   */
  onNewTab: (callback) => {
    ipcRenderer.on('menu-new-tab', callback);
    return () => ipcRenderer.removeListener('menu-new-tab', callback);
  },

  /**
   * Listens for the 'About' action from the menu.
   * @param {function(): void} callback - Called when the action is triggered.
   * @returns {function(): void} A function to remove the event listener.
   */
  onAbout: (callback) => {
    ipcRenderer.on('menu-about', callback);
    return () => ipcRenderer.removeListener('menu-about', callback);
  },

  /**
   * Listens for remote server system information updates.
   * @param {function(data: Object): void} callback - Called when system information is updated.
   *   - {Object} data - The updated system information data.
   * @returns {function(): void} A function to remove the event listener.
   */
  onRemoteSystemInfoUpdate: (callback) => {
    ipcRenderer.on('remote-system-info-update', (event, value) => callback(value));
    // It's good practice to also return the unbind function to clean up the listener when the component unmounts.
    return () => ipcRenderer.removeListener('remote-system-info-update', callback);
  },

  /**
   * Listens for the event to clear remote server system information.
   * @param {function(data: Object): void} callback - Called when system information is cleared.
   *   - {Object} data - Usually contains { connectionId: string }.
   * @returns {function(): void} A function to remove the event listener.
   */
  onClearRemoteSystemInfo: (callback) => {
    ipcRenderer.on('clear-remote-system-info', (event, value) => callback(value));
    return () => ipcRenderer.removeListener('clear-remote-system-info', callback);
  },

  /**
   * Listens for the event indicating that the SFTP browser is ready.
   * @param {function(data: Object): void} callback - Called when SFTP is ready.
   *   - {Object} data - SFTP connection info (sshConnectionId, sftpConnectionId, initialPath).
   * @returns {function(): void} A function to remove the event listener.
   */
  onSftpReady: (callback) => {
    ipcRenderer.on('sftp-ready', (event, data) => callback(data));
    return () => ipcRenderer.removeListener('sftp-ready', callback);
  },

  /**
   * Listens for the event indicating that the SFTP connection has closed.
   * @param {function(data: Object): void} callback - Called when SFTP is closed.
   *   - {Object} data - Information about the reason for closing and connection IDs.
   * @returns {function(): void} A function to remove the event listener.
   */
  onSftpClose: (callback) => {
    ipcRenderer.on('sftp-close', (event, data) => callback(data));
    return () => ipcRenderer.removeListener('sftp-close', callback);
  },

  /**
   * Reads a remote file on the specified SFTP connection.
   * @param {string} sftpConnectionId - The ID of the SFTP connection.
   * @param {string} remotePath - The path of the remote file to read.
   * @returns {Promise<Object>} A Promise that resolves with the file content or an error.
   */
  sftpReadFile: (sftpConnectionId, remotePath) => ipcRenderer.invoke('sftp-read-file', { connectionId: sftpConnectionId, remoteFilePath: remotePath }),

  /**
   * Writes content to a remote file on the specified SFTP connection.
   * @param {string} sftpConnectionId - The ID of the SFTP connection.
   * @param {string} remotePath - The path of the remote file to write content to.
   * @param {string} content - The content to write.
   * @param {string} [sshConnectionId] - The ID of the associated SSH connection (this parameter is received by the `sftp-write-file` handler in the current main.js).
   * @returns {Promise<Object>} A Promise that resolves with the result of the write operation.
   */
  sftpWriteFile: (sftpConnectionId, remotePath, content, sshConnectionId) => ipcRenderer.invoke('sftp-write-file', { connectionId: sftpConnectionId, remoteFilePath: remotePath, content, sshConnectionId })
}); 