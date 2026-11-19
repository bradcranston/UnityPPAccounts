// Account List Interface for FileMaker WebViewer
import { PriceManager } from './prices.js';
import { ReportManager } from './report.js';
import { LocationManager } from './locations.js';
class AccountListManager {
  constructor() {
    this.accounts = [];
    this.individualAccounts = [];
    this.groupAccounts = [];
    this.filteredAccounts = [];
    this.allPortals = [];
    this.availablePortals = [];
    this.filteredPortals = [];
    this.searchTerm = '';
    this.filterType = 'all';
    this.portalSearchTerm = '';
    this.currentAccountType = 'Individual'; // 'Individual', 'Group' or 'Log'
    this.lastAccountType = 'Individual'; // last non-Log tab, for the Add Account modal
    this.isAddingAccount = false; // Flag to prevent duplicate additions

    // --- Log tab state ---
    this.logRows = [];
    this.logTotal = 0;
    this.logLoaded = false;
    this.logBusy = false;
    this.logPageSize = 200;
    this.logFilters = { search: '', status: 'all', account: 'all' };
    this.logExpanded = new Set();
    this.logSearchTimer = null;
    
    // Separate filter states for each account type
    this.individualFilters = {
      searchTerm: '',
      filterType: 'all'
    };
    this.groupFilters = {
      searchTerm: '',
      filterType: 'all'
    };
    
    this.initializeElements();
    this.attachEventListeners();
    this.attachAccountEventListeners();
    this.attachModalEventListeners();
    this.prices = new PriceManager(this);
    this.report = new ReportManager(this);
    this.locations = new LocationManager(this);
    this.loadInitialData();
    
    // Set initial container mode
    setTimeout(() => {
      this.updateTabStyles();
    }, 100);
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
    this.individualTab = document.getElementById('individualTab');
    this.groupTab = document.getElementById('groupTab');
    this.clearFiltersBtn = document.getElementById('clearFiltersBtn');

    // panels + stats
    this.accountsPanel = document.getElementById('accountsPanel');
    this.logPanel = document.getElementById('logPanel');
    this.accountStats = document.getElementById('accountStats');
    this.logStats = document.getElementById('logStats');

    // log tab
    this.logTab = document.getElementById('logTab');
    this.pricesTab = document.getElementById('pricesTab');
    this.reportTab = document.getElementById('reportTab');
    this.reportPanel = document.getElementById('reportPanel');
    this.reportStats = document.getElementById('reportStats');
    this.pricesPanel = document.getElementById('pricesPanel');
    this.priceStats = document.getElementById('priceStats');
    this.locationsTab = document.getElementById('locationsTab');
    this.locationsPanel = document.getElementById('locationsPanel');
    this.locationStats = document.getElementById('locationStats');
    this.logBody = document.getElementById('logBody');
    this.logSearchInput = document.getElementById('logSearchInput');
    this.logStatusSelect = document.getElementById('logStatusSelect');
    this.logAccountSelect = document.getElementById('logAccountSelect');
    this.logRefreshBtn = document.getElementById('logRefreshBtn');
    this.logClearBtn = document.getElementById('logClearBtn');
    this.logMoreBtn = document.getElementById('logMoreBtn');
    this.logShown = document.getElementById('logShown');
    this.logTotalEl = document.getElementById('logTotal');
    this.logNote = document.getElementById('logNote');

    // manual add
    this.manualNumber = document.getElementById('manualNumber');
    this.manualName = document.getElementById('manualName');
    this.manualPrefix = document.getElementById('manualPrefix');
    this.manualAddBtn = document.getElementById('manualAddBtn');
    this.manualPreview = document.getElementById('manualPreview');
    this.manualError = document.getElementById('manualError');

    this.toastEl = document.getElementById('toast');
  }

  attachEventListeners() {
    this.searchInput.addEventListener('input', (e) => {
      this.searchTerm = e.target.value.toLowerCase();
      this.saveCurrentFilterState(); // Save state when it changes
      this.filterAndRenderAccounts();
    });

    this.filterSelect.addEventListener('change', (e) => {
      this.filterType = e.target.value;
      this.saveCurrentFilterState(); // Save state when it changes
      this.filterAndRenderAccounts();
    });

    this.addAccountBtn.addEventListener('click', () => {
      this.showAddAccountModal();
    });

    // Tab event listeners
    this.individualTab.addEventListener('click', () => {
      this.switchToAccountType('Individual');
    });

    this.groupTab.addEventListener('click', () => {
      this.switchToAccountType('Group');
    });

    this.clearFiltersBtn.addEventListener('click', () => {
      this.clearFilters();
    });

    this.logTab.addEventListener('click', () => {
      this.switchToAccountType('Log');
    });

    this.pricesTab.addEventListener('click', () => {
      this.switchToAccountType('Prices');
    });

    this.reportTab.addEventListener('click', () => {
      this.switchToAccountType('Report');
    });

    this.locationsTab.addEventListener('click', () => {
      this.switchToAccountType('Locations');
    });

    this.attachLogEventListeners();
    this.attachManualAddEventListeners();
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
    this.updateTabStyles();
    this.showEmptyState();
  }

