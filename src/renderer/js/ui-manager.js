/**
 * Manages UI interactions and connections between other managers.
 */
export class UIManager {
  /**
   * Initializes the UI Manager.
   * @param {ConnectionManager} connectionManager - The connection manager instance.
   * @param {TerminalManager} terminalManager - The terminal manager instance.
   * @param {TabManager} tabManager - The tab manager instance.
   * @param {SFTPManager} sftpManager - The SFTP manager instance.
   */
  constructor(connectionManager, terminalManager, tabManager, sftpManager) {
    this.connectionManager = connectionManager;
    this.terminalManager = terminalManager;
    this.tabManager = tabManager;
    this.sftpManager = sftpManager;
    
    // DOM elements
    this.connectionsList = document.getElementById('connectionsList');
    this.newConnectionBtn = document.getElementById('newConnectionBtn');
    this.newTabBtn = document.getElementById('newTabBtn');
    this.connectionModal = document.getElementById('connectionModal');
    this.connectionForm = document.getElementById('connectionForm');
    this.closeModal = document.getElementById('closeModal');
    this.cancelBtn = document.getElementById('cancelBtn');
    this.authType = document.getElementById('authType');
    this.passwordGroup = document.getElementById('passwordGroup');
    this.privateKeyGroup = document.getElementById('privateKeyGroup');
    this.aboutModal = document.getElementById('aboutModal');
    this.closeAboutModal = document.getElementById('closeAboutModal');
    this.browseKeyBtn = document.getElementById('browseKeyBtn');
    
    // Bind event handlers
    this.handleNewConnection = this.handleNewConnection.bind(this);
    this.handleSubmitConnection = this.handleSubmitConnection.bind(this);
    this.handleAuthTypeChange = this.handleAuthTypeChange.bind(this);
    this.handleConnectionClick = this.handleConnectionClick.bind(this);
    this.updateConnectionsList = this.updateConnectionsList.bind(this);
    this.handleBrowseForKey = this.handleBrowseForKey.bind(this);
  }
  
  /**
   * Initializes the UI and adds necessary event listeners.
   */
  init() {
    // Set up button event listeners
    this.newConnectionBtn.addEventListener('click', () => this.showConnectionModal());
    this.newTabBtn.addEventListener('click', () => this.tabManager.createNewTab());
    this.closeModal.addEventListener('click', () => this.hideConnectionModal());
    this.cancelBtn.addEventListener('click', () => this.hideConnectionModal());
    this.closeAboutModal.addEventListener('click', () => this.hideAboutModal());
    this.browseKeyBtn.addEventListener('click', this.handleBrowseForKey);
    
    // Set up form event listeners
    this.connectionForm.addEventListener('submit', this.handleSubmitConnection);
    this.authType.addEventListener('change', this.handleAuthTypeChange);
    
    // Update connections list
    this.updateConnectionsList();
    
    // Subscribe to connection manager events
    this.connectionManager.onConnectionsUpdated(this.updateConnectionsList);
  }

  /**
   * Shows the add/edit connection modal.
   * @param {Object} existingConnection - The existing connection to edit (optional).
   */
  showConnectionModal(existingConnection = null) {
    // Reset form
    this.connectionForm.reset();
    
    // Set modal title
    const modalTitle = document.querySelector('#connectionModal .modal-header h2');
    modalTitle.textContent = existingConnection ? 'Edit Connection' : 'New Connection';
    
    // If editing existing connection, fill in the form
    if (existingConnection) {
      document.getElementById('connectionName').value = existingConnection.name;
      document.getElementById('host').value = existingConnection.host;
      document.getElementById('port').value = existingConnection.port;
      document.getElementById('username').value = existingConnection.username;
      document.getElementById('authType').value = existingConnection.authType;
      
      if (existingConnection.authType === 'password') {
        document.getElementById('password').value = existingConnection.password || '';
      } else {
        document.getElementById('privateKeyPath').value = existingConnection.privateKeyPath || '';
        document.getElementById('passphrase').value = existingConnection.passphrase || '';
      }
      
      // Store connection ID for editing
      this.connectionForm.dataset.connectionId = existingConnection.id;
      
      // Update auth type visibility
      this.handleAuthTypeChange();
    } else {
      // Clear connection ID
      delete this.connectionForm.dataset.connectionId;
      
      // Set default auth type to password
      document.getElementById('authType').value = 'password';
      this.handleAuthTypeChange();
    }
    
    // Show modal
    this.connectionModal.classList.add('show');
  }
  
