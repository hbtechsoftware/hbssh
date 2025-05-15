/**
 * Manages tabs for terminal instances
 */
export class TabManager {
  /**
   * Initialize the Tab Manager
   * @param {TerminalManager} terminalManager - Terminal manager instance
   */
  constructor(terminalManager) {
    this.terminalManager = terminalManager;
    this.tabs = [];
    this.activeTabId = null;
    
    // DOM elements
    this.tabsContainer = document.getElementById('tabs');
    this.terminalContainer = document.getElementById('terminalContainer');
    this.welcomeScreen = document.getElementById('welcomeScreen');
    
    // Counter for generating unique tab IDs
    this.tabCounter = 0;
  }
  
  /**
   * Initialize the Tab Manager
   */
  init() {
    console.log('Tab Manager initialized');
    
    // Find the welcome screen
    if (!this.welcomeScreen) {
      this.welcomeScreen = document.getElementById('welcomeScreen');
    }
    
    // Show welcome screen if no tabs
    if (this.tabs.length === 0 && this.welcomeScreen) {
      this.welcomeScreen.style.display = 'flex';
    }
  }
  
  /**
   * Create a new tab
   * @param {string} name - Optional name for the tab
   * @param {Object} connection - Optional connection object
   * @returns {string} The ID of the new tab
   */
  createNewTab(name = 'New Tab', connection = null) {
    // Generate a unique ID for the tab
    const tabId = `tab-${Date.now()}-${this.tabCounter++}`;
    
    // Create tab element
    const tabElement = document.createElement('div');
    tabElement.className = 'tab';
    tabElement.dataset.tabId = tabId;
    
    // Tab label
    const tabLabel = document.createElement('span');
    tabLabel.className = 'tab-label';
    tabLabel.textContent = name;
    
    // Tab close button
    const tabClose = document.createElement('span');
    tabClose.className = 'tab-close';
    tabClose.textContent = '×';
    tabClose.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeTab(tabId);
    });
    
    tabElement.appendChild(tabLabel);
    tabElement.appendChild(tabClose);
    
    // Add click handler to activate tab
    tabElement.addEventListener('click', () => {
      this.activateTab(tabId);
    });
    
    // Add tab to container
    this.tabsContainer.appendChild(tabElement);
    
    // Add tab to tabs array
    this.tabs.push({
      id: tabId,
      name,
      element: tabElement,
      connection
    });
    
    // Create terminal container
    const terminalElement = document.createElement('div');
    terminalElement.className = 'terminal-instance';
    terminalElement.id = `terminal-${tabId}`;
    this.terminalContainer.appendChild(terminalElement);
    
    // Activate the new tab
    this.activateTab(tabId);
    
    // If a connection was provided, create a terminal with it
    if (connection) {
      // We need to do this after the tab is fully created and active
      setTimeout(() => {
        this.terminalManager.createTerminal(connection, tabId);
      }, 0);
    }
    
    // Return the tab ID
    return tabId;
  }
  
  /**
   * Activate a tab
   * @param {string} tabId - ID of the tab to activate
   */
  activateTab(tabId) {
    // Deactivate all tabs
    this.tabs.forEach(tab => {
      tab.element.classList.remove('active');
    });
    
    // Deactivate all terminal instances
    const terminalInstances = document.querySelectorAll('.terminal-instance');
    terminalInstances.forEach(instance => {
      instance.classList.remove('active');
    });
    
    // Hide welcome screen
    this.welcomeScreen.style.display = 'none';
    
    // Activate the selected tab
    const tab = this.tabs.find(t => t.id === tabId);
    if (tab) {
      tab.element.classList.add('active');
      
      // Activate the corresponding terminal instance
      const terminalElement = document.getElementById(`terminal-${tabId}`);
      if (terminalElement) {
        terminalElement.classList.add('active');
      }
      
      // Set as active tab
      this.activeTabId = tabId;
      
      // Notify terminal manager of active tab change
      this.terminalManager.setActiveTerminal(tabId);
    }
  }
  
  /**
   * Close a tab
   * @param {string} tabId - ID of the tab to close
   */
  closeTab(tabId) {
    // Find the tab index
    const tabIndex = this.tabs.findIndex(t => t.id === tabId);
    
    if (tabIndex !== -1) {
      // Get the tab
      const tab = this.tabs[tabIndex];
      
      // Remove tab element
      tab.element.remove();
      
      // Remove terminal instance
      const terminalElement = document.getElementById(`terminal-${tabId}`);
      if (terminalElement) {
        terminalElement.remove();
      }
      
      // Remove from tabs array
      this.tabs.splice(tabIndex, 1);
      
      // If this was the active tab, activate another one
      if (this.activeTabId === tabId) {
        if (this.tabs.length > 0) {
          // Activate the tab to the left, or the first tab if this was the first tab
          const newActiveTabIndex = Math.max(0, tabIndex - 1);
          this.activateTab(this.tabs[newActiveTabIndex].id);
        } else {
          // If no tabs left, show welcome screen
          this.activeTabId = null;
          this.welcomeScreen.style.display = 'flex';
        }
      }
      
      // Notify terminal manager to clean up
      this.terminalManager.closeTerminal(tabId);
    }
  }
  
  /**
   * Get the active tab ID
   * @returns {string|null} Active tab ID or null if none active
   */
  getActiveTabId() {
    return this.activeTabId;
  }
  
  /**
   * Update a tab's name
   * @param {string} tabId - ID of the tab to update
   * @param {string} name - New name for the tab
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
   * Create a custom tab with arbitrary content
   * @param {string} name - Name for the tab
   * @param {HTMLElement} content - Content element to add to the tab
   * @returns {string} The ID of the new tab
   */
  createCustomTab(name, content) {
    // Generate a unique ID for the tab
    const tabId = `tab-${Date.now()}-${this.tabCounter++}`;
    
    // Create tab element
    const tabElement = document.createElement('div');
    tabElement.className = 'tab';
    tabElement.dataset.tabId = tabId;
    
    // Tab label
    const tabLabel = document.createElement('span');
    tabLabel.className = 'tab-label';
    tabLabel.textContent = name;
    
    // Tab close button
    const tabClose = document.createElement('span');
    tabClose.className = 'tab-close';
    tabClose.textContent = '×';
    tabClose.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeTab(tabId);
    });
    
    tabElement.appendChild(tabLabel);
    tabElement.appendChild(tabClose);
    
    // Add click handler to activate tab
    tabElement.addEventListener('click', () => {
      this.activateTab(tabId);
    });
    
    // Add tab to container
    this.tabsContainer.appendChild(tabElement);
    
    // Add tab to tabs array
    this.tabs.push({
      id: tabId,
      name,
      element: tabElement,
      isCustom: true
    });
    
    // Create content container
    const contentElement = document.createElement('div');
    contentElement.className = 'terminal-instance';
    contentElement.id = `terminal-${tabId}`;
    
    // Add the custom content
    if (content) {
      contentElement.appendChild(content);
    }
    
    this.terminalContainer.appendChild(contentElement);
    
    // Activate the new tab
    this.activateTab(tabId);
    
    // Return the tab ID
    return tabId;
  }
} 