  setAccountData(accountsData, portalsData = null, selectedType = null) {
    console.log('setAccountData called with accounts:', accountsData);
    console.log('setAccountData called with portals:', portalsData);
    console.log('setAccountData called with selected type:', selectedType);
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

    // Separate accounts by type
    this.individualAccounts = this.accounts.filter(acc => acc.Type === 'Individual');
    this.groupAccounts = this.accounts.filter(acc => acc.Type === 'Group');
    
    console.log('Separating accounts by type:');
    console.log('- Individual accounts:', this.individualAccounts.length, this.individualAccounts.map(a => a.Name));
    console.log('- Group accounts:', this.groupAccounts.length, this.groupAccounts.map(a => a.Name));
    
    // Set the selected type if provided
    if (selectedType && (selectedType === 'Individual' || selectedType === 'Group')) {
      this.currentAccountType = selectedType;
      console.log('Set current account type to:', selectedType);
    }
    
    console.log('Final accounts array:', this.accounts);
    console.log('Individual accounts:', this.individualAccounts.length);
    console.log('Group accounts:', this.groupAccounts.length);
    console.log('Final portals array:', this.allPortals);
    
    this.updateCurrentAccountsList();
    this.updateTabStyles();
    
    // Initialize filter state
    this.restoreFilterState();
    
    this.filterAndRenderAccounts();
    this.updateStats();
  }

  clearFilters() {
    console.log('Clearing filters for', this.currentAccountType);
    
    // Clear UI elements
    this.searchInput.value = '';
    this.searchTerm = '';
    this.filterSelect.value = 'all';
    this.filterType = 'all';
    
    // Clear the current type's filter state
    const currentFilters = this.getCurrentFilters();
    currentFilters.searchTerm = '';
    currentFilters.filterType = 'all';
    
    this.filterAndRenderAccounts();
  }

  getCurrentFilters() {
    return this.currentAccountType === 'Individual' ? this.individualFilters : this.groupFilters;
  }
  
  saveCurrentFilterState() {
    const currentFilters = this.getCurrentFilters();
    currentFilters.searchTerm = (this.searchInput?.value || '').toLowerCase();
    currentFilters.filterType = this.filterSelect?.value || 'all';
    console.log('Saved filter state for', this.currentAccountType, ':', currentFilters);
  }
  
  restoreFilterState() {
    const currentFilters = this.getCurrentFilters();
    
    if (this.searchInput) {
      this.searchInput.value = currentFilters.searchTerm;
    }
    if (this.filterSelect) {
      this.filterSelect.value = currentFilters.filterType;
    }
    
    // Update internal state
    this.searchTerm = currentFilters.searchTerm;
    this.filterType = currentFilters.filterType;
    
    console.log('Restored filter state for', this.currentAccountType, ':', currentFilters);
  }

  updateCurrentAccountsList() {
    console.log('updateCurrentAccountsList called with type:', this.currentAccountType);
    
    // Get the current list based on selected type
    const previousLength = this.currentAccounts?.length || 0;
    this.currentAccounts = this.currentAccountType === 'Individual' 
      ? this.individualAccounts 
      : this.groupAccounts;
      
    console.log('- Previous currentAccounts length:', previousLength);
    console.log('- Individual accounts available:', this.individualAccounts?.length || 0);
    console.log('- Group accounts available:', this.groupAccounts?.length || 0);
    console.log('- New currentAccounts length:', this.currentAccounts?.length || 0);
    console.log('- Current accounts:', this.currentAccounts?.map(a => a.Name) || []);
  }

  switchToAccountType(type) {
    console.log('=== SWITCHING TO TAB:', type, '(was', this.currentAccountType + ') ===');

    // Only the account tabs carry search/filter state
    if (['Log', 'Prices', 'Report', 'Locations'].indexOf(this.currentAccountType) < 0) {
      this.saveCurrentFilterState();
      this.lastAccountType = this.currentAccountType;
    }

    this.currentAccountType = type;
    this.updateTabStyles();

    if (type === 'Prices') {
      this.showPanel('prices');
      this.prices.onShow();
      return;
    }

    if (type === 'Locations') {
      this.showPanel('locations');
      this.locations.onShow();
      return;
    }

    if (type === 'Report') {
      this.showPanel('report');
      this.report.onShow();
      return;
    }

    if (type === 'Log') {
      this.showPanel('log');
      if (!this.logLoaded) {
        this.requestLogPage(0);
      } else {
        this.renderLog();
      }
      console.log('=== SWITCH COMPLETE ===');
      return;
    }

    this.showPanel('accounts');
    this.restoreFilterState();
    this.updateCurrentAccountsList();
    this.filterAndRenderAccounts();
    this.updateStats();

    console.log('=== SWITCH COMPLETE ===');
  }

  showPanel(which) {
    const isLog = which === 'log';
    const isPrices = which === 'prices';
    const isReport = which === 'report';
    const isLocations = which === 'locations';
    const isAccounts = !isLog && !isPrices && !isReport && !isLocations;
    this.accountsPanel.hidden = !isAccounts;
    this.logPanel.hidden = !isLog;
    this.pricesPanel.hidden = !isPrices;
    this.reportPanel.hidden = !isReport;
    this.locationsPanel.hidden = !isLocations;
    this.accountStats.hidden = !isAccounts;
    this.logStats.hidden = !isLog;
    this.priceStats.hidden = !isPrices;
    this.reportStats.hidden = !isReport;
    this.locationStats.hidden = !isLocations;
  }