  /**
   * Hides the add/edit connection modal.
   */
  hideConnectionModal() {
    this.connectionModal.classList.remove('show');
  }
  
  /**
   * Shows the about modal.
   */
  showAboutModal() {
    this.aboutModal.classList.add('show');
  }
  
  /**
   * Hides the about modal.
   */
  hideAboutModal() {
    this.aboutModal.classList.remove('show');
  }
  
  /**
   * Handles the request to add a new connection.
   */
  handleNewConnection() {
    this.showConnectionModal();
  }
  
  /**
   * Validates the connection information.
   * @param {Object} connection - The connection object to validate.
   * @returns {Object} Validation result with isValid and message properties.
   */
  validateConnection(connection) {
    if (!connection.name || connection.name.trim() === '') {
      return { isValid: false, message: 'Connection name is required' };
    }
    
    if (!connection.host || connection.host.trim() === '') {
      return { isValid: false, message: 'Server address is required' };
    }
    
    if (!connection.port || connection.port <= 0 || connection.port > 65535) {
      return { isValid: false, message: 'Port must be between 1 and 65535' };
    }
    
    if (!connection.username || connection.username.trim() === '') {
      return { isValid: false, message: 'Username is required' };
    }
    
    if (connection.authType === 'password') {
      if (!connection.password || connection.password.trim() === '') {
        return { isValid: false, message: 'Password is required for password authentication' };
      }
    } else if (connection.authType === 'privateKey') {
      if (!connection.privateKeyPath || connection.privateKeyPath.trim() === '') {
        return { isValid: false, message: 'Key path is required for private key authentication' };
      }
    }
    
    return { isValid: true, message: '' };
  }
  
  /**
   * Handles the connection form submission.
   * @param {Event} event - The form submission event.
   */
  async handleSubmitConnection(event) {
    event.preventDefault();
    
    // Get form values
    const name = document.getElementById('connectionName').value;
    const host = document.getElementById('host').value;
    const port = parseInt(document.getElementById('port').value, 10);
    const username = document.getElementById('username').value;
    const authType = document.getElementById('authType').value;
    
    // Create connection object
    const connection = {
      name,
      host,
      port,
      username,
      authType
    };
    
    // Add auth details based on type
    if (authType === 'password') {
      connection.password = document.getElementById('password').value;
    } else {
      connection.privateKeyPath = document.getElementById('privateKeyPath').value;
      connection.passphrase = document.getElementById('passphrase').value;
    }
    
    // Check if editing existing connection
    if (this.connectionForm.dataset.connectionId) {
      connection.id = this.connectionForm.dataset.connectionId;
    }
    
    // Validate connection
    const validation = this.validateConnection(connection);
    if (!validation.isValid) {
      // Show error message
      window.api.showMessage({
        type: 'error',
        title: 'Invalid Connection',
        message: validation.message
      });
      return;
    }
    
    // Save connection
    try {
      await this.connectionManager.saveConnection(connection);
      
      // Hide modal
      this.hideConnectionModal();
    } catch (error) {
      // Show error message
      window.api.showMessage({
        type: 'error',
        title: 'Save Error',
        message: `Failed to save connection: ${error.message}`
      });
    }
  }
  
  /**
   * Handles the authentication type change.
   */
  handleAuthTypeChange() {
    const authType = this.authType.value;
    
    if (authType === 'password') {
      this.passwordGroup.classList.remove('hidden');
      this.privateKeyGroup.classList.add('hidden');
    } else {
      this.passwordGroup.classList.add('hidden');
      this.privateKeyGroup.classList.remove('hidden');
    }
  }
  
