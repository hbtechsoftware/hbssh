/**
 * File Browser component for SFTP operations
 */
export class FileBrowser {
  /**
   * Initialize the file browser
   * @param {SFTPManager} sftpManager - SFTP manager instance
   */
  constructor(sftpManager) {
    this.sftpManager = sftpManager;
    this.currentConnection = null;
    this.currentPath = '/';
    this.selectedItems = new Set();
    this.clipboard = null;
    this.isLoading = false;
    
    this.container = null;
    this.pathBar = null;
    this.fileList = null;
    this.statusBar = null;
    this.toolbar = null;
    this.transfersContainer = null;
    
    this.init = this.init.bind(this);
    this.createUI = this.createUI.bind(this);
    this.connect = this.connect.bind(this);
    this.disconnect = this.disconnect.bind(this);
    this.loadPath = this.loadPath.bind(this);
    this.handleItemClick = this.handleItemClick.bind(this);
    this.handleItemDoubleClick = this.handleItemDoubleClick.bind(this);
    this.handleItemContextMenu = this.handleItemContextMenu.bind(this);
    this.handlePathBarClick = this.handlePathBarClick.bind(this);
    this.handleToolbarAction = this.handleToolbarAction.bind(this);
    this.handleTransferUpdate = this.handleTransferUpdate.bind(this);
    this.renderFileList = this.renderFileList.bind(this);
    this.renderPathBar = this.renderPathBar.bind(this);
    this.updateStatusBar = this.updateStatusBar.bind(this);
    this.createFolderPrompt = this.createFolderPrompt.bind(this);
    this.renameItemPrompt = this.renameItemPrompt.bind(this);
    this.confirmDelete = this.confirmDelete.bind(this);
    this.uploadFiles = this.uploadFiles.bind(this);
    this.downloadSelectedItems = this.downloadSelectedItems.bind(this);
    
    document.addEventListener('sftp-transfer-update', (event) => {
      this.handleTransferUpdate(event.detail.transferId, event.detail.transfer);
    });
  }
  
  /**
   * Initialize the file browser
   * @param {HTMLElement} container - Container element
   */
  init(container) {
    this.container = container;
    
    // Create UI elements
    this.createUI();
  }
  
  /**
   * Create the UI elements
   */
  createUI() {
    this.container.innerHTML = '';
    
    this.toolbar = document.createElement('div');
    this.toolbar.className = 'file-browser-toolbar';
    
    const toolbarActions = [
      { id: 'upload', icon: '⬆️', title: 'Upload' },
      { id: 'download', icon: '⬇️', title: 'Download' },
      { id: 'new-folder', icon: '📁', title: 'New Folder' },
      { id: 'refresh', icon: '🔄', title: 'Refresh' },
      { id: 'delete', icon: '🗑️', title: 'Delete' }
    ];
    
    toolbarActions.forEach(action => {
      const button = document.createElement('button');
      button.className = 'toolbar-button';
      button.dataset.action = action.id;
      button.title = action.title;
      button.textContent = action.icon;
      button.addEventListener('click', () => this.handleToolbarAction(action.id));
      this.toolbar.appendChild(button);
    });
    
    this.pathBar = document.createElement('div');
    this.pathBar.className = 'file-browser-path';
    
    this.fileList = document.createElement('div');
    this.fileList.className = 'file-browser-list';
    
    this.statusBar = document.createElement('div');
    this.statusBar.className = 'file-browser-status';
    this.statusBar.textContent = 'Not connected';
    
    this.transfersContainer = document.createElement('div');
    this.transfersContainer.className = 'file-browser-transfers';
    
    this.container.appendChild(this.toolbar);
    this.container.appendChild(this.pathBar);
    this.container.appendChild(this.fileList);
    this.container.appendChild(this.statusBar);
    this.container.appendChild(this.transfersContainer);
    
    this.renderPathBar();
    this.renderFileList();
  }
  