  updateTabStyles() {
    const tabs = {
      Individual: this.individualTab,
      Group: this.groupTab,
      Log: this.logTab,
      Prices: this.pricesTab,
      Report: this.reportTab,
      Locations: this.locationsTab
    };

    Object.keys(tabs).forEach((key) => {
      if (!tabs[key]) return;
      tabs[key].classList.toggle('active', key === this.currentAccountType);
    });

    const modes = { Individual: 'individual-mode', Group: 'group-mode', Log: 'log-mode', Prices: 'prices-mode', Report: 'report-mode', Locations: 'prices-mode' };
    const container = document.querySelector('.container');
    container.className = 'container ' + (modes[this.currentAccountType] || 'individual-mode');
  }

  filterAndRenderAccounts() {
    console.log('=== FILTER AND RENDER ACCOUNTS ===');
    
    // Ensure currentAccounts is properly set
    if (!this.currentAccounts) {
      console.log('currentAccounts was null/undefined, updating...');
      this.updateCurrentAccountsList();
    }
    
    console.log('Current account type:', this.currentAccountType);
    console.log('Total accounts to filter:', this.currentAccounts?.length || 0);
    console.log('Search term:', `"${this.searchTerm}"`);
    console.log('Filter type:', this.filterType);
    
    if (this.currentAccounts?.length > 0) {
      console.log('Sample account names:', this.currentAccounts.slice(0, 3).map(a => a.Name));
    }
    
    this.filteredAccounts = (this.currentAccounts || []).filter(account => {
      // Search filter
      const nameMatch = account.Name?.toLowerCase().includes(this.searchTerm);
      const numberMatch = account.AccountNumber?.toString().includes(this.searchTerm);
      const prefixMatch = (account.TrackingPrefix || '').toLowerCase().includes(this.searchTerm);
      const matchesSearch = this.searchTerm === '' || nameMatch || numberMatch || prefixMatch;

      // Status filter
      const isActive = account.fActive === 1;
      const matchesFilter = 
        this.filterType === 'all' ||
        (this.filterType === 'active' && isActive) ||
        (this.filterType === 'inactive' && !isActive);

      const passes = matchesSearch && matchesFilter;
      
      if (this.searchTerm !== '' && nameMatch) {
        console.log(`Account "${account.Name}" matches search "${this.searchTerm}"`);
      }
      
      return passes;
    });

    console.log('Filtered accounts count:', this.filteredAccounts.length);
    if (this.filteredAccounts.length > 0) {
      console.log('Filtered account names:', this.filteredAccounts.slice(0, 5).map(a => a.Name));
    }
    
    this.renderAccounts();
    console.log('=== FILTER AND RENDER COMPLETE ===');
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
      <div class="account-item ${isActive ? 'active' : 'inactive'}" data-id="${this.escapeHtml(account.__ID)}">
        <div class="account-info">
          <div class="account-name">${this.escapeHtml(account.Name)}</div>
          <div class="account-details">
            <span class="account-number">#${this.escapeHtml(account.AccountNumber)}</span>
            <span class="account-prefix" title="Orders that arrive with no portal are matched to this account when their tracking number starts with this text. Separate more than one with commas.">
              <span class="account-prefix-label">Tracking prefix</span>
              <input type="text" class="prefix-input" autocomplete="off" spellcheck="false" readonly tabindex="-1"
                     data-id="${this.escapeHtml(account.__ID)}"
                     value="${this.escapeHtml(account.TrackingPrefix || '')}"
                     placeholder="none" />
              <button type="button" class="prefix-btn prefix-edit" data-id="${this.escapeHtml(account.__ID)}">Edit</button>
              <button type="button" class="prefix-btn prefix-save" data-id="${this.escapeHtml(account.__ID)}">Save</button>
              <button type="button" class="prefix-btn prefix-cancel" data-id="${this.escapeHtml(account.__ID)}">Cancel</button>
            </span>
          </div>
        </div>
        
        <div class="account-actions">
          <button 
            class="toggle-button ${isActive ? 'active' : 'inactive'}" 
            data-id="${this.escapeHtml(account.__ID)}"
            data-action="toggle-status"
          >
            ${isActive ? 'Deactivate' : 'Activate'}
          </button>
          <button 
            class="delete-button" 
            data-id="${this.escapeHtml(account.__ID)}"
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
    // Tracking prefix: read-only until Edit is clicked, then Save / Cancel
    // (Enter / Esc). Clicking away does nothing, so nothing saves by accident.
    this.accountList.addEventListener('click', (e) => {
      const btn = e.target.closest('.prefix-btn');
      if (!btn) return;
      const id = btn.getAttribute('data-id');
      if (btn.classList.contains('prefix-edit')) this.startPrefixEdit(id);
      else if (btn.classList.contains('prefix-save')) this.savePrefix(id);
      else if (btn.classList.contains('prefix-cancel')) this.endPrefixEdit(id, true);
    });
    this.accountList.addEventListener('keydown', (e) => {
      if (!e.target.classList.contains('prefix-input') || e.target.readOnly) return;
      const id = e.target.getAttribute('data-id');
      if (e.key === 'Enter') { e.preventDefault(); this.savePrefix(id); }
      if (e.key === 'Escape') { e.preventDefault(); this.endPrefixEdit(id, true); }
    });

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

  // =========================================================================
  // Tracking prefix
  // =========================================================================

  // "eaton ,  EATON2;x" -> "eaton, EATON2, x". Spaces are not allowed inside a
  // prefix, so they act as separators too. FileMaker normalizes the same way.
  normalizePrefix(value) {
    const seen = new Set();
    return String(value || '')
      .split(/[\s,;]+/)
      .map((p) => p.trim())
      .filter((p) => {
        if (!p || seen.has(p.toUpperCase())) return false;
        seen.add(p.toUpperCase());
        return true;
      })
      .join(', ');
  }

  // Exact (case-insensitive) prefixes already on another account, as
  // "EATON is already on Eaton (PrintSmith Account #21489)". A shorter prefix
  // that merely overlaps a longer one is allowed — the longest match wins.
  prefixClashes(prefix, exceptId) {
    const mine = prefix ? prefix.split(', ').map((p) => p.toUpperCase()) : [];
    const out = [];
    if (!mine.length) return out;
    this.accounts.forEach((a) => {
      if (exceptId !== null && String(a.__ID) === String(exceptId)) return;
      const theirs = this.normalizePrefix(a.TrackingPrefix).split(', ').filter(Boolean);
      theirs.forEach((p) => {
        if (mine.indexOf(p.toUpperCase()) >= 0) out.push(p + ' is already on ' + a.Name);
      });
    });
    return out;
  }

  prefixElements(accountId) {
    const sel = '[data-id="' + String(accountId).replace(/"/g, '\\"') + '"]';
    const input = this.accountList.querySelector('.prefix-input' + sel);
    return { input, wrap: input ? input.closest('.account-prefix') : null };
  }

  startPrefixEdit(accountId) {
    const { input, wrap } = this.prefixElements(accountId);
    if (!input || input.classList.contains('saving')) return;
    wrap.classList.add('editing');
    input.readOnly = false;
    input.removeAttribute('tabindex');
    input.focus();
    input.select();
  }

  // Leave edit mode; with revert, put back the saved value.
  endPrefixEdit(accountId, revert) {
    const { input, wrap } = this.prefixElements(accountId);
    if (!input) return;
    if (revert) {
      const acc = this.accounts.find((a) => String(a.__ID) === String(accountId));
      input.value = (acc && acc.TrackingPrefix) || '';
    }
    wrap.classList.remove('editing');
    input.readOnly = true;
    input.setAttribute('tabindex', '-1');
    input.blur();
  }

  savePrefix(accountId) {
    const account = this.accounts.find((a) => String(a.__ID) === String(accountId));
    const { input } = this.prefixElements(accountId);
    if (!account || !input) return;

    const previous = account.TrackingPrefix || '';
    const prefix = this.normalizePrefix(input.value);
    input.value = prefix;
    if (prefix === this.normalizePrefix(previous)) {
      this.endPrefixEdit(accountId, true);
      return;
    }

    // stay in edit mode so the typo can be fixed
    const clashes = this.prefixClashes(prefix, accountId);
    if (clashes.length) {
      this.showToast(clashes.join('. ') + '.', 'error');
      input.focus();
      return;
    }

    this.endPrefixEdit(accountId, false);

    account.TrackingPrefix = prefix;
    const current = (this.currentAccounts || []).find((a) => String(a.__ID) === String(accountId));
    if (current && current !== account) current.TrackingPrefix = prefix;
    this.prefixPending = this.prefixPending || {};
    this.prefixPending[accountId] = previous;
    input.classList.add('saving');

    this.callFileMakerScript('Manage: Accounts', JSON.stringify({
      mode: 'setPrefix',
      __ID: accountId,
      TrackingPrefix: prefix
    }));
  }

  setPrefixResult(data) {
    let parsed = data;
    if (typeof parsed === 'string') {
      try { parsed = JSON.parse(parsed); } catch (err) { parsed = null; }
    }
    if (!parsed || !parsed.__ID) return;

    const id = String(parsed.__ID);
    const pending = this.prefixPending || {};
    const previous = pending[id];
    delete pending[id];

    const account = this.accounts.find((a) => String(a.__ID) === id);
    const current = (this.currentAccounts || []).find((a) => String(a.__ID) === id);

    if (parsed.ok) {
      const saved = parsed.TrackingPrefix || '';
      if (account) account.TrackingPrefix = saved;
      if (current) current.TrackingPrefix = saved;
      this.showToast(saved ? 'Tracking prefix saved: ' + saved : 'Tracking prefix cleared.', 'ok');
    } else {
      if (previous !== undefined) {
        if (account) account.TrackingPrefix = previous;
        if (current) current.TrackingPrefix = previous;
      }
      this.showToast(parsed.errors || 'The tracking prefix was not saved.', 'error');
    }

    const { input } = this.prefixElements(id);
    if (input) {
      input.classList.remove('saving');
      if (input.readOnly && account) input.value = account.TrackingPrefix || '';
    }
  }

  updateAccountStatus(accountId, newStatus) {
    console.log('updateAccountStatus called with:', accountId, newStatus);
    
    // Find and update the account in all arrays
    const accountIndex = this.accounts.findIndex(acc => acc.__ID.toString() === accountId);
    const currentAccountIndex = this.currentAccounts.findIndex(acc => acc.__ID.toString() === accountId);
    console.log('Found account at index:', accountIndex);
    
    if (accountIndex !== -1 && currentAccountIndex !== -1) {
      const oldStatus = this.accounts[accountIndex].fActive;
      this.accounts[accountIndex].fActive = newStatus;
      this.currentAccounts[currentAccountIndex].fActive = newStatus;
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
    
    // Find the account in all arrays
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
      
      // Remove from all arrays (optimistic update)
      const accountIndex = this.accounts.findIndex(acc => acc.__ID.toString() === accountId);
      if (accountIndex !== -1) {
        this.accounts.splice(accountIndex, 1);
      }
      
      const currentAccountIndex = this.currentAccounts.findIndex(acc => acc.__ID.toString() === accountId);
      if (currentAccountIndex !== -1) {
        this.currentAccounts.splice(currentAccountIndex, 1);
        console.log('Removed account from local arrays');
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
    const accounts = this.currentAccounts || [];
    const total = accounts.length;
    const active = accounts.filter(account => account.fActive === 1).length;
    
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
    this.isAddingAccount = false; // Reset flag when modal is closed
    this.resetManualForm();
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
    // Portal names come straight out of webhook JSON, so they can contain & < > "
    const payload = this.escapeHtml(JSON.stringify(portal));

    return `
      <div class="portal-item" data-portal='${payload}'>
        <div class="portal-info">
          <div class="portal-name">${this.escapeHtml(portal.portal)}</div>
          <div class="portal-number">${this.escapeHtml(portalNumber)}</div>
        </div>
        <button class="add-portal-btn" data-portal='${payload}'>
          Add Account
        </button>
      </div>
    `;
  }

  attachPortalEventListeners() {
    // Remove any existing event listeners first
    const existingButtons = this.portalList.querySelectorAll('.add-portal-btn');
    existingButtons.forEach(button => {
      button.removeEventListener('click', this.handlePortalAdd);
    });
    
    // Use event delegation instead of individual button listeners
    this.portalList.removeEventListener('click', this.handlePortalListClick);
    
    this.handlePortalListClick = (e) => {
      if (e.target.classList.contains('add-portal-btn')) {
        e.preventDefault();
        e.stopPropagation();
        
        if (this.isAddingAccount) {
          console.log('Already adding an account, ignoring duplicate click');
          return;
        }
        
        const portalData = JSON.parse(e.target.getAttribute('data-portal').replace(/&apos;/g, "'"));
        this.addPortalAsAccount(portalData);
      }
    };
    
    this.portalList.addEventListener('click', this.handlePortalListClick);
  }

  addPortalAsAccount(portalData) {
    if (this.isAddingAccount) {
      console.log('Already adding an account, preventing duplicate');
      return;
    }
    
    console.log('Adding portal as account:', portalData);
    this.isAddingAccount = true;

    // Prepare data for FileMaker script, including current account type
    const scriptParameter = {
      ...portalData,
      mode: 'addAccount',
      Type: this.currentAccountType
    };

    console.log('Calling FileMaker script with parameter:', scriptParameter);

    // Call FileMaker script
    this.callFileMakerScript('Manage: Accounts', JSON.stringify(scriptParameter));

    // Hide the modal
    this.hideAddAccountModal();

    // Reset the flag after a short delay
    setTimeout(() => {
      this.isAddingAccount = false;
    }, 1000);

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
  refreshData(accountsData, portalsData = null, selectedType = null) {
    this.setAccountData(accountsData, portalsData, selectedType);
  }

  getAccountData() {
    return {
      accounts: this.accounts,
      individualAccounts: this.individualAccounts,
      groupAccounts: this.groupAccounts,
      currentAccounts: this.currentAccounts,
      filteredAccounts: this.filteredAccounts,
      currentAccountType: this.currentAccountType,
      stats: {
        total: this.currentAccounts.length,
        active: this.currentAccounts.filter(acc => acc.fActive === 1).length,
        totalIndividual: this.individualAccounts.length,
        totalGroup: this.groupAccounts.length
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

  // =========================================================================
  // Shared helpers
  // =========================================================================

  escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  showToast(message, kind) {
    if (!this.toastEl) return;
    this.toastEl.textContent = message;
    this.toastEl.className = 'toast' + (kind ? ' toast-' + kind : '');
    this.toastEl.hidden = false;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toastEl.hidden = true;
    }, kind === 'error' ? 8000 : 4000);
  }

  formatMoney(value) {
    if (value === null || value === undefined || value === '') return '';
    const n = Number(value);
    if (isNaN(n)) return '';
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  formatStamp(value) {
    if (!value) return '';
    const d = new Date(String(value).replace(' ', 'T'));
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleString('en-US', {
      month: 'numeric', day: 'numeric', year: '2-digit',
      hour: 'numeric', minute: '2-digit'
    });
  }

  // "Stage Right (PrintSmith Account #13048)" -> "Stage Right"
  // The parenthetical is not always last — plenty of live portals read
  // "... (PrintSmith Account #8791) (ACTIVE)" — so this is deliberately not
  // anchored to the end. Any trailing "(ACTIVE)" is KEPT: portals that differ
  // only by that suffix are genuinely different portals on the same account,
  // and collapsing them would make two rows look identical.
  shortPortal(portal) {
    if (!portal) return '';
    return String(portal).replace(/\s*\(PrintSmith Account\s*#\d+\s*\)/i, ' ').replace(/\s+/g, ' ').trim()
      || String(portal);
  }

  // =========================================================================
  // Manual account entry
  // =========================================================================

  attachManualAddEventListeners() {
    if (!this.manualAddBtn) return;

    this.manualNumber.addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/[^0-9]/g, '');
      this.updateManualPreview();
    });

    this.manualName.addEventListener('input', () => this.updateManualPreview());

    this.manualAddBtn.addEventListener('click', () => this.submitManualAccount());

    if (this.manualPrefix) {
      this.manualPrefix.addEventListener('input', () => { this.manualError.hidden = true; });
    }

    [this.manualNumber, this.manualName, this.manualPrefix].filter(Boolean).forEach((el) => {
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.submitManualAccount();
        }
      });
    });
  }

  composeAccountName(name, number) {
    const trimmed = (name || '').trim();
    if (!trimmed || !number) return trimmed;
    if (trimmed.indexOf('#' + number) !== -1) return trimmed;
    return trimmed + ' (PrintSmith Account #' + number + ')';
  }

  updateManualPreview() {
    const number = (this.manualNumber.value || '').trim();
    const name = (this.manualName.value || '').trim();

    this.manualError.hidden = true;

    if (!number || !name) {
      this.manualPreview.hidden = true;
      return;
    }

    this.manualPreview.innerHTML =
      'Saves as <strong>' + this.escapeHtml(this.composeAccountName(name, number)) + '</strong>';
    this.manualPreview.hidden = false;
  }

  manualErrorMessage(text) {
    this.manualError.textContent = text;
    this.manualError.hidden = false;
    this.manualPreview.hidden = true;
  }

  submitManualAccount() {
    if (this.isAddingAccount) return;

    const number = (this.manualNumber.value || '').trim();
    const name = (this.manualName.value || '').trim();

    if (!number) return this.manualErrorMessage('Enter the PrintSmith account number.');
    if (!name) return this.manualErrorMessage('Enter the account name.');

    const clash = this.accounts.find(
      (a) => a.AccountNumber !== null &&
             a.AccountNumber !== undefined &&
             String(a.AccountNumber).trim() === number
    );
    if (clash) {
      return this.manualErrorMessage(
        'Account #' + number + ' already exists as "' + clash.Name + '" (' + clash.Type + ').'
      );
    }

    const prefix = this.normalizePrefix(this.manualPrefix ? this.manualPrefix.value : '');
    const prefixClashes = this.prefixClashes(prefix, null);
    if (prefixClashes.length) return this.manualErrorMessage(prefixClashes.join('. ') + '.');

    const type = (['Log', 'Prices', 'Report', 'Locations'].indexOf(this.currentAccountType) >= 0) ? this.lastAccountType : this.currentAccountType;
    const composed = this.composeAccountName(name, number);

    this.isAddingAccount = true;

    this.callFileMakerScript('Manage: Accounts', JSON.stringify({
      mode: 'addManual',
      AccountNumber: number,
      Name: name,
      TrackingPrefix: prefix,
      Type: type
    }));

    this.hideAddAccountModal();
    this.showToast('Adding ' + composed + '...');

    setTimeout(() => { this.isAddingAccount = false; }, 1500);
  }

  resetManualForm() {
    if (!this.manualNumber) return;
    this.manualNumber.value = '';
    this.manualName.value = '';
    if (this.manualPrefix) this.manualPrefix.value = '';
    this.manualPreview.hidden = true;
    this.manualError.hidden = true;
  }

  // =========================================================================
  // Log tab
  // =========================================================================

  attachLogEventListeners() {
    if (!this.logBody) return;

    this.logSearchInput.addEventListener('input', (e) => {
      this.logFilters.search = e.target.value.trim();
      clearTimeout(this.logSearchTimer);
      this.logSearchTimer = setTimeout(() => this.requestLogPage(0), 400);
    });

    this.logSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        clearTimeout(this.logSearchTimer);
        this.logFilters.search = e.target.value.trim();
        this.requestLogPage(0);
      }
    });

    this.logStatusSelect.addEventListener('change', (e) => {
      this.logFilters.status = e.target.value;
      this.requestLogPage(0);
    });

    this.logAccountSelect.addEventListener('change', (e) => {
      this.logFilters.account = e.target.value;
      this.requestLogPage(0);
    });

    this.logRefreshBtn.addEventListener('click', () => this.requestLogPage(0));

    this.logClearBtn.addEventListener('click', () => {
      this.logSearchInput.value = '';
      this.logStatusSelect.value = 'all';
      this.logAccountSelect.value = 'all';
      this.logFilters = { search: '', status: 'all', account: 'all' };
      this.requestLogPage(0);
    });

    this.logMoreBtn.addEventListener('click', () => this.requestLogPage(this.logRows.length));

    // one delegated handler for re-run buttons and row expansion
    this.logBody.addEventListener('click', (e) => {
      const rerun = e.target.closest('.rerun-btn');
      if (rerun) {
        e.stopPropagation();
        this.rerunLogRow(rerun.getAttribute('data-id'));
        return;
      }
      const row = e.target.closest('.log-row');
      if (row) this.toggleLogDetail(row.getAttribute('data-id'));
    });
  }