  /**
   * Handles clicking on a connection item.
   * @param {Object} connection - The clicked connection.
   */
  handleConnectionClick(connection) {
    // Create a new tab with the connection
    this.tabManager.createNewTab(connection.name, connection);
  }
  
  /**
   * Updates the list of saved connections in the UI.
   */
  updateConnectionsList() {
    // Clear the existing list
    this.connectionsList.innerHTML = '';
    
    // Get all connections
    const connections = this.connectionManager.getConnections();
    
    // If no connections, show message
    if (connections.length === 0) {
      const noConnections = document.createElement('div');
      noConnections.className = 'no-connections';
      noConnections.textContent = 'No saved connections';
      this.connectionsList.appendChild(noConnections);
      return;
    }
    
    // Create connection items
    connections.forEach(connection => {
      const connectionItem = document.createElement('div');
      connectionItem.className = 'connection-item';
      
      // Connection info
      const connectionInfo = document.createElement('div');
      connectionInfo.className = 'connection-info';
      
      const connectionName = document.createElement('div');
      connectionName.className = 'connection-name';
      connectionName.textContent = connection.name;
      
      const connectionDetails = document.createElement('div');
      connectionDetails.className = 'connection-details';
      connectionDetails.textContent = `${connection.username}@${connection.host}:${connection.port}`;
      
      connectionInfo.appendChild(connectionName);
      connectionInfo.appendChild(connectionDetails);
      
      // Connection actions
      const connectionActions = document.createElement('div');
      connectionActions.className = 'connection-actions';
      
      const editAction = document.createElement('div');
      editAction.className = 'connection-action';
      editAction.textContent = '✏️';
      editAction.title = 'Edit connection';
      editAction.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showConnectionModal(connection);
      });
      
      const deleteAction = document.createElement('div');
      deleteAction.className = 'connection-action';
      deleteAction.textContent = '🗑️';
      deleteAction.title = 'Delete connection';
      deleteAction.addEventListener('click', async (e) => {
        e.stopPropagation();
        const confirmDelete = await window.api.showConfirmDialog({
          title: 'Delete Connection',
          message: `Are you sure you want to delete the connection "${connection.name}"?`,
          buttons: ['Delete', 'Cancel']
        });
        
        if (confirmDelete.response === 0) {
          try {
            await this.connectionManager.deleteConnection(connection.id);
          } catch (error) {
            window.api.showMessage({
              type: 'error',
              title: 'Delete Error',
              message: `Failed to delete connection: ${error.message}`
            });
          }
        }
      });
      
      connectionActions.appendChild(editAction);
      connectionActions.appendChild(deleteAction);
      
      // Add everything to the connection item
      connectionItem.appendChild(connectionInfo);
      connectionItem.appendChild(connectionActions);
      
      // Add click handler for connection
      connectionItem.addEventListener('click', () => {
        this.handleConnectionClick(connection);
      });
      
      // Add to the list
      this.connectionsList.appendChild(connectionItem);
    });
  }

  /**
   * Opens a file dialog to select a private key file.
   */
  async handleBrowseForKey() {
    try {
      // Use the main process to open a file dialog
      const result = await window.api.openFileDialog({
        title: 'Select Private Key File',
        defaultPath: window.api.getHomePath(),
        buttonLabel: 'Select Key',
        filters: [
          { name: 'Key Files', extensions: ['pem', 'key', 'ppk', 'pub'] },
          { name: 'All Files', extensions: ['*'] }
        ],
        properties: ['openFile']
      });

      if (!result.canceled && result.filePaths.length > 0) {
        // Set the private key path input
        document.getElementById('privateKeyPath').value = result.filePaths[0];
      }
    } catch (error) {
      console.error('Failed to open file dialog:', error);
    }
  }
} 