const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing all of its APIs
contextBridge.exposeInMainWorld('api', {
  /**
   * Kayıtlı tüm SSH bağlantılarını alır.
   * @returns {Promise<Array<Object>>} Bağlantı nesneleri dizisiyle çözümlenen bir Promise.
   */
  getSavedConnections: () => ipcRenderer.invoke('get-saved-connections'),

  /**
   * Yeni bir bağlantıyı kaydeder veya mevcut bir bağlantıyı günceller.
   * @param {Object} connection - Kaydedilecek bağlantı nesnesi.
   * @returns {Promise<Array<Object>>} Tüm bağlantıların güncellenmiş listesiyle çözümlenen bir Promise.
   */
  saveConnection: (connection) => ipcRenderer.invoke('save-connection', connection),

  /**
   * Belirtilen ID'ye sahip bağlantıyı siler.
   * @param {string} connectionId - Silinecek bağlantının ID'si.
   * @returns {Promise<Array<Object>>} Tüm bağlantıların güncellenmiş listesiyle çözümlenen bir Promise.
   */
  deleteConnection: (connectionId) => ipcRenderer.invoke('delete-connection', connectionId),
  
  /**
   * Belirtilen yapılandırmayla bir SSH bağlantısı kurar.
   * @param {Object} connection - Bağlantı yapılandırma nesnesi.
   * @returns {Promise<Object>} Bağlantı sonucuyla çözümlenen bir Promise.
   */
  connectSSH: (connection) => ipcRenderer.invoke('connect-ssh', connection),

  /**
   * Belirtilen SSH bağlantısına veri yazar.
   * @param {string} connectionId - SSH bağlantısının ID'si.
   * @param {string} data - Yazılacak veri.
   * @returns {Promise<Object>} Yazma işleminin sonucuyla çözümlenen bir Promise.
   */
  writeSSH: (connectionId, data) => ipcRenderer.invoke('write-ssh', connectionId, data),

  /**
   * Belirtilen SSH bağlantısının terminal boyutunu yeniden boyutlandırır.
   * @param {string} connectionId - SSH bağlantısının ID'si.
   * @param {number} cols - Sütun sayısı.
   * @param {number} rows - Satır sayısı.
   * @returns {Promise<Object>} Yeniden boyutlandırma işleminin sonucuyla çözümlenen bir Promise.
   */
  resizeSSH: (connectionId, cols, rows) => ipcRenderer.invoke('resize-ssh', connectionId, cols, rows),

  /**
   * Belirtilen SSH bağlantısını keser.
   * @param {string} connectionId - Kesilecek SSH bağlantısının ID'si.
   * @returns {Promise<Object>} Bağlantı kesme işleminin sonucuyla çözümlenen bir Promise.
   */
  disconnectSSH: (connectionId) => ipcRenderer.invoke('disconnect-ssh', connectionId),
  
  /**
   * Belirtilen yapılandırmayla bir SFTP bağlantısı kurar.
   * @param {Object} connection - Bağlantı yapılandırma nesnesi.
   * @returns {Promise<Object>} Bağlantı sonucuyla çözümlenen bir Promise.
   */
  connectSFTP: (connection) => ipcRenderer.invoke('connect-sftp', connection),

  /**
   * Belirtilen SFTP bağlantısını keser.
   * @param {string} connectionId - Kesilecek SFTP bağlantısının ID'si.
   * @returns {Promise<Object>} Bağlantı kesme işleminin sonucuyla çözümlenen bir Promise.
   */
  disconnectSFTP: (connectionId) => ipcRenderer.invoke('disconnect-sftp', connectionId),

  /**
   * Belirtilen SFTP bağlantısındaki uzak bir dizinin içeriğini listeler.
   * @param {string} connectionId - SFTP bağlantısının ID'si.
   * @param {string} remotePath - Listelenecek uzak dizinin yolu.
   * @returns {Promise<Object>} Dizin listeleme işleminin sonucuyla çözümlenen bir Promise.
   */
  sftpList: (connectionId, remotePath) => ipcRenderer.invoke('sftp-list', connectionId, remotePath),

  /**
   * Belirtilen SFTP bağlantısında uzak bir dizin oluşturur.
   * @param {string} connectionId - SFTP bağlantısının ID'si.
   * @param {string} remotePath - Oluşturulacak uzak dizinin yolu.
   * @param {string} sshConnectionId - İlişkili SSH bağlantısının ID'si (sudo işlemleri için).
   * @returns {Promise<Object>} Dizin oluşturma işleminin sonucuyla çözümlenen bir Promise.
   */
  sftpMkdir: (connectionId, remotePath, sshConnectionId) => ipcRenderer.invoke('sftp-mkdir', { connectionId, remotePath, sshConnectionId }),

  /**
   * Belirtilen SFTP bağlantısında uzak bir dosyayı siler.
   * @param {string} sftpConnectionId - SFTP bağlantısının ID'si.
   * @param {string} remotePath - Silinecek uzak dosyanın yolu.
   * @param {string} sshConnectionId - İlişkili SSH bağlantısının ID'si (sudo işlemleri için).
   * @returns {Promise<Object>} Dosya silme işleminin sonucuyla çözümlenen bir Promise.
   */
  sftpDelete: (sftpConnectionId, remotePath, sshConnectionId) => ipcRenderer.invoke('sftp-delete', { sftpConnectionId, remotePath, sshConnectionId }),

  /**
   * Belirtilen SFTP bağlantısında uzak bir dizini (ve isteğe bağlı olarak içeriğini) siler.
   * @param {string} sftpConnectionId - SFTP bağlantısının ID'si.
   * @param {string} remotePath - Silinecek uzak dizinin yolu.
   * @param {boolean} recursive - İçeriğiyle birlikte özyinelemeli olarak silinip silinmeyeceği.
   * @param {string} sshConnectionId - İlişkili SSH bağlantısının ID'si (sudo işlemleri için).
   * @returns {Promise<Object>} Dizin silme işleminin sonucuyla çözümlenen bir Promise.
   */
  sftpRmdir: (sftpConnectionId, remotePath, recursive, sshConnectionId) => ipcRenderer.invoke('sftp-rmdir', { sftpConnectionId, remotePath, recursive, sshConnectionId }),

  /**
   * Belirtilen SFTP bağlantısında uzak bir dosyayı veya dizini yeniden adlandırır/taşır.
   * @param {string} connectionId - SFTP bağlantısının ID'si.
   * @param {string} fromPath - Kaynak dosya/dizin yolu.
   * @param {string} toPath - Hedef dosya/dizin yolu.
   * @param {string} sshConnectionId - İlişkili SSH bağlantısının ID'si.
   * @returns {Promise<Object>} Yeniden adlandırma/taşıma işleminin sonucuyla çözümlenen bir Promise.
   */
  sftpRename: (connectionId, fromPath, toPath, sshConnectionId) => ipcRenderer.invoke('sftp-rename', { connectionId, fromPath, toPath, sshConnectionId }),

  /**
   * Belirtilen SFTP bağlantısından uzak bir dosyayı yerel bir yola indirir.
   * @param {string} connectionId - SFTP bağlantısının ID'si.
   * @param {string} remotePath - İndirilecek uzak dosyanın yolu.
   * @param {string} localPath - Dosyanın kaydedileceği yerel yol.
   * @returns {Promise<Object>} İndirme işleminin sonucuyla çözümlenen bir Promise.
   */
  sftpDownload: (connectionId, remotePath, localPath) => ipcRenderer.invoke('sftp-download', connectionId, remotePath, localPath),

  /**
   * Yerel bir dosyayı belirtilen SFTP bağlantısındaki uzak bir yola yükler.
   * @param {string} connectionId - SFTP bağlantısının ID'si.
   * @param {string} localPath - Yüklenecek yerel dosyanın yolu.
   * @param {string} remotePath - Dosyanın yükleneceği uzak yol.
   * @returns {Promise<Object>} Yükleme işleminin sonucuyla çözümlenen bir Promise.
   */
  sftpUpload: (connectionId, localPath, remotePath) => ipcRenderer.invoke('sftp-upload', connectionId, localPath, remotePath),

  /**
   * Belirtilen transfer ID'sine sahip bir SFTP transferinin durumunu alır.
   * @param {string} transferId - Transferin ID'si.
   * @returns {Promise<Object>} Transfer durumuyla çözümlenen bir Promise.
   */
  sftpGetTransferStatus: (transferId) => ipcRenderer.invoke('sftp-get-transfer-status', transferId),

  /**
   * Belirtilen transfer ID'sine sahip bir SFTP transferini iptal eder.
   * @param {string} transferId - Transferin ID'si.
   * @returns {Promise<Object>} İptal işleminin sonucuyla çözümlenen bir Promise.
   */
  sftpCancelTransfer: (transferId) => ipcRenderer.invoke('sftp-cancel-transfer', transferId),

  /**
   * Belirtilen SFTP bağlantısı için mevcut çalışma dizinini alır.
   * @param {string} connectionId - SFTP bağlantısının ID'si.
   * @returns {Promise<Object>} Mevcut çalışma diziniyle çözümlenen bir Promise.
   */
  sftpGetCurrentDirectory: (connectionId) => ipcRenderer.invoke('sftp-get-current-directory', connectionId),

  /**
   * Belirtilen SFTP bağlantısı için mevcut çalışma dizinini ayarlar.
   * @param {string} connectionId - SFTP bağlantısının ID'si.
   * @param {string} remotePath - Ayarlanacak yeni çalışma dizininin yolu.
   * @returns {Promise<Object>} İşlemin sonucuyla çözümlenen bir Promise.
   */
  sftpSetCurrentDirectory: (connectionId, remotePath) => ipcRenderer.invoke('sftp-set-current-directory', connectionId, remotePath),

  /**
   * Belirtilen SFTP bağlantısındaki uzak bir dosya veya dizinin bilgilerini (stat) alır.
   * @param {string} connectionId - SFTP bağlantısının ID'si.
   * @param {string} remotePath - Bilgileri alınacak uzak dosya/dizin yolu.
   * @returns {Promise<Object>} Dosya/dizin bilgileriyle çözümlenen bir Promise.
   */
  sftpStat: (connectionId, remotePath) => ipcRenderer.invoke('sftp-stat', connectionId, remotePath),
  
  /**
   * Bir dosya açma iletişim kutusu gösterir.
   * @param {Object} options - Elektron'un `dialog.showOpenDialog` metodunun seçenekleri.
   * @returns {Promise<Object>} Dosya seçimi sonucuyla çözümlenen bir Promise.
   */
  openFileDialog: (options) => ipcRenderer.invoke('open-file-dialog', options),

  /**
   * Bir dosya kaydetme iletişim kutusu gösterir.
   * @param {Object} options - Elektron'un `dialog.showSaveDialog` metodunun seçenekleri.
   * @returns {Promise<Object>} Dosya kaydetme sonucuyla çözümlenen bir Promise.
   */
  saveFileDialog: (options) => ipcRenderer.invoke('save-file-dialog', options),

  /**
   * Kullanıcının ev dizininin yolunu alır.
   * @returns {Promise<string>} Ev dizini yoluyla çözümlenen bir Promise.
   */
  getHomePath: () => ipcRenderer.invoke('get-home-path'),
  
  /**
   * Bir mesaj iletişim kutusu gösterir.
   * @param {Object} options - Elektron'un `dialog.showMessageBox` metodunun seçenekleri.
   * @returns {Promise<Object>} Mesaj kutusu sonucuyla çözümlenen bir Promise.
   */
  showMessage: (options) => ipcRenderer.invoke('show-message', options),

  /**
   * Bir onay iletişim kutusu gösterir.
   * @param {Object} options - Elektron'un `dialog.showMessageBox` metodunun seçenekleri (genellikle type: 'question').
   * @returns {Promise<Object>} Onay kutusu sonucuyla çözümlenen bir Promise.
   */
  showConfirmDialog: (options) => ipcRenderer.invoke('show-confirm-dialog', options),
  
  /**
   * Panodan metin okur.
   * @returns {Promise<string>} Panodaki metinle çözümlenen bir Promise.
   */
  readClipboard: () => ipcRenderer.invoke('read-clipboard'),

  /**
   * Panoya metin yazar.
   * @param {string} text - Panoya yazılacak metin.
   * @returns {Promise<void>} İşlem tamamlandığında çözümlenen bir Promise.
   */
  writeClipboard: (text) => ipcRenderer.invoke('write-clipboard', text),
  
  /**
   * Ana süreçten gelen SSH verilerini dinler.
   * @param {function(connectionId: string, data: string): void} callback - SSH verisi alındığında çağrılır.
   *   - {string} connectionId - SSH bağlantısının ID'si.
   *   - {string} data - SSH bağlantısından alınan veri.
   * @returns {function(): void} Olay dinleyicisini kaldırmak için bir fonksiyon.
   */
  onSSHData: (callback) => {
    ipcRenderer.on('ssh-data', (event, connectionId, data) => callback(connectionId, data));
    return () => ipcRenderer.removeListener('ssh-data', callback);
  },

  /**
   * Bir SSH bağlantısının kapandığını dinler.
   * @param {function(connectionId: string): void} callback - Bir SSH bağlantısı kapandığında çağrılır.
   *   - {string} connectionId - Kapanan SSH bağlantısının ID'si.
   * @returns {function(): void} Olay dinleyicisini kaldırmak için bir fonksiyon.
   */
  onSSHClose: (callback) => {
    ipcRenderer.on('ssh-close', (event, connectionId) => callback(connectionId));
    return () => ipcRenderer.removeListener('ssh-close', callback);
  },

  /**
   * SSH bağlantı hatalarını dinler.
   * @param {function(connectionId: string, error: Error): void} callback - Bir SSH bağlantı hatası oluştuğunda çağrılır.
   *   - {string} connectionId - Hatanın oluştuğu SSH bağlantısının ID'si.
   *   - {Error} error - Hata nesnesi.
   * @returns {function(): void} Olay dinleyicisini kaldırmak için bir fonksiyon.
   */
  onSSHError: (callback) => {
    ipcRenderer.on('ssh-error', (event, connectionId, error) => callback(connectionId, error));
    return () => ipcRenderer.removeListener('ssh-error', callback);
  },
  
  /**
   * SFTP transfer güncellemelerini dinler.
   * @param {function(transferId: string, transfer: Object): void} callback - Bir SFTP transferi güncellendiğinde çağrılır.
   *   - {string} transferId - Transferin ID'si.
   *   - {Object} transfer - Transfer durumu nesnesi.
   * @returns {function(): void} Olay dinleyicisini kaldırmak için bir fonksiyon.
   */
  onSFTPTransferUpdate: (callback) => {
    ipcRenderer.on('sftp-transfer-update', (event, transferId, transfer) => callback(transferId, transfer));
    return () => ipcRenderer.removeListener('sftp-transfer-update', callback);
  },
  
  /**
   * Menüden 'Yeni Bağlantı' eylemini dinler.
   * @param {function(): void} callback - Eylem tetiklendiğinde çağrılır.
   * @returns {function(): void} Olay dinleyicisini kaldırmak için bir fonksiyon.
   */
  onNewConnection: (callback) => {
    ipcRenderer.on('menu-new-connection', callback);
    return () => ipcRenderer.removeListener('menu-new-connection', callback);
  },

  /**
   * Menüden 'Yeni Sekme' eylemini dinler.
   * @param {function(): void} callback - Eylem tetiklendiğinde çağrılır.
   * @returns {function(): void} Olay dinleyicisini kaldırmak için bir fonksiyon.
   */
  onNewTab: (callback) => {
    ipcRenderer.on('menu-new-tab', callback);
    return () => ipcRenderer.removeListener('menu-new-tab', callback);
  },

  /**
   * Menüden 'Hakkında' eylemini dinler.
   * @param {function(): void} callback - Eylem tetiklendiğinde çağrılır.
   * @returns {function(): void} Olay dinleyicisini kaldırmak için bir fonksiyon.
   */
  onAbout: (callback) => {
    ipcRenderer.on('menu-about', callback);
    return () => ipcRenderer.removeListener('menu-about', callback);
  },

  /**
   * Uzak sunucu sistem bilgisi güncellemelerini dinler.
   * @param {function(data: Object): void} callback - Sistem bilgisi güncellendiğinde çağrılır.
   *   - {Object} data - Güncellenmiş sistem bilgisi verileri.
   * @returns {function(): void} Olay dinleyicisini kaldırmak için bir fonksiyon.
   */
  onRemoteSystemInfoUpdate: (callback) => {
    ipcRenderer.on('remote-system-info-update', (event, value) => callback(value));
    // Kaldırma fonksiyonunu da döndürmek iyi bir pratiktir, bileşen kaldırıldığında dinleyiciyi temizlemek için.
    return () => ipcRenderer.removeListener('remote-system-info-update', callback);
  },

  /**
   * Uzak sunucu sistem bilgilerinin temizlenmesi olayını dinler.
   * @param {function(data: Object): void} callback - Sistem bilgileri temizlendiğinde çağrılır.
   *   - {Object} data - Genellikle { connectionId: string } içerir.
   * @returns {function(): void} Olay dinleyicisini kaldırmak için bir fonksiyon.
   */
  onClearRemoteSystemInfo: (callback) => {
    ipcRenderer.on('clear-remote-system-info', (event, value) => callback(value));
    return () => ipcRenderer.removeListener('clear-remote-system-info', callback);
  },

  /**
   * SFTP tarayıcısının hazır olduğunu belirten olayı dinler.
   * @param {function(data: Object): void} callback - SFTP hazır olduğunda çağrılır.
   *   - {Object} data - SFTP bağlantı bilgileri (sshConnectionId, sftpConnectionId, initialPath).
   * @returns {function(): void} Olay dinleyicisini kaldırmak için bir fonksiyon.
   */
  onSftpReady: (callback) => {
    ipcRenderer.on('sftp-ready', (event, data) => callback(data));
    return () => ipcRenderer.removeListener('sftp-ready', callback);
  },

  /**
   * SFTP bağlantısının kapandığını belirten olayı dinler.
   * @param {function(data: Object): void} callback - SFTP kapandığında çağrılır.
   *   - {Object} data - Kapanma nedeni ve bağlantı ID'leri hakkında bilgi.
   * @returns {function(): void} Olay dinleyicisini kaldırmak için bir fonksiyon.
   */
  onSftpClose: (callback) => {
    ipcRenderer.on('sftp-close', (event, data) => callback(data));
    return () => ipcRenderer.removeListener('sftp-close', callback);
  },

  /**
   * Belirtilen SFTP bağlantısındaki uzak bir dosyayı okur.
   * @param {string} sftpConnectionId - SFTP bağlantısının ID'si.
   * @param {string} remotePath - Okunacak uzak dosyanın yolu.
   * @returns {Promise<Object>} Dosya içeriği veya hata ile çözümlenen bir Promise.
   */
  sftpReadFile: (sftpConnectionId, remotePath) => ipcRenderer.invoke('sftp-read-file', { connectionId: sftpConnectionId, remoteFilePath: remotePath }),

  /**
   * Belirtilen SFTP bağlantısındaki uzak bir dosyaya içerik yazar.
   * @param {string} sftpConnectionId - SFTP bağlantısının ID'si.
   * @param {string} remotePath - İçeriğin yazılacağı uzak dosyanın yolu.
   * @param {string} content - Yazılacak içerik.
   * @param {string} [sshConnectionId] - İlişkili SSH bağlantısının ID'si (güncel main.js'de bu parametre `sftp-write-file` handler'ı tarafından alınır).
   * @returns {Promise<Object>} Yazma işleminin sonucuyla çözümlenen bir Promise.
   */
  sftpWriteFile: (sftpConnectionId, remotePath, content, sshConnectionId) => ipcRenderer.invoke('sftp-write-file', { connectionId: sftpConnectionId, remoteFilePath: remotePath, content, sshConnectionId })
}); 