  requestLogPage(skip) {
    if (this.logBusy) {
      console.log('Log request already in flight, ignoring');
      return;
    }
    this.logBusy = true;
    this.logMoreBtn.disabled = true;

    if (skip === 0) {
      this.logExpanded.clear();
      this.renderLogMessage('Loading...', true);
    } else {
      this.logNote.textContent = 'Loading more...';
    }

    this.callFileMakerScript('Manage: Accounts', JSON.stringify({
      mode: 'logLoad',
      top: this.logPageSize,
      skip: skip,
      search: this.logFilters.search,
      status: this.logFilters.status,
      account: this.logFilters.account
    }));
  }

  setLogData(resultData, metaData) {
    this.logBusy = false;
    this.logLoaded = true;
    this.logMoreBtn.disabled = false;

    let parsed = resultData;
    let meta = metaData;

    if (typeof parsed === 'string') {
      try {
        parsed = JSON.parse(parsed);
      } catch (err) {
        console.error('Failed to parse log JSON:', err);
        this.renderLogMessage('The server did not return readable data. Check the OData query.');
        return;
      }
    }
    if (typeof meta === 'string') {
      try { meta = JSON.parse(meta); } catch (err) { meta = {}; }
    }
    meta = meta || {};

    // ExecuteSQL failures don't come back shaped like an OData error, so the
    // script reports them in meta.sqlError. Without this a failed query looks
    // identical to "no rows matched", which is the worst possible lie.
    if (meta.sqlError) {
      console.error('Log query failed:', meta.sqlError);
      this.renderLogMessage(meta.sqlError);
      return;
    }

    if (parsed && parsed.error) {
      const msg = (parsed.error.message) || 'The server returned an error.';
      console.error('Log query error:', parsed.error);
      this.renderLogMessage(msg);
      return;
    }

    const rows = Array.isArray(parsed) ? parsed : (parsed && parsed.value) || [];
    const total = parsed && parsed['@odata.count'];

    if (Number(meta.skip) > 0) {
      const seen = new Set(this.logRows.map((r) => String(r.idText)));
      rows.forEach((r) => {
        if (!seen.has(String(r.idText))) this.logRows.push(r);
      });
    } else {
      this.logRows = rows;
    }

    this.logTotal = (total === undefined || total === null) ? this.logRows.length : Number(total);
    this.renderLog();
  }

