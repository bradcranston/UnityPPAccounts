// Account List Interface for FileMaker WebViewer
class AccountListManager {
  constructor() {
    this.accounts = [];
    this.filteredAccounts = [];
    this.allPortals = [];
    this.availablePortals = [];
    this.filteredPortals = [];
    this.searchTerm = '';
    this.filterType = 'all';
    this.portalSearchTerm = '';
    
    this.initializeElements();
    this.attachEventListeners();
    this.attachAccountEventListeners();
    this.attachModalEventListeners();
    this.loadInitialData();
  }

  initializeElements() {
    this.accountList = document.getElementById('accountList');
    this.searchInput = document.getElementById('searchInput');
    this.filterSelect = document.getElementById('filterSelect');
    this.totalCount = document.getElementById('totalCount');
    this.activeCount = document.getElementById('activeCount');
    this.addAccountBtn = document.getElementById('addAccountBtn');
    this.addAccountModal = document.getElementById('addAccountModal');
    this.closeModal = document.getElementById('closeModal');
    this.portalSearchInput = document.getElementById('portalSearchInput');
    this.portalList = document.getElementById('portalList');
    this.availableCount = document.getElementById('availableCount');
  }

  attachEventListeners() {
    this.searchInput.addEventListener('input', (e) => {
      this.searchTerm = e.target.value.toLowerCase();
      this.filterAndRenderAccounts();
    });

    this.filterSelect.addEventListener('change', (e) => {
      this.filterType = e.target.value;
      this.filterAndRenderAccounts();
    });

    this.addAccountBtn.addEventListener('click', () => {
      this.showAddAccountModal();
    });
  }

