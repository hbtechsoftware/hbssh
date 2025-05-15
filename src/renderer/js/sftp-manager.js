/**
 * SFTP bağlantılarını ve dosya işlemlerini yönetir.
 * Bu sınıf, SFTP sunucularıyla etkileşim kurmak için temel yöntemleri sağlar:
 * bağlanma, bağlantıyı kesme, dizin listeleme, dosya/dizin oluşturma, silme, yeniden adlandırma,
 * dosya indirme/yükleme ve transfer durumlarını yönetme.
 */
export class SFTPManager {
  /**
   * SFTPManager sınıfının yeni bir örneğini oluşturur.
   * Bağlantıları, transferleri ve mevcut dizinleri saklamak için dahili yapılar başlatır.
   * Yöntemleri `this` bağlamına bağlar ve olay dinleyicilerini kaydeder.
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
   * Bir SFTP sunucusuna bağlanır.
   * @param {Object} connection - Bağlantı yapılandırma nesnesi.
   * @param {string} connection.host - Sunucu adresi.
   * @param {number} connection.port - Sunucu portu.
   * @param {string} connection.username - Kullanıcı adı.
   * @param {string} [connection.password] - Parola (isteğe bağlı).
   * @param {string} [connection.privateKey] - Özel anahtar yolu (isteğe bağlı).
   * @returns {Promise<string>} Başarılı bağlantı durumunda bağlantı ID'si ile çözümlenen bir Promise.
   * @throws {Error} Bağlantı başarısız olursa veya API hatası oluşursa hata fırlatır.
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
   * Bir SFTP sunucusundan bağlantıyı keser.
   * @param {string} connectionId - Kesilecek bağlantının ID'si.
   * @returns {Promise<void>} İşlem tamamlandığında çözümlenen bir Promise.
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
   * Aktif SFTP bağlantısının ID'sini alır.
   * @returns {string|null} Aktif bağlantı ID'si veya aktif bağlantı yoksa `null`.
   */
  getActiveConnection() {
    return this.activeConnectionId;
  }
  
  /**
   * Aktif SFTP bağlantısını ayarlar.
   * @param {string} connectionId - Aktif olarak ayarlanacak bağlantının ID'si.
   */
  setActiveConnection(connectionId) {
    if (this.connections[connectionId]) {
      this.activeConnectionId = connectionId;
    }
  }
  
  /**
   * Belirtilen bağlantı için mevcut çalışma dizinini alır.
   * @param {string} connectionId - Bağlantı ID'si.
   * @returns {string} Mevcut çalışma dizininin yolu, varsayılan olarak '/'.
   */
  getCurrentDirectory(connectionId) {
    return this.currentDirectories[connectionId] || '/';
  }
  