  renderLogMessage(message, muted) {
    this.logBody.innerHTML =
      '<tr class="log-empty-row"><td colspan="8"><div class="empty-state' +
      (muted ? ' empty-state-muted' : '') + '"><h3>' + this.escapeHtml(message) + '</h3></div></td></tr>';
    this.logMoreBtn.hidden = true;
    this.logNote.textContent = '';
    this.logShown.textContent = '0';
    this.logTotalEl.textContent = '0';
  }

  isOnActiveAccount(row) {
    const number = (row.number === null || row.number === undefined) ? '' : String(row.number).trim();
    const portal = (row.portal || '').trim().toLowerCase();

    return this.accounts.some((account) => {
      if (account.fActive !== 1) return false;
      const accountNumber = (account.AccountNumber === null || account.AccountNumber === undefined)
        ? '' : String(account.AccountNumber).trim();
      if (number && accountNumber && number === accountNumber) return true;
      return portal !== '' && (account.Name || '').trim().toLowerCase() === portal;
    });
  }

  statusClass(status) {
    const s = (status || '').toLowerCase();
    if (s === '') return 'st-none';
    if (s === 'new') return 'st-new';
    if (s === 'sent') return 'st-sent';
    if (s === 'error') return 'st-error';
    if (s === 'timed out') return 'st-warn';
    if (s === 'manual') return 'st-manual';
    if (s === 'no active account') return 'st-warn';
    if (s.indexOf('skipped') === 0) return 'st-skip';
    return 'st-other';
  }