  attachModalEventListeners() {
    this.closeModal.addEventListener('click', () => {
      this.hideAddAccountModal();
    });

    this.addAccountModal.addEventListener('click', (e) => {
      if (e.target === this.addAccountModal) {
        this.hideAddAccountModal();
      }
    });

    this.portalSearchInput.addEventListener('input', (e) => {
      this.portalSearchTerm = e.target.value.toLowerCase();
      this.filterAndRenderPortals();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.addAccountModal.style.display === 'block') {
        this.hideAddAccountModal();
      }
    });
  }

  loadInitialData() {
    // Show empty state until FileMaker passes in data
    console.log('Account List Interface ready - waiting for FileMaker data...');
    this.showEmptyState();
  }

  setAccountData(accountsData, portalsData = null) {
    console.log('setAccountData called with accounts:', accountsData);
    console.log('setAccountData called with portals:', portalsData);
    console.log('Accounts data type:', typeof accountsData);
    
    // Parse JSON string if needed for accounts
    let parsedAccountsData = accountsData;
    if (typeof accountsData === 'string') {
      try {
        parsedAccountsData = JSON.parse(accountsData);
        console.log('Parsed accounts JSON string to object');
      } catch (e) {
        console.error('Failed to parse accounts JSON string:', e);
        this.accounts = [];
        this.filterAndRenderAccounts();
        this.updateStats();
        return;
      }
    }
    
    // Parse JSON string if needed for portals
    let parsedPortalsData = portalsData;
    if (typeof portalsData === 'string') {
      try {
        parsedPortalsData = JSON.parse(portalsData);
        console.log('Parsed portals JSON string to object');
      } catch (e) {
        console.error('Failed to parse portals JSON string:', e);
        parsedPortalsData = null;
      }
    }
    
    console.log('Parsed accounts data:', parsedAccountsData);
    console.log('Parsed portals data:', parsedPortalsData);
    
    // Handle both direct array and OData format for accounts
    if (parsedAccountsData.value && Array.isArray(parsedAccountsData.value)) {
      this.accounts = parsedAccountsData.value;
      console.log('Using accounts data.value, found', this.accounts.length, 'accounts');
    } else if (Array.isArray(parsedAccountsData)) {
      this.accounts = parsedAccountsData;
      console.log('Using direct accounts array, found', this.accounts.length, 'accounts');
    } else {
      this.accounts = [];
      console.log('No valid accounts data format found, accounts array is empty');
    }

    // Handle portals data
    if (parsedPortalsData) {
      if (parsedPortalsData.value && Array.isArray(parsedPortalsData.value)) {
        this.allPortals = parsedPortalsData.value;
        console.log('Using portals data.value, found', this.allPortals.length, 'portals');
      } else if (Array.isArray(parsedPortalsData)) {
        this.allPortals = parsedPortalsData;
        console.log('Using direct portals array, found', this.allPortals.length, 'portals');
      } else {
        this.allPortals = [];
        console.log('No valid portals data format found, portals array is empty');
      }
    } else {
      this.allPortals = [];
      console.log('No portals data provided');
    }

    console.log('Final accounts array:', this.accounts);
    console.log('Final portals array:', this.allPortals);
    this.filterAndRenderAccounts();
    this.updateStats();
  }

  filterAndRenderAccounts() {
    console.log('filterAndRenderAccounts called');
    console.log('Total accounts:', this.accounts.length);
    console.log('Search term:', this.searchTerm);
    console.log('Filter type:', this.filterType);
    
    this.filteredAccounts = this.accounts.filter(account => {
      // Search filter
      const matchesSearch = this.searchTerm === '' || 
        account.Name.toLowerCase().includes(this.searchTerm) ||
        account.AccountNumber.toString().includes(this.searchTerm);

      // Status filter
      const isActive = account.fActive === 1;
      const matchesFilter = 
        this.filterType === 'all' ||
        (this.filterType === 'active' && isActive) ||
        (this.filterType === 'inactive' && !isActive);

      return matchesSearch && matchesFilter;
    });

    console.log('Filtered accounts:', this.filteredAccounts.length);
    this.renderAccounts();
  }

  renderAccounts() {
    console.log('renderAccounts called with', this.filteredAccounts.length, 'accounts');
    
    if (this.filteredAccounts.length === 0) {
      console.log('No accounts to render, showing empty state');
      this.showEmptyState();
      return;
    }

    console.log('Creating HTML for accounts...');
    const accountsHtml = this.filteredAccounts.map(account => 
      this.createAccountHTML(account)
    ).join('');

    console.log('Setting innerHTML with', accountsHtml.length, 'characters of HTML');
    this.accountList.innerHTML = accountsHtml;

    console.log('Accounts rendered successfully');
  }

  createAccountHTML(account) {
    const isActive = account.fActive === 1;
    
    return `
      <div class="account-item ${isActive ? 'active' : 'inactive'}" data-id="${account.__ID}">
        <div class="account-info">
          <div class="account-name">${account.Name}</div>
          <div class="account-details">
            <span class="account-number">#${account.AccountNumber}</span>
          </div>
        </div>
        
        <div class="account-actions">
          <button 
            class="toggle-button ${isActive ? 'active' : 'inactive'}" 
            data-id="${account.__ID}"
            data-action="toggle-status"
          >
            ${isActive ? 'Deactivate' : 'Activate'}
          </button>
          <button 
            class="delete-button" 
            data-id="${account.__ID}"
            data-action="delete"
            title="Delete Account"
          >
            Delete
          </button>
        </div>
      </div>
    `;
  }

  attachAccountEventListeners() {
    // Set up event delegation - this will work for all current and future buttons
    this.accountList.addEventListener('click', (e) => {
      if (e.target.classList.contains('toggle-button')) {
        console.log('Toggle button clicked');
        const accountId = e.target.getAttribute('data-id');
        console.log('Account ID:', accountId);
        
        const account = this.accounts.find(acc => acc.__ID.toString() === accountId);
        console.log('Found account:', account);
        
        if (account) {
          const newStatus = account.fActive === 1 ? null : 1;
          console.log('Toggling from', account.fActive, 'to', newStatus);
          this.updateAccountStatus(accountId, newStatus);
        }
      } else if (e.target.classList.contains('delete-button')) {
        console.log('Delete button clicked');
        const accountId = e.target.getAttribute('data-id');
        console.log('Account ID:', accountId);
        
        const account = this.accounts.find(acc => acc.__ID.toString() === accountId);
        console.log('Found account to delete:', account);
        
        if (account) {
          this.deleteAccount(accountId);
        }
      }
    });
  }

  updateAccountStatus(accountId, newStatus) {
    console.log('updateAccountStatus called with:', accountId, newStatus);
    
    // Find and update the account
    const accountIndex = this.accounts.findIndex(acc => acc.__ID.toString() === accountId);
    console.log('Found account at index:', accountIndex);
    
    if (accountIndex !== -1) {
      const oldStatus = this.accounts[accountIndex].fActive;
      this.accounts[accountIndex].fActive = newStatus;
      console.log('Updated account status from', oldStatus, 'to', newStatus);
      
      // Prepare data for FileMaker script
      const scriptParameter = {
        ...this.accounts[accountIndex], // Include all account data
        mode: 'status' // Add mode parameter
      };
      
      console.log('Calling FileMaker script with parameter:', scriptParameter);
      
      // Call FileMaker script
      this.callFileMakerScript('Manage: Accounts', JSON.stringify(scriptParameter));
      
      // Re-filter and render
      this.filterAndRenderAccounts();
      this.updateStats();
      
      // Notify FileMaker of the change (legacy callback)
      this.notifyFileMaker('statusChanged', {
        accountId: accountId,
        accountNumber: this.accounts[accountIndex].AccountNumber,
        newStatus: newStatus,
        account: this.accounts[accountIndex]
      });
    }
  }

  deleteAccount(accountId) {
    console.log('deleteAccount called with:', accountId);
    
    // Find the account
    const account = this.accounts.find(acc => acc.__ID.toString() === accountId);
    
    if (account) {
      console.log('Deleting account:', account);
      
      // Prepare data for FileMaker script
      const scriptParameter = {
        ...account, // Include all account data
        mode: 'delete' // Add mode parameter
      };
      
      console.log('Calling FileMaker script with parameter:', scriptParameter);
      
      // Call FileMaker script
      this.callFileMakerScript('Manage: Accounts', JSON.stringify(scriptParameter));
      
      // Remove from local array (optimistic update)
      const accountIndex = this.accounts.findIndex(acc => acc.__ID.toString() === accountId);
      if (accountIndex !== -1) {
        this.accounts.splice(accountIndex, 1);
        console.log('Removed account from local array');
      }
      
      // Re-filter and render
      this.filterAndRenderAccounts();
      this.updateStats();
      
      // Notify FileMaker of the change (legacy callback)
      this.notifyFileMaker('accountDeleted', {
        accountId: accountId,
        accountNumber: account.AccountNumber,
        account: account
      });
    }
  }

  updateStats() {
    const total = this.accounts.length;
    const active = this.accounts.filter(account => account.fActive === 1).length;
    
    this.totalCount.textContent = total;
    this.activeCount.textContent = active;
  }

  showEmptyState() {
    this.accountList.innerHTML = `
      <div class="empty-state">
        <h3>No accounts found</h3>
        <p>No accounts match your current filter criteria, or no data has been loaded yet.</p>
      </div>
    `;
  }

  showAddAccountModal() {
    console.log('Showing add account modal');
    this.updateAvailablePortals();
    this.filterAndRenderPortals();
    this.addAccountModal.style.display = 'block';
    document.body.style.overflow = 'hidden';
    this.portalSearchInput.focus();
  }

  hideAddAccountModal() {
    console.log('Hiding add account modal');
    this.addAccountModal.style.display = 'none';
    document.body.style.overflow = 'auto';
    this.portalSearchInput.value = '';
    this.portalSearchTerm = '';
  }

  updateAvailablePortals() {
    if (!this.allPortals || this.allPortals.length === 0) {
      this.availablePortals = [];
      return;
    }

    // Get account numbers from existing accounts
    const existingAccountNumbers = new Set();
    this.accounts.forEach(account => {
      if (account.AccountNumber) {
        existingAccountNumbers.add(account.AccountNumber.toString());
      }
    });

    console.log('Existing account numbers:', existingAccountNumbers);

    // Track unique portal names
    const seenPortalNames = new Set();

    // Filter portals that are not already in accounts and have valid portal names
    this.availablePortals = this.allPortals.filter(portal => {
      // Skip if no portal name or null
      if (!portal.portal || portal.portal === null) {
        return false;
      }

      // Skip if this portal's number is already in accounts
      if (portal.number && existingAccountNumbers.has(portal.number.toString())) {
        return false;
      }

      // Skip if we've already seen this portal name (case-insensitive)
      const portalNameLower = portal.portal.toLowerCase();
      if (seenPortalNames.has(portalNameLower)) {
        return false;
      }

      // Add this portal name to our set of seen names
      seenPortalNames.add(portalNameLower);
      return true;
    });

    console.log('Available unique portals:', this.availablePortals.length);
  }

  filterAndRenderPortals() {
    if (!this.availablePortals) {
      this.availablePortals = [];
    }

    this.filteredPortals = this.availablePortals.filter(portal => {
      return this.portalSearchTerm === '' || 
        portal.portal.toLowerCase().includes(this.portalSearchTerm) ||
        (portal.number && portal.number.toString().includes(this.portalSearchTerm));
    });

    this.renderPortals();
    this.availableCount.textContent = this.filteredPortals.length;
  }

  renderPortals() {
    if (this.filteredPortals.length === 0) {
      this.portalList.innerHTML = `
        <div class="empty-portals">
          <h3>No portals available</h3>
          <p>All portals are already added as accounts or no portals match your search.</p>
        </div>
      `;
      return;
    }

    const portalsHtml = this.filteredPortals.map(portal => 
      this.createPortalHTML(portal)
    ).join('');

    this.portalList.innerHTML = portalsHtml;

    // Attach event listeners to portal buttons
    this.attachPortalEventListeners();
  }

  createPortalHTML(portal) {
    const portalNumber = portal.number ? `Account #${portal.number}` : 'No Account Number';
    
    return `
      <div class="portal-item" data-portal='${JSON.stringify(portal).replace(/'/g, "&apos;")}'>
        <div class="portal-info">
          <div class="portal-name">${portal.portal}</div>
          <div class="portal-number">${portalNumber}</div>
        </div>
        <button class="add-portal-btn" data-portal='${JSON.stringify(portal).replace(/'/g, "&apos;")}'>
          Add Account
        </button>
      </div>
    `;
  }

  attachPortalEventListeners() {
    this.portalList.addEventListener('click', (e) => {
      if (e.target.classList.contains('add-portal-btn')) {
        const portalData = JSON.parse(e.target.getAttribute('data-portal').replace(/&apos;/g, "'"));
        this.addPortalAsAccount(portalData);
      }
    });
  }

  addPortalAsAccount(portalData) {
    console.log('Adding portal as account:', portalData);

    // Prepare data for FileMaker script
    const scriptParameter = {
      ...portalData,
      mode: 'addAccount'
    };

    console.log('Calling FileMaker script with parameter:', scriptParameter);

    // Call FileMaker script
    this.callFileMakerScript('Manage: Accounts', JSON.stringify(scriptParameter));

    // Hide the modal
    this.hideAddAccountModal();

    // Notify FileMaker of the change (legacy callback)
    this.notifyFileMaker('accountAdded', {
      portal: portalData
    });
  }

  showLoading() {
    this.accountList.innerHTML = `
      <div class="loading">
        <div class="spinner"></div>
      </div>
    `;
  }

  // Method to call FileMaker scripts
  callFileMakerScript(scriptName, parameter) {
    try {
      // Try the modern FileMaker.PerformScript method first
      if (window.FileMaker && window.FileMaker.PerformScript) {
        console.log('Calling FileMaker script using FileMaker.PerformScript');
        window.FileMaker.PerformScript(scriptName, parameter);
      }
      // Fallback to URL scheme method
      else {
        console.log('Using URL scheme to call FileMaker script');
        const encodedParameter = encodeURIComponent(parameter);
        window.location.href = `fmp://$/${scriptName}?script=${scriptName}&param=${encodedParameter}`;
      }
    } catch (error) {
      console.error('Error calling FileMaker script:', error);
      console.log('Script name:', scriptName);
      console.log('Parameter:', parameter);
    }
  }

  // Method to notify FileMaker of changes (if callback is available)
  notifyFileMaker(eventType, data) {
    if (window.FileMakerCallback && typeof window.FileMakerCallback === 'function') {
      window.FileMakerCallback(eventType, data);
    } else {
      console.log('FileMaker callback not available:', eventType, data);
    }
  }

  // Public methods for FileMaker to call
  refreshData(accountsData, portalsData = null) {
    this.setAccountData(accountsData, portalsData);
  }

  getAccountData() {
    return {
      accounts: this.accounts,
      filteredAccounts: this.filteredAccounts,
      stats: {
        total: this.accounts.length,
        active: this.accounts.filter(acc => acc.fActive === 1).length
      }
    };
  }

  clearSearch() {
    this.searchInput.value = '';
    this.searchTerm = '';
    this.filterAndRenderAccounts();
  }

  setFilter(filterType) {
    this.filterSelect.value = filterType;
    this.filterType = filterType;
    this.filterAndRenderAccounts();
  }
}

