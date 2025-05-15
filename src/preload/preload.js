const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing all of its APIs
contextBridge.exposeInMainWorld('api', {
  // Connection management
  getSavedConnections: () => ipcRenderer.invoke('get-saved-connections'),
  saveConnection: (connection) => ipcRenderer.invoke('save-connection', connection),
  deleteConnection: (connectionId) => ipcRenderer.invoke('delete-connection', connectionId),
  
  // SSH operations
  connectSSH: (connection) => ipcRenderer.invoke('connect-ssh', connection),
  writeSSH: (connectionId, data) => ipcRenderer.invoke('write-ssh', connectionId, data),
  resizeSSH: (connectionId, cols, rows) => ipcRenderer.invoke('resize-ssh', connectionId, cols, rows),
  disconnectSSH: (connectionId) => ipcRenderer.invoke('disconnect-ssh', connectionId),
  
  // SFTP operations
  connectSFTP: (connection) => ipcRenderer.invoke('connect-sftp', connection),
  disconnectSFTP: (connectionId) => ipcRenderer.invoke('disconnect-sftp', connectionId),
  sftpList: (connectionId, remotePath) => ipcRenderer.invoke('sftp-list', connectionId, remotePath),
  sftpMkdir: (connectionId, remotePath) => ipcRenderer.invoke('sftp-mkdir', connectionId, remotePath),
  sftpDelete: (connectionId, remotePath) => ipcRenderer.invoke('sftp-delete', connectionId, remotePath),
  sftpRmdir: (connectionId, remotePath, recursive) => ipcRenderer.invoke('sftp-rmdir', connectionId, remotePath, recursive),
  sftpRename: (connectionId, fromPath, toPath) => ipcRenderer.invoke('sftp-rename', connectionId, fromPath, toPath),
  sftpDownload: (connectionId, remotePath, localPath) => ipcRenderer.invoke('sftp-download', connectionId, remotePath, localPath),
  sftpUpload: (connectionId, localPath, remotePath) => ipcRenderer.invoke('sftp-upload', connectionId, localPath, remotePath),
  sftpGetTransferStatus: (transferId) => ipcRenderer.invoke('sftp-get-transfer-status', transferId),
  sftpCancelTransfer: (transferId) => ipcRenderer.invoke('sftp-cancel-transfer', transferId),
  sftpGetCurrentDirectory: (connectionId) => ipcRenderer.invoke('sftp-get-current-directory', connectionId),
  sftpSetCurrentDirectory: (connectionId, remotePath) => ipcRenderer.invoke('sftp-set-current-directory', connectionId, remotePath),
  sftpStat: (connectionId, remotePath) => ipcRenderer.invoke('sftp-stat', connectionId, remotePath),
  
  // File dialogs
  openFileDialog: (options) => ipcRenderer.invoke('open-file-dialog', options),
  saveFileDialog: (options) => ipcRenderer.invoke('save-file-dialog', options),
  getHomePath: () => ipcRenderer.invoke('get-home-path'),
  
  // Message dialogs
  showMessage: (options) => ipcRenderer.invoke('show-message', options),
  showConfirmDialog: (options) => ipcRenderer.invoke('show-confirm-dialog', options),
  
  // Clipboard operations
  readClipboard: () => ipcRenderer.invoke('read-clipboard'),
  writeClipboard: (text) => ipcRenderer.invoke('write-clipboard', text),
  
  // SSH event listeners
  onSSHData: (callback) => {
    ipcRenderer.on('ssh-data', (event, connectionId, data) => callback(connectionId, data));
    return () => ipcRenderer.removeListener('ssh-data', callback);
  },
  onSSHClose: (callback) => {
    ipcRenderer.on('ssh-close', (event, connectionId) => callback(connectionId));
    return () => ipcRenderer.removeListener('ssh-close', callback);
  },
  onSSHError: (callback) => {
    ipcRenderer.on('ssh-error', (event, connectionId, error) => callback(connectionId, error));
    return () => ipcRenderer.removeListener('ssh-error', callback);
  },
  
  // SFTP event listeners
  onSFTPTransferUpdate: (callback) => {
    ipcRenderer.on('sftp-transfer-update', (event, transferId, transfer) => callback(transferId, transfer));
    return () => ipcRenderer.removeListener('sftp-transfer-update', callback);
  },
  
  // Menu event listeners
  onNewConnection: (callback) => {
    ipcRenderer.on('menu-new-connection', callback);
    return () => ipcRenderer.removeListener('menu-new-connection', callback);
  },
  onNewTab: (callback) => {
    ipcRenderer.on('menu-new-tab', callback);
    return () => ipcRenderer.removeListener('menu-new-tab', callback);
  },
  onAbout: (callback) => {
    ipcRenderer.on('menu-about', callback);
    return () => ipcRenderer.removeListener('menu-about', callback);
  },

  // Uzak Sunucu Sistem Bilgisi Dinleyicileri
  onRemoteSystemInfoUpdate: (callback) => {
    ipcRenderer.on('remote-system-info-update', (event, value) => callback(value));
    // Kaldırma fonksiyonunu da döndürmek iyi bir pratiktir, bileşen kaldırıldığında dinleyiciyi temizlemek için.
    return () => ipcRenderer.removeListener('remote-system-info-update', callback);
  },
  onClearRemoteSystemInfo: (callback) => {
    ipcRenderer.on('clear-remote-system-info', (event, value) => callback(value));
    return () => ipcRenderer.removeListener('clear-remote-system-info', callback);
  }
}); 