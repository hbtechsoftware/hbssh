import { ConnectionManager } from './connection-manager.js';
import { TerminalManager } from './terminal-manager.js';
import { TabManager } from './tab-manager.js';
import { UIManager } from './ui-manager.js';
import { SFTPManager } from './sftp-manager.js';
import { ThemeManager } from './theme-manager.js';

/**
 * Initializes the application when the DOM content is fully loaded.
 * Instantiates managers (ConnectionManager, TerminalManager, TabManager, SFTPManager, UIManager),
 * loads saved connections, prepares the UI and tabs, and registers menu event listeners.
 * Logs an error to the console if initialization fails.
 * @async
 */
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const connectionManager = new ConnectionManager();
    const terminalManager = new TerminalManager();
    const tabManager = new TabManager(terminalManager);
    const sftpManager = new SFTPManager();
    const themeManager = new ThemeManager();
    const uiManager = new UIManager(connectionManager, terminalManager, tabManager, sftpManager);
    
    // Global tema yöneticisini window'a ekle
    window.themeManager = themeManager;
    window.terminalManager = terminalManager;
    
    await connectionManager.loadConnections();
    
    uiManager.init();
    tabManager.init();
    themeManager.initializeTheme();
    
    /**
     * Event listener for the 'New Connection' menu action.
     * Shows the connection modal.
     */
    window.api.onNewConnection(() => {
      uiManager.showConnectionModal();
    });
    
    /**
     * Event listener for the 'New Tab' menu action.
     * Creates a new tab.
     */
    window.api.onNewTab(() => {
      tabManager.createNewTab();
    });
    
    /**
     * Event listener for the 'About' menu action.
     * Shows the about modal.
     */
    window.api.onAbout(() => {
      uiManager.showAboutModal();
    });
    
  } catch (error) {
    console.error('Failed to initialize application:', error);
  }
}); 