// Initialize the account list manager
const accountManager = new AccountListManager();

// Export functions to window for FileMaker to access (using underscore notation)
window.setAccountData = (accountsData, portalsData = null) => {
  console.log('window.setAccountData called');
  accountManager.setAccountData(accountsData, portalsData);
};

window.getAccountData = () => {
  return accountManager.getAccountData();
};

window.clearAccountSearch = () => {
  accountManager.clearSearch();
};

window.setAccountFilter = (filterType) => {
  accountManager.setFilter(filterType);
};

window.getFilteredAccounts = () => {
  return accountManager.filteredAccounts;
};

window.setFileMakerCallback = (callback) => {
  window.FileMakerCallback = callback;
};

// Test function to load sample data
window.loadTestData = () => {
  console.log('Loading test data...');
  const testData = {
    "value": [
      {
        "AccountNumber": "13048",
        "fActive": 1,
        "Name": "Stage Right (PrintSmith Account #13048)",
        "__ID": "3137769144754612060658265193570782713700691245404953606869"
      },
      {
        "AccountNumber": "12904",
        "fActive": 1,
        "Name": "Maverick Dental (PrintSmith Account #12904)",
        "__ID": "3756860258697808320929480764878445447101283796073656120541"
      },
      {
        "AccountNumber": "23091",
        "fActive": null,
        "Name": "Heroes Never Alone (PrintSmith Account #23091)",
        "__ID": "4194128625797891814911180760974403638161317234239138876634"
      }
    ]
  };
  window.setAccountData(testData);
};

// Keep the object notation as well for compatibility
window.AccountListInterface = {
  setData: window.setAccountData,
  getData: window.getAccountData,
  clearSearch: window.clearAccountSearch,
  setFilter: window.setAccountFilter,
  getFilteredAccounts: window.getFilteredAccounts,
  setCallback: window.setFileMakerCallback
};

// Also expose the manager instance for advanced usage
window.AccountManager = accountManager;

console.log('Account List Interface loaded and ready for FileMaker integration');