  renderLog() {
    if (!this.logRows.length) {
      this.renderLogMessage('No log entries match these filters.', true);
      return;
    }

    const html = this.logRows.map((row) => this.createLogRowHTML(row)).join('');
    this.logBody.innerHTML = html;

    this.logShown.textContent = String(this.logRows.length);
    this.logTotalEl.textContent = String(this.logTotal);

    const more = this.logTotal > this.logRows.length;
    this.logMoreBtn.hidden = !more;
    this.logMoreBtn.textContent = 'Load ' + Math.min(this.logPageSize, this.logTotal - this.logRows.length) + ' more';
    this.logNote.textContent = more ? '' : 'End of the list.';
  }

  createLogRowHTML(row) {
    const id = this.escapeHtml(row.idText);
    const active = this.isOnActiveAccount(row);
    const status = row.status || '';
    const expanded = this.logExpanded.has(String(row.idText));

    const accountCell =
      '<div class="acct-name" title="' + this.escapeHtml(row.portal || '') + '">' +
        this.escapeHtml(this.shortPortal(row.portal) || '(no portal)') + '</div>' +
      '<div class="acct-sub">' +
        (row.number ? '#' + this.escapeHtml(row.number) + ' ' : '') +
        '<span class="pill ' + (active ? 'pill-on' : 'pill-off') + '">' +
          (active ? 'Active account' : 'No active account') +
        '</span>' +
      '</div>';

    const customerCell =
      '<div title="' + this.escapeHtml(row.customerName || '') + '">' +
        this.escapeHtml(row.customerName || '') + '</div>' +
      (row.customerEmail
        ? '<div class="muted" title="' + this.escapeHtml(row.customerEmail) + '">' +
            this.escapeHtml(row.customerEmail) + '</div>'
        : '');

    const main =
      '<tr class="log-row' + (expanded ? ' is-open' : '') + '" data-id="' + id + '">' +
        '<td class="col-date">' + this.escapeHtml(this.formatStamp(row.zzCreatedTimestamp)) + '</td>' +
        '<td class="col-order"><span class="order-no" title="' + this.escapeHtml(row.orderNumber || '') + '">' +
          this.escapeHtml(row.orderNumber || '—') + '</span></td>' +
        '<td class="col-account">' + accountCell + '</td>' +
        '<td class="col-customer">' + customerCell + '</td>' +
        '<td class="col-num">' + this.escapeHtml(row.itemCount || '') + '</td>' +
        '<td class="col-num">' + this.escapeHtml(this.formatMoney(row.orderAmount)) + '</td>' +
        '<td class="col-status"><span class="status-pill ' + this.statusClass(status) + '">' +
          this.escapeHtml(status || 'cleared') + '</span></td>' +
        '<td class="col-action">' +
          '<button class="rerun-btn" data-id="' + id + '" title="Send this order to PrintSmith again">Re-run</button>' +
        '</td>' +
      '</tr>';

    if (!expanded) return main;

    const titles = (row.itemTitles || '').split(/\r\n|\r|\n/).filter(Boolean);
    const detail =
      '<tr class="log-detail"><td colspan="8">' +
        '<div class="detail-grid">' +
          '<div><span class="detail-label">Portal</span>' + this.escapeHtml(row.portal || '—') + '</div>' +
          '<div><span class="detail-label">Order date</span>' + this.escapeHtml(this.formatStamp(row.orderDate)) + '</div>' +
          '<div><span class="detail-label">Routed as</span>' + this.escapeHtml(row.type || '—') + '</div>' +
          '<div><span class="detail-label">Record</span><code>' + id + '</code></div>' +
        '</div>' +
        (titles.length
          ? '<div class="detail-items"><span class="detail-label">Items</span><ul>' +
              titles.map((t) => '<li>' + this.escapeHtml(t) + '</li>').join('') +
            '</ul></div>'
          : '') +
      '</td></tr>';

    return main + detail;
  }

