import { ConnectionManager } from './connection-manager.js';
import { TerminalManager } from './terminal-manager.js';
import { TabManager } from './tab-manager.js';
import { UIManager } from './ui-manager.js';
import { SFTPManager } from './sftp-manager.js';

/**
 * DOM içeriği tamamen yüklendiğinde uygulamayı başlatır.
 * Yöneticileri (ConnectionManager, TerminalManager, TabManager, SFTPManager, UIManager) başlatır,
 * kayıtlı bağlantıları yükler, kullanıcı arayüzünü ve sekmeleri hazırlar ve menü olaylarını kaydeder.
 * Başlatma sırasında bir hata oluşursa konsola hata kaydeder.
 * @async
 */
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const connectionManager = new ConnectionManager();
    const terminalManager = new TerminalManager();
    const tabManager = new TabManager(terminalManager);
    const sftpManager = new SFTPManager();
    const uiManager = new UIManager(connectionManager, terminalManager, tabManager, sftpManager);
    
    await connectionManager.loadConnections();
    
    uiManager.init();
    tabManager.init();
    
    /**
     * 'Yeni Bağlantı' menü eylemi için olay dinleyicisi.
     * Bağlantı modalını gösterir.
     */
    window.api.onNewConnection(() => {
      uiManager.showConnectionModal();
    });
    
    /**
     * 'Yeni Sekme' menü eylemi için olay dinleyicisi.
     * Yeni bir sekme oluşturur.
     */
    window.api.onNewTab(() => {
      tabManager.createNewTab();
    });
    
    /**
     * 'Hakkında' menü eylemi için olay dinleyicisi.
     * Hakkında modalını gösterir.
     */
    window.api.onAbout(() => {
      uiManager.showAboutModal();
    });
    
  } catch (error) {
    console.error('Failed to initialize application:', error);
  }
}); 