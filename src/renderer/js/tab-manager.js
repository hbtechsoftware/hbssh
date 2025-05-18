/**
 * Manages tabs for terminal instances.
 * Can create new tabs, activate tabs, close tabs, and create tabs with custom content.
 */
export class TabManager {
  /**
   * Initializes the TabManager instance.
   * @param {import('./terminal-manager.js').TerminalManager} terminalManager - The TerminalManager instance.
   */
  constructor(terminalManager) {
    this.terminalManager = terminalManager;
    /** @type {Array<Object>} Array holding tabs and their metadata. */
    this.tabs = [];
    /** @type {string|null} The ID of the active tab. */
    this.activeTabId = null;
    
    this.tabsContainer = document.getElementById('tabs');
    this.terminalContainer = document.getElementById('terminalContainer');
    this.welcomeScreen = document.getElementById('welcomeScreen');
    
    /** @type {number} Counter for generating unique tab IDs. */
    this.tabCounter = 0;
  }
  
  /**
   * Initializes the TabManager.
   * Finds the welcome screen and displays it if there are no tabs.
   */
  init() {
    console.log('Tab Manager initialized');
    
    if (!this.welcomeScreen) {
      this.welcomeScreen = document.getElementById('welcomeScreen');
    }
    
    if (this.tabs.length === 0 && this.welcomeScreen) {
      this.welcomeScreen.style.display = 'flex';
    }
  }
  
  /**
   * Creates a new terminal tab.
   * @param {string} [name='New Tab'] - Optional name for the tab.
   * @param {Object} [connection=null] - Optional connection object. If provided, a terminal will be created with this connection.
   * @returns {string} The ID of the newly created tab.
   */
  createNewTab(name = 'New Tab', connection = null) {
    const tabId = `tab-${Date.now()}-${this.tabCounter++}`;
    
    const tabElement = document.createElement('div');
    tabElement.className = 'tab';
    tabElement.dataset.tabId = tabId;
    
    const tabLabel = document.createElement('span');
    tabLabel.className = 'tab-label';
    tabLabel.textContent = name;
    
    const tabClose = document.createElement('span');
    tabClose.className = 'tab-close';
    tabClose.textContent = '×';
    tabClose.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeTab(tabId);
    });
    
    tabElement.appendChild(tabLabel);
    tabElement.appendChild(tabClose);
    
    tabElement.addEventListener('click', () => {
      this.activateTab(tabId);
    });
    
    this.tabsContainer.appendChild(tabElement);
    
    this.tabs.push({
      id: tabId,
      name,
      element: tabElement,
      connection
    });
    
    const terminalElement = document.createElement('div');
    terminalElement.className = 'terminal-instance';
    terminalElement.id = `terminal-${tabId}`;
    this.terminalContainer.appendChild(terminalElement);
    
    this.activateTab(tabId);
    
    if (connection) {
      setTimeout(() => {
        this.terminalManager.createTerminal(connection, tabId);
      }, 0);
    }
    
    return tabId;
  }
  
  /**
   * Activates the tab with the specified ID.
   * Deactivates all other tabs and terminal instances, hides the welcome screen.
   * @param {string} tabId - The ID of the tab to activate.
   */
  activateTab(tabId) {
    this.tabs.forEach(tab => {
      tab.element.classList.remove('active');
    });
    
    const terminalInstances = document.querySelectorAll('.terminal-instance');
    terminalInstances.forEach(instance => {
      instance.classList.remove('active');
    });
    
    if (this.welcomeScreen) {
        this.welcomeScreen.style.display = 'none';
    }
    
    const tab = this.tabs.find(t => t.id === tabId);
    if (tab) {
      tab.element.classList.add('active');
      
      const terminalElement = document.getElementById(`terminal-${tabId}`);
      if (terminalElement) {
        terminalElement.classList.add('active');
      }
      
      this.activeTabId = tabId;
      this.terminalManager.setActiveTerminal(tabId);
    }
  }
  
  /**
   * Closes the tab with the specified ID.
   * Removes the tab element and its associated terminal instance from the DOM.
   * If the closed tab was active, it activates another tab or shows the welcome screen if no tabs are left.
   * @param {string} tabId - The ID of the tab to close.
   */
  closeTab(tabId) {
    const tabIndex = this.tabs.findIndex(t => t.id === tabId);
    
    if (tabIndex !== -1) {
      const tab = this.tabs[tabIndex];
      
      tab.element.remove();
      
      const terminalElement = document.getElementById(`terminal-${tabId}`);
      if (terminalElement) {
        terminalElement.remove();
      }
      
      this.tabs.splice(tabIndex, 1);
      
      if (this.activeTabId === tabId) {
        if (this.tabs.length > 0) {
          const newActiveTabIndex = Math.max(0, tabIndex - 1);
          this.activateTab(this.tabs[newActiveTabIndex].id);
        } else {
          this.activeTabId = null;
          if (this.welcomeScreen) {
            this.welcomeScreen.style.display = 'flex';
          }
        }
      }
      
      this.terminalManager.closeTerminal(tabId);
    }
  }
  
  /**
   * Returns the ID of the active tab.
   * @returns {string|null} The active tab ID, or `null` if no tab is active.
   */
  getActiveTabId() {
    return this.activeTabId;
  }
  
  /**
   * Updates the name of the tab with the specified ID.
   * @param {string} tabId - The ID of the tab to update.
   * @param {string} name - The new name for the tab.
   */
  updateTabName(tabId, name) {
    const tab = this.tabs.find(t => t.id === tabId);
    if (tab) {
      tab.name = name;
      const tabLabel = tab.element.querySelector('.tab-label');
      if (tabLabel) {
        tabLabel.textContent = name;
      }
    }
  }

  /**
   * Creates a custom tab with optional content.
   * @param {string} name - The name for the tab.
   * @param {HTMLElement} content - The HTML content element to add to the tab.
   * @returns {string} The ID of the newly created tab.
   */
  createCustomTab(name, content) {
    const tabId = `tab-${Date.now()}-${this.tabCounter++}`;
    
    const tabElement = document.createElement('div');
    tabElement.className = 'tab';
    tabElement.dataset.tabId = tabId;
    
    const tabLabel = document.createElement('span');
    tabLabel.className = 'tab-label';
    tabLabel.textContent = name;
    
    const tabClose = document.createElement('span');
    tabClose.className = 'tab-close';
    tabClose.textContent = '×';
    tabClose.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeTab(tabId);
    });
    
    tabElement.appendChild(tabLabel);
    tabElement.appendChild(tabClose);
    
    tabElement.addEventListener('click', () => {
      this.activateTab(tabId);
    });
    
    this.tabsContainer.appendChild(tabElement);
    
    this.tabs.push({
      id: tabId,
      name,
      element: tabElement,
      isCustom: true
    });
    
    const contentElement = document.createElement('div');
    contentElement.className = 'terminal-instance'; // May use terminal-instance class for consistent styling
    contentElement.id = `terminal-${tabId}`; // For ID consistency
    
    if (content) {
      contentElement.appendChild(content);
    }
    
    this.terminalContainer.appendChild(contentElement);
    this.activateTab(tabId);
    return tabId;
  }
} 