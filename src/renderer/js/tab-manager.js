/**
 * Terminal örnekleri için sekmeleri yönetir.
 * Yeni sekmeler oluşturabilir, sekmeleri etkinleştirebilir, kapatabilir ve özel içerikli sekmeler oluşturabilir.
 */
export class TabManager {
  /**
   * TabManager örneğini başlatır.
   * @param {import('./terminal-manager.js').TerminalManager} terminalManager - TerminalManager örneği.
   */
  constructor(terminalManager) {
    this.terminalManager = terminalManager;
    /** @type {Array<Object>} Sekmeleri ve meta verilerini tutan dizi. */
    this.tabs = [];
    /** @type {string|null} Aktif olan sekmenin ID'si. */
    this.activeTabId = null;
    
    this.tabsContainer = document.getElementById('tabs');
    this.terminalContainer = document.getElementById('terminalContainer');
    this.welcomeScreen = document.getElementById('welcomeScreen');
    
    /** @type {number} Benzersiz sekme ID'leri oluşturmak için sayaç. */
    this.tabCounter = 0;
  }
  
  /**
   * TabManager'ı başlatır.
   * Başlangıç ekranını bulur ve sekme yoksa gösterir.
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
   * Yeni bir terminal sekmesi oluşturur.
   * @param {string} [name='New Tab'] - Sekme için isteğe bağlı ad.
   * @param {Object} [connection=null] - İsteğe bağlı bağlantı nesnesi. Sağlanırsa, bu bağlantıyla bir terminal oluşturulur.
   * @returns {string} Oluşturulan yeni sekmenin ID'si.
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
   * Belirtilen ID'ye sahip sekmeyi etkinleştirir.
   * Diğer tüm sekmeleri ve terminal örneklerini devre dışı bırakır, karşılama ekranını gizler.
   * @param {string} tabId - Etkinleştirilecek sekmenin ID'si.
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
   * Belirtilen ID'ye sahip sekmeyi kapatır.
   * Sekme öğesini ve ilişkili terminal örneğini DOM'dan kaldırır.
   * Eğer kapatılan sekme aktifse, başka bir sekmeyi etkinleştirir veya sekme kalmadıysa karşılama ekranını gösterir.
   * @param {string} tabId - Kapatılacak sekmenin ID'si.
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
   * Aktif olan sekmenin ID'sini döndürür.
   * @returns {string|null} Aktif sekme ID'si veya aktif sekme yoksa `null`.
   */
  getActiveTabId() {
    return this.activeTabId;
  }
  
  /**
   * Belirtilen ID'ye sahip sekmenin adını günceller.
   * @param {string} tabId - Güncellenecek sekmenin ID'si.
   * @param {string} name - Sekme için yeni ad.
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
   * İsteğe bağlı içerikle özel bir sekme oluşturur.
   * @param {string} name - Sekme için ad.
   * @param {HTMLElement} content - Sekmeye eklenecek içerik HTML öğesi.
   * @returns {string} Oluşturulan yeni sekmenin ID'si.
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
    contentElement.className = 'terminal-instance'; // Aynı stilin uygulanması için terminal-instance sınıfını kullanabilir
    contentElement.id = `terminal-${tabId}`; // ID tutarlılığı için
    
    if (content) {
      contentElement.appendChild(content);
    }
    
    this.terminalContainer.appendChild(contentElement);
    this.activateTab(tabId);
    return tabId;
  }
} 