  toggleLogDetail(id) {
    const key = String(id);
    if (this.logExpanded.has(key)) this.logExpanded.delete(key);
    else this.logExpanded.add(key);
    this.renderLog();
  }

  rerunLogRow(id) {
    const row = this.logRows.find((r) => String(r.idText) === String(id));
    if (!row) {
      console.warn('Re-run requested for unknown row', id);
      return;
    }

    const label = [
      row.orderNumber ? 'Order ' + row.orderNumber : '(no order number)',
      row.portal || '(no portal)',
      row.customerName || ''
    ].filter(Boolean).join('\n');

    this.callFileMakerScript('Manage: Accounts', JSON.stringify({
      mode: 'rerun',
      idText: String(row.idText),
      label: label,
      status: row.status || ''
    }));
  }

  setRerunResult(data) {
    let parsed = data;
    if (typeof parsed === 'string') {
      try { parsed = JSON.parse(parsed); } catch (err) { parsed = null; }
    }
    if (!parsed || !parsed.idText) return;

    const row = this.logRows.find((r) => String(r.idText) === String(parsed.idText));
    if (row) row.status = parsed.status || '';

    this.renderLog();

    const status = (parsed.status || '').toLowerCase();
    if (status === 'sent') this.showToast('Re-run complete — sent to PrintSmith.', 'ok');
    else if (status === 'error') this.showToast('Re-run failed. The record holds the API response.', 'error');
    else this.showToast('Re-run finished with status: ' + (parsed.status || '(none)'), 'error');
  }
}