  /**
   * Uzak bir dizinin içeriğini listeler.
   * @param {string} connectionId - SFTP bağlantısının ID'si.
   * @param {string} remotePath - Listelenecek uzak dizinin yolu.
   * @returns {Promise<Array<Object>>} Dizin içeriğini temsil eden nesneler dizisiyle çözümlenen bir Promise.
   *                                  Her nesne genellikle `name`, `type`, `size`, `modifyTime` gibi özellikler içerir.
   * @throws {Error} Listeleme başarısız olursa veya API hatası oluşursa hata fırlatır.
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
   * Uzak sunucuda yeni bir dizin oluşturur.
   * @param {string} connectionId - SFTP bağlantısının ID'si.
   * @param {string} remotePath - Oluşturulacak dizinin uzak yolu.
   * @param {string} [sshConnectionId] - `main.js`'deki `sftp-mkdir` işleyicisine iletilecek SSH bağlantı ID'si (isteğe bağlı, sudo için gerekli olabilir).
   * @returns {Promise<void>} İşlem başarılı olursa çözümlenir.
   * @throws {Error} Dizin oluşturma başarısız olursa veya API hatası oluşursa hata fırlatır.
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
   * Uzak sunucudaki bir dosyayı siler.
   * @param {string} connectionId - SFTP bağlantısının ID'si.
   * @param {string} remotePath - Silinecek dosyanın uzak yolu.
   * @param {string} [sshConnectionId] - `main.js`'deki `sftp-delete` işleyicisine iletilecek SSH bağlantı ID'si (isteğe bağlı, sudo için gerekli olabilir).
   * @returns {Promise<void>} İşlem başarılı olursa çözümlenir.
   * @throws {Error} Dosya silme başarısız olursa veya API hatası oluşursa hata fırlatır.
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
   * Uzak sunucudaki bir dizini siler.
   * @param {string} connectionId - SFTP bağlantısının ID'si.
   * @param {string} remotePath - Silinecek dizinin uzak yolu.
   * @param {boolean} [recursive=false] - Dizinin içeriğiyle birlikte özyinelemeli olarak silinip silinmeyeceği.
   * @param {string} [sshConnectionId] - `main.js`'deki `sftp-rmdir` işleyicisine iletilecek SSH bağlantı ID'si (isteğe bağlı, sudo için gerekli olabilir).
   * @returns {Promise<void>} İşlem başarılı olursa çözümlenir.
   * @throws {Error} Dizin silme başarısız olursa veya API hatası oluşursa hata fırlatır.
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
   * Uzak sunucudaki bir dosyayı veya dizini yeniden adlandırır/taşır.
   * @param {string} connectionId - SFTP bağlantısının ID'si.
   * @param {string} fromPath - Kaynak dosya/dizin yolu.
   * @param {string} toPath - Hedef dosya/dizin yolu.
   * @param {string} [sshConnectionId] - `main.js`'deki `sftp-rename` işleyicisine iletilecek SSH bağlantı ID'si (isteğe bağlı).
   * @returns {Promise<void>} İşlem başarılı olursa çözümlenir.
   * @throws {Error} Yeniden adlandırma başarısız olursa veya API hatası oluşursa hata fırlatır.
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
   * Uzak bir dosyayı yerel bir yola indirir.
   * @param {string} connectionId - SFTP bağlantısının ID'si.
   * @param {string} remotePath - İndirilecek uzak dosyanın yolu.
   * @param {string} localPath - Dosyanın kaydedileceği yerel yol.
   * @returns {Promise<string>} Başarılı başlatma durumunda transfer ID'si ile çözümlenen bir Promise.
   * @throws {Error} İndirme başlatma başarısız olursa veya API hatası oluşursa hata fırlatır.
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
   * Yerel bir dosyayı uzak bir yola yükler.
   * @param {string} connectionId - SFTP bağlantısının ID'si.
   * @param {string} localPath - Yüklenecek yerel dosyanın yolu.
   * @param {string} remotePath - Dosyanın yükleneceği uzak yol.
   * @param {string} [sshConnectionId] - `main.js`'deki `sftp-upload` (veya dolaylı olarak `sftp-write-file`) işleyicisine iletilecek SSH bağlantı ID'si (isteğe bağlı, sudo için gerekli olabilir).
   * @returns {Promise<string>} Başarılı başlatma durumunda transfer ID'si ile çözümlenen bir Promise.
   * @throws {Error} Yükleme başlatma başarısız olursa veya API hatası oluşursa hata fırlatır.
   */
  async uploadFile(connectionId, localPath, remotePath, sshConnectionId) {
    try {
      // sftpUpload API'si doğrudan sshConnectionId almayabilir, bunun yerine sftpWriteFile gibi altyapıyı kullanabilir.
      // Bu yüzden preload.js'deki sftpUpload tanımına bakmak gerekir.
      // Şimdilik, eğer main.js'de dosya oluşturma/üzerine yazma sudo ile yapılıyorsa sshConnectionId gerekebilir varsayımıyla ekliyoruz.
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
   * Devam eden bir dosya transferini iptal eder.
   * @param {string} transferId - İptal edilecek transferin ID'si.
   * @returns {Promise<boolean>} İşlem başarılı olursa `true`, aksi takdirde `false` ile çözümlenen bir Promise.
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
   * Uzak bir dosyanın veya dizinin bilgilerini (stat) alır.
   * @param {string} connectionId - SFTP bağlantısının ID'si.
   * @param {string} remotePath - Bilgileri alınacak uzak dosya/dizin yolu.
   * @returns {Promise<Object>} Dosya/dizin bilgilerini (örn: boyut, izinler, değiştirme zamanı) içeren bir nesneyle çözümlenen bir Promise.
   * @throws {Error} Bilgi alma başarısız olursa veya API hatası oluşursa hata fırlatır.
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
   * Tüm aktif dosya transferlerinin bir listesini alır.
   * @returns {Object<string, Object>} Transfer ID'lerini anahtar, transfer detaylarını değer olarak içeren bir nesne.
   *                                   Her transfer nesnesi `type`, `connectionId`, `remotePath`, `localPath`, `status`, `progress` gibi bilgiler içerir.
   */
  getTransfers() {
    return this.transfers;
  }
  
  /**
   * Belirli bir ID'ye sahip dosya transferinin detaylarını alır.
   * @param {string} transferId - Alınacak transferin ID'si.
   * @returns {Object|null} Transfer nesnesi veya bulunamazsa `null`.
   */
  getTransfer(transferId) {
    return this.transfers[transferId] || null;
  }
  
  /**
   * Ana süreçten gelen `sftp-transfer-update` olaylarını yönetir.
   * Yerel transfer durumunu günceller ve bir `sftp-transfer-update` özel olayı tetikler.
   * @param {string} transferId - Güncellenen transferin ID'si.
   * @param {Object} transfer - Güncellenmiş transfer bilgilerini içeren nesne.
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
   * Tüm aktif SFTP bağlantılarını kapatır.
   * @returns {Promise<void>} Tüm bağlantılar kesildiğinde çözümlenen bir Promise.
   */
  async closeAll() {
    const connectionIds = Object.keys(this.connections);
    for (const connectionId of connectionIds) {
      await this.disconnect(connectionId);
    }
  }
} 