  /**
   * Connect to an SFTP server
   * @param {Object} connection - Connection configuration
   * @returns {Promise<void>}
   */
  async connect(connection) {
    try {
      this.isLoading = true;
      this.updateStatusBar('Connecting...');
      
      const connectionId = await this.sftpManager.connect(connection);
      
      this.currentConnection = connectionId;
      
      this.currentPath = '/';
      
      this.selectedItems.clear();
      
      await this.loadPath('/');
      
      this.isLoading = false;
    } catch (error) {
      this.isLoading = false;
      this.updateStatusBar(`Connection failed: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Disconnect from the SFTP server
   */
  async disconnect() {
    if (this.currentConnection) {
      try {
        await this.sftpManager.disconnect(this.currentConnection);
      } catch (error) {
        console.error('Error disconnecting:', error);
      } finally {
        this.currentConnection = null;
        this.currentPath = '/';
        this.selectedItems.clear();
        this.renderPathBar();
        this.renderFileList();
        this.updateStatusBar('Disconnected');
      }
    }
  }
  
  /**
   * Load a directory path
   * @param {string} path - Directory path
   * @returns {Promise<void>}
   */
  async loadPath(path) {
    if (!this.currentConnection) {
      this.updateStatusBar('Not connected');
      return;
    }
    
    try {
      this.isLoading = true;
      this.updateStatusBar('Loading...v1');
      
      const files = await this.sftpManager.listDirectory(this.currentConnection, path);
      
      this.currentPath = path;
      
      this.selectedItems.clear();
      
      this.renderPathBar();
      this.renderFileList(files);
      
      this.isLoading = false;
      this.updateStatusBar(`Loaded there are ${files.length} items`);
    } catch (error) {
      this.isLoading = false;
      this.updateStatusBar(`Error: ${error.message}`);
    }
  }
  
  /**
   * Render the file list
   * @param {Array} files - List of files to render
   */
  renderFileList(files = []) {
    this.fileList.innerHTML = '';
    
    if (!this.currentConnection) {
      const message = document.createElement('div');
      message.className = 'file-browser-message';
      message.textContent = 'Not connected to SFTP server';
      this.fileList.appendChild(message);
      return;
    }
    
    if (this.isLoading) {
      const loading = document.createElement('div');
      loading.className = 'file-browser-loading';
      loading.textContent = 'Loading...';
      this.fileList.appendChild(loading);
      return;
    }
    
    if (this.currentPath !== '/') {
      const parentItem = document.createElement('div');
      parentItem.className = 'file-item parent-dir';
      parentItem.innerHTML = `
        <div class="file-icon">📁</div>
        <div class="file-name">..</div>
      `;
      parentItem.addEventListener('dblclick', () => {
        const parentPath = this.currentPath.split('/').slice(0, -1).join('/') || '/';
        this.loadPath(parentPath);
      });
      this.fileList.appendChild(parentItem);
    }
    
    const sortedFiles = [...files].sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });
    
    sortedFiles.forEach(file => {
      const fileItem = document.createElement('div');
      fileItem.className = 'file-item';
      fileItem.dataset.path = `${this.currentPath === '/' ? '' : this.currentPath}/${file.name}`;
      fileItem.dataset.name = file.name;
      fileItem.dataset.type = file.isDirectory ? 'directory' : 'file';
      
      let icon = '📄';
      if (file.isDirectory) {
        icon = '📁';
      } else if (file.isSymlink) {
        icon = '🔗';
      }
      
      if (this.selectedItems.has(fileItem.dataset.path)) {
        fileItem.classList.add('selected');
      }
      
      fileItem.innerHTML = `
        <div class="file-icon">${icon}</div>
        <div class="file-name">${file.name}</div>
        <div class="file-size">${file.isDirectory ? '-' : this.formatFileSize(file.size)}</div>
        <div class="file-date">${new Date(file.modifyTime).toLocaleString()}</div>
      `;
      
      fileItem.addEventListener('click', (event) => this.handleItemClick(event, fileItem));
      fileItem.addEventListener('dblclick', () => this.handleItemDoubleClick(fileItem));
      fileItem.addEventListener('contextmenu', (event) => this.handleItemContextMenu(event, fileItem));
      
      if (!file.isDirectory) {
        fileItem.draggable = true;
        fileItem.addEventListener('dragstart', (event) => {
          event.dataTransfer.setData('text/plain', fileItem.dataset.path);
          event.dataTransfer.effectAllowed = 'copy';
        });
      }
      
      this.fileList.appendChild(fileItem);
    });
    
    if (files.length === 0 && this.currentPath === '/') {
      const emptyMessage = document.createElement('div');
      emptyMessage.className = 'file-browser-message';
      emptyMessage.textContent = 'This directory is empty';
      this.fileList.appendChild(emptyMessage);
    }
  }
  
  /**
   * Render the path bar
   */
  renderPathBar() {
    this.pathBar.innerHTML = '';
    
    if (!this.currentConnection) {
      this.pathBar.textContent = 'Not connected';
      return;
    }
    
    const pathSegments = this.currentPath.split('/').filter(segment => segment !== '');
    
    const rootElement = document.createElement('span');
    rootElement.className = 'path-segment';
    rootElement.textContent = '/';
    rootElement.dataset.path = '/';
    rootElement.addEventListener('click', () => this.handlePathBarClick('/'));
    this.pathBar.appendChild(rootElement);
    
    let currentPath = '';
    pathSegments.forEach(segment => {
      currentPath += '/' + segment;

      const separator = document.createElement('span');
      separator.className = 'path-separator';
      separator.textContent = ' > ';
      this.pathBar.appendChild(separator);
      
      const segmentElement = document.createElement('span');
      segmentElement.className = 'path-segment';
      segmentElement.textContent = segment;
      segmentElement.dataset.path = currentPath;
      segmentElement.addEventListener('click', () => this.handlePathBarClick(currentPath));
      this.pathBar.appendChild(segmentElement);
    });
  }
  
  /**
   * Handle click on a path segment
   * @param {string} path - Path to navigate to
   */
  handlePathBarClick(path) {
    this.loadPath(path);
  }
  
  /**
   * Handle click on a file item
   * @param {Event} event - Click event
   * @param {HTMLElement} item - File item element
   */
  handleItemClick(event, item) {
    const path = item.dataset.path;
    
    if (event.ctrlKey || event.metaKey) {
      if (this.selectedItems.has(path)) {
        this.selectedItems.delete(path);
        item.classList.remove('selected');
      } else {
        this.selectedItems.add(path);
        item.classList.add('selected');
      }
    } 
    else if (event.shiftKey && this.selectedItems.size > 0) {
    }
    else {
      this.selectedItems.clear();
      this.fileList.querySelectorAll('.file-item.selected').forEach(el => {
        el.classList.remove('selected');
      });
      this.selectedItems.add(path);
      item.classList.add('selected');
    }
    
    this.updateStatusBar(`${this.selectedItems.size} item(s) selected`);
  }
  
  /**
   * Handle double click on a file item
   * @param {HTMLElement} item - File item element
   */
  handleItemDoubleClick(item) {
    const path = item.dataset.path;
    const type = item.dataset.type;
    
    if (type === 'directory') {
      this.loadPath(path);
    } else {
      this.downloadFile(path);
    }
  }
  
  /**
   * Handle context menu on a file item
   * @param {Event} event - Context menu event
   * @param {HTMLElement} item - File item element
   */
  handleItemContextMenu(event, item) {
    event.preventDefault();
    
    const path = item.dataset.path;
    const type = item.dataset.type;
    
    if (!this.selectedItems.has(path)) {
      this.selectedItems.clear();
      this.fileList.querySelectorAll('.file-item.selected').forEach(el => {
        el.classList.remove('selected');
      });
      this.selectedItems.add(path);
      item.classList.add('selected');
    }
    
    const contextMenu = document.createElement('div');
    contextMenu.className = 'context-menu';
    contextMenu.style.position = 'absolute';
    contextMenu.style.left = `${event.pageX}px`;
    contextMenu.style.top = `${event.pageY}px`;
    
    const menuItems = [
      {
        label: type === 'directory' ? 'Open' : 'Download',
        action: () => {
          if (type === 'directory') {
            this.loadPath(path);
          } else {
            this.downloadFile(path);
          }
        }
      },
      {
        label: 'Rename',
        action: () => this.renameItemPrompt(path)
      },
      {
        label: 'Delete',
        action: () => this.confirmDelete([path])
      }
    ];
    
    menuItems.forEach(menuItem => {
      const menuItemElement = document.createElement('div');
      menuItemElement.className = 'context-menu-item';
      menuItemElement.textContent = menuItem.label;
      menuItemElement.addEventListener('click', () => {
        menuItem.action();
        document.body.removeChild(contextMenu);
      });
      contextMenu.appendChild(menuItemElement);
    });
    
    document.body.appendChild(contextMenu);
    
    const closeMenu = () => {
      if (document.body.contains(contextMenu)) {
        document.body.removeChild(contextMenu);
      }
      document.removeEventListener('click', closeMenu);
    };
    
    setTimeout(() => {
      document.addEventListener('click', closeMenu);
    }, 0);
  }
  
  /**
   * Handle toolbar actions
   * @param {string} action - Action ID
   */
  handleToolbarAction(action) {
    if (!this.currentConnection) {
      this.updateStatusBar('Not connected');
      return;
    }
    
    switch (action) {
      case 'upload':
        this.uploadFiles();
        break;
      case 'download':
        this.downloadSelectedItems();
        break;
      case 'new-folder':
        this.createFolderPrompt();
        break;
      case 'refresh':
        this.loadPath(this.currentPath);
        break;
      case 'delete':
        this.confirmDelete(Array.from(this.selectedItems));
        break;
    }
  }
  
  /**
   * Format file size for display
   * @param {number} bytes - File size in bytes
   * @returns {string} Formatted file size
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    
    return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + sizes[i];
  }
  
  /**
   * Update status bar text
   * @param {string} text - Status text
   */
  updateStatusBar(text) {
    this.statusBar.textContent = text;
  }
  
  /**
   * Prompt for new folder creation
   */
  async createFolderPrompt() {
    if (!this.currentConnection) return;
    
    const folderName = await window.api.showPrompt({
      title: 'Create Folder',
      message: 'Enter folder name:',
      defaultValue: 'New Folder'
    });
    
    if (folderName) {
      try {
        const path = `${this.currentPath === '/' ? '' : this.currentPath}/${folderName}`;
        await this.sftpManager.createDirectory(this.currentConnection, path);
        this.loadPath(this.currentPath);
      } catch (error) {
        window.api.showMessage({
          type: 'error',
          title: 'Error',
          message: `Failed to create folder: ${error.message}`
        });
      }
    }
  }
  
  /**
   * Prompt for renaming an item
   * @param {string} path - Item path
   */
  async renameItemPrompt(path) {
    if (!this.currentConnection) return;
    
    const name = path.split('/').pop();
    const directory = path.substring(0, path.length - name.length);
    
    const newName = await window.api.showPrompt({
      title: 'Rename Item',
      message: 'Enter new name:',
      defaultValue: name
    });
    
    if (newName && newName !== name) {
      try {
        const newPath = `${directory}${newName}`;
        await this.sftpManager.renameItem(this.currentConnection, path, newPath);
        this.loadPath(this.currentPath);
      } catch (error) {
        window.api.showMessage({
          type: 'error',
          title: 'Error',
          message: `Failed to rename item: ${error.message}`
        });
      }
    }
  }
  
  /**
   * Confirm deletion of items
   * @param {Array} paths - Array of paths to delete
   */
  async confirmDelete(paths) {
    if (!this.currentConnection || paths.length === 0) return;
    
    const confirmResult = await window.api.showConfirmDialog({
      title: 'Confirm Delete',
      message: `Are you sure you want to delete ${paths.length} item(s)?`,
      buttons: ['Delete', 'Cancel']
    });
    
    if (confirmResult.response === 0) {
      this.updateStatusBar('Deleting...');
      
      for (const path of paths) {
        try {
          const item = this.fileList.querySelector(`[data-path="${path}"]`);
          const isDirectory = item && item.dataset.type === 'directory';
          
          if (isDirectory) {
            await this.sftpManager.deleteDirectory(this.currentConnection, path, true);
          } else {
            await this.sftpManager.deleteFile(this.currentConnection, path);
          }
        } catch (error) {
          console.error(`Failed to delete ${path}:`, error);
        }
      }
      
      this.loadPath(this.currentPath);
    }
  }
  
  /**
   * Upload files to the current directory
   */
  async uploadFiles() {
    if (!this.currentConnection) return;
    
    try {
      const result = await window.api.openFileDialog({
        title: 'Select File(s) to Upload',
        properties: ['openFile', 'multiSelections']
      });
      
      if (!result.canceled && result.filePaths.length > 0) {
        this.updateStatusBar(`Uploading ${result.filePaths.length} file(s)...`);
        
        for (const localPath of result.filePaths) {
          const fileName = localPath.split(/[/\\]/).pop();
          const remotePath = `${this.currentPath === '/' ? '' : this.currentPath}/${fileName}`;
          
          try {
            await this.sftpManager.uploadFile(this.currentConnection, localPath, remotePath);
          } catch (error) {
            console.error(`Failed to upload ${localPath}:`, error);
          }
        }
        
        this.loadPath(this.currentPath);
      }
    } catch (error) {
      this.updateStatusBar(`Upload error: ${error.message}`);
    }
  }
  
  /**
   * Download selected items
   */
  async downloadSelectedItems() {
    if (!this.currentConnection || this.selectedItems.size === 0) return;
    
    try {
      const saveResult = await window.api.openFileDialog({
        title: 'Select Download Location',
        properties: ['openDirectory']
      });
      
      if (!saveResult.canceled && saveResult.filePaths.length > 0) {
        const saveDir = saveResult.filePaths[0];
        
        this.updateStatusBar(`Downloading ${this.selectedItems.size} item(s)...`);
        
        for (const remotePath of this.selectedItems) {
          try {
            const item = this.fileList.querySelector(`[data-path="${remotePath}"]`);
            const isDirectory = item && item.dataset.type === 'directory';
            const fileName = remotePath.split('/').pop();
            const localPath = `${saveDir}/${fileName}`;
            
            if (isDirectory) {
              console.log(`Directory download not implemented: ${remotePath}`);
            } else {
              await this.sftpManager.downloadFile(this.currentConnection, remotePath, localPath);
            }
          } catch (error) {
            console.error(`Failed to download ${remotePath}:`, error);
          }
        }
      }
    } catch (error) {
      this.updateStatusBar(`Download error: ${error.message}`);
    }
  }
  
  /**
   * Download a single file
   * @param {string} remotePath - Remote file path
   */
  async downloadFile(remotePath) {
    if (!this.currentConnection) return;
    
    try {
      const fileName = remotePath.split('/').pop();
      
      const saveResult = await window.api.saveFileDialog({
        title: 'Save File As',
        defaultPath: fileName
      });
      
      if (!saveResult.canceled && saveResult.filePath) {
        this.updateStatusBar(`Downloading ${fileName}...`);
        
        await this.sftpManager.downloadFile(this.currentConnection, remotePath, saveResult.filePath);
      }
    } catch (error) {
      this.updateStatusBar(`Download error: ${error.message}`);
    }
  }
  
  /**
   * Handle transfer update event
   * @param {string} transferId - Transfer ID
   * @param {Object} transfer - Transfer object
   */
  handleTransferUpdate(transferId, transfer) {
    let transferElement = document.getElementById(`transfer-${transferId}`);
    
    if (!transferElement) {
      transferElement = document.createElement('div');
      transferElement.id = `transfer-${transferId}`;
      transferElement.className = 'transfer-item';
      this.transfersContainer.appendChild(transferElement);
    }
    
    const fileName = transfer.remotePath.split('/').pop();
    
    transferElement.innerHTML = `
      <div class="transfer-info">
        <div class="transfer-name">${fileName}</div>
        <div class="transfer-type">${transfer.type === 'upload' ? '⬆️' : '⬇️'}</div>
        <div class="transfer-progress">${transfer.progress}%</div>
        <div class="transfer-status">${transfer.status}</div>
      </div>
      <div class="transfer-progress-bar">
        <div class="transfer-progress-fill" style="width: ${transfer.progress}%"></div>
      </div>
    `;
    
    if (transfer.status === 'completed' || transfer.status === 'error' || transfer.status === 'cancelled') {
      setTimeout(() => {
        if (transferElement.parentNode) {
          transferElement.parentNode.removeChild(transferElement);
        }
      }, 5000);
    }
    
    const activeTransfers = Object.values(this.sftpManager.getTransfers()).filter(t => 
      t.status !== 'completed' && t.status !== 'error' && t.status !== 'cancelled'
    );
    
    if (activeTransfers.length === 0) {
      this.loadPath(this.currentPath);
    }
  }
} 