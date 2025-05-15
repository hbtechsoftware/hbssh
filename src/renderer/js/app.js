// Import managers
import { ConnectionManager } from './connection-manager.js';
import { TerminalManager } from './terminal-manager.js';
import { TabManager } from './tab-manager.js';
import { UIManager } from './ui-manager.js';
import { SFTPManager } from './sftp-manager.js';

// Initialize application when the DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Initialize managers
    const connectionManager = new ConnectionManager();
    const terminalManager = new TerminalManager();
    const tabManager = new TabManager(terminalManager);
    const sftpManager = new SFTPManager();
    const uiManager = new UIManager(connectionManager, terminalManager, tabManager, sftpManager);
    
    // Load saved connections
    await connectionManager.loadConnections();
    
    // Initialize the UI
    uiManager.init();
    tabManager.init();
    
    // Register menu event handlers
    window.api.onNewConnection(() => {
      uiManager.showConnectionModal();
    });
    
    window.api.onNewTab(() => {
      tabManager.createNewTab();
    });
    
    window.api.onAbout(() => {
      uiManager.showAboutModal();
    });
    
    console.log('Application initialized successfully');
  } catch (error) {
    console.error('Failed to initialize application:', error);
  }
}); 