// Initialize the account list manager
const accountManager = new AccountListManager();

// Export functions to window for FileMaker to access (using underscore notation)
window.setAccountData = (accountsData, portalsData = null, selectedType = null) => {
  console.log('window.setAccountData called');
  accountManager.setAccountData(accountsData, portalsData, selectedType);
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

// --- Log tab: called by "Manage: Accounts" ---
window.setLogData = (resultData, metaData) => {
  console.log('window.setLogData called');
  accountManager.setLogData(resultData, metaData);
};

window.setReportData = (rowsData, metaData) => {
  accountManager.report.setData(rowsData, metaData);
};

window.setReportResult = (data) => {
  accountManager.report.setResult(data);
};

window.setPriceData = (rowsData, metaData) => {
  accountManager.prices.setData(rowsData, metaData);
};

window.setPriceResult = (data) => {
  accountManager.prices.setResult(data);
};

window.setLocationData = (locationsData, ordersData, metaData) => {
  accountManager.locations.setData(locationsData, ordersData, metaData);
};

window.setLocationResult = (data) => {
  accountManager.locations.setResult(data);
};

window.setPrefixResult = (data) => {
  console.log('window.setPrefixResult called');
  accountManager.setPrefixResult(data);
};

window.setRerunResult = (data) => {
  console.log('window.setRerunResult called');
  accountManager.setRerunResult(data);
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
  setData: (accountsData, portalsData = null, selectedType = null) => window.setAccountData(accountsData, portalsData, selectedType),
  getData: window.getAccountData,
  clearSearch: window.clearAccountSearch,
  setFilter: window.setAccountFilter,
  getFilteredAccounts: window.getFilteredAccounts,
  setCallback: window.setFileMakerCallback
};

// Also expose the manager instance for advanced usage
window.AccountManager = accountManager;

console.log('Account List Interface loaded and ready for FileMaker integration');
