/**
 * Arayüz etkileşimlerini ve diğer yöneticiler arasındaki bağlantıları yönetir
 */
export class UIManager {
  /**
   * UI Yöneticisini başlatır
   * @param {ConnectionManager} connectionManager - Bağlantı yöneticisi örneği
   * @param {TerminalManager} terminalManager - Terminal yöneticisi örneği
   * @param {TabManager} tabManager - Sekme yöneticisi örneği
   * @param {SFTPManager} sftpManager - SFTP yöneticisi örneği
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
   * Arayüzü başlatır ve gerekli olay dinleyicilerini ekler
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
   * Bağlantı ekleme/düzenleme penceresini gösterir
   * @param {Object} existingConnection - Düzenlenecek mevcut bağlantı (opsiyonel)
   */
  showConnectionModal(existingConnection = null) {
    // Reset form
    this.connectionForm.reset();
    
    // Set modal title
    const modalTitle = document.querySelector('#connectionModal .modal-header h2');
    modalTitle.textContent = existingConnection ? 'Bağlantıyı Düzenle' : 'Yeni Bağlantı';
    
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
   * Bağlantı ekleme/düzenleme penceresini gizler
   */
  hideConnectionModal() {
    this.connectionModal.classList.remove('show');
  }
  
  /**
   * Hakkında penceresini gösterir
   */
  showAboutModal() {
    this.aboutModal.classList.add('show');
  }
  
  /**
   * Hakkında penceresini gizler
   */
  hideAboutModal() {
    this.aboutModal.classList.remove('show');
  }
  
  /**
   * Yeni bağlantı ekleme isteğini işler
   */
  handleNewConnection() {
    this.showConnectionModal();
  }
  
  /**
   * Bağlantı bilgisini doğrular
   * @param {Object} connection - Doğrulanacak bağlantı nesnesi
   * @returns {Object} isValid ve message özellikleriyle doğrulama sonucu
   */
  validateConnection(connection) {
    if (!connection.name || connection.name.trim() === '') {
      return { isValid: false, message: 'Bağlantı adı gereklidir' };
    }
    
    if (!connection.host || connection.host.trim() === '') {
      return { isValid: false, message: 'Sunucu adresi gereklidir' };
    }
    
    if (!connection.port || connection.port <= 0 || connection.port > 65535) {
      return { isValid: false, message: 'Port 1 ile 65535 arasında olmalıdır' };
    }
    
    if (!connection.username || connection.username.trim() === '') {
      return { isValid: false, message: 'Kullanıcı adı gereklidir' };
    }
    
    if (connection.authType === 'password') {
      if (!connection.password || connection.password.trim() === '') {
        return { isValid: false, message: 'Parola ile kimlik doğrulama için parola gereklidir' };
      }
    } else if (connection.authType === 'privateKey') {
      if (!connection.privateKeyPath || connection.privateKeyPath.trim() === '') {
        return { isValid: false, message: 'Anahtar ile kimlik doğrulama için anahtar yolu gereklidir' };
      }
    }
    
    return { isValid: true, message: '' };
  }
  
  /**
   * Bağlantı formu gönderimini işler
   * @param {Event} event - Form gönderim olayı
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
        title: 'Geçersiz Bağlantı',
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
        title: 'Kaydetme Hatası',
        message: `Bağlantı kaydedilemedi: ${error.message}`
      });
    }
  }
  
  /**
   * Kimlik doğrulama türü değişimini işler
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
   * Bağlantı öğesine tıklanmasını işler
   * @param {Object} connection - Tıklanan bağlantı
   */
  handleConnectionClick(connection) {
    // Create a new tab with the connection
    this.tabManager.createNewTab(connection.name, connection);
  }
  
  /**
   * Kayıtlı bağlantı listesini arayüzde günceller
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
      noConnections.textContent = 'Kayıtlı bağlantı yok';
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
      editAction.title = 'Bağlantıyı düzenle';
      editAction.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showConnectionModal(connection);
      });
      
      const deleteAction = document.createElement('div');
      deleteAction.className = 'connection-action';
      deleteAction.textContent = '🗑️';
      deleteAction.title = 'Bağlantıyı sil';
      deleteAction.addEventListener('click', async (e) => {
        e.stopPropagation();
        const confirmDelete = await window.api.showConfirmDialog({
          title: 'Bağlantıyı Sil',
          message: `"${connection.name}" bağlantısını silmek istediğinize emin misiniz?`,
          buttons: ['Sil', 'Vazgeç']
        });
        
        if (confirmDelete.response === 0) {
          try {
            await this.connectionManager.deleteConnection(connection.id);
          } catch (error) {
            window.api.showMessage({
              type: 'error',
              title: 'Silme Hatası',
              message: `Bağlantı silinemedi: ${error.message}`
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
   * Özel anahtar dosyası seçmek için dosya seçici açar
   */
  async handleBrowseForKey() {
    try {
      // Use the main process to open a file dialog
      const result = await window.api.openFileDialog({
        title: 'Özel Anahtar Dosyasını Seç',
        defaultPath: window.api.getHomePath(),
        buttonLabel: 'Anahtarı Seç',
        filters: [
          { name: 'Anahtar Dosyaları', extensions: ['pem', 'key', 'ppk', 'pub'] },
          { name: 'Tüm Dosyalar', extensions: ['*'] }
        ],
        properties: ['openFile']
      });

      if (!result.canceled && result.filePaths.length > 0) {
        // Set the private key path input
        document.getElementById('privateKeyPath').value = result.filePaths[0];
      }
    } catch (error) {
      console.error('Dosya seçici açılamadı:', error);
    }
  }
} 