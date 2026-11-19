import sys
root=sys.argv[1]
def rep(path, pairs):
    p=root+'/'+path; s=open(p).read()
    for old,new in pairs:
        assert s.count(old)==1, (path, old[:50], s.count(old))
        s=s.replace(old,new)
    open(p,'w').write(s)

rep('index.html', [
("""            <button class="tab-button" id="pricesTab" data-type="Prices">
              FCB Prices
            </button>""",
 """            <button class="tab-button" id="pricesTab" data-type="Prices">
              FCB Prices
            </button>
            <button class="tab-button" id="reportTab" data-type="Report">
              FCB Report
            </button>"""),
("""        <div class="stats" id="priceStats" hidden>""",
 """        <div class="stats" id="reportStats" hidden>
          <span class="stat-item">Orders: <span id="reportCount">0</span></span>
        </div>
        <div class="stats" id="priceStats" hidden>"""),
("""    </div>

    <!-- Add FCB price modal -->""",
 """
      <!-- ================= FCB REPORT ================= -->
      <section id="reportPanel" hidden>
        <p class="panel-intro">
          The monthly detail and promo code workbook for First Commonwealth. Marketing contribution comes
          from the FCB Prices tab, so fix any missing prices before you generate.
        </p>
        <div class="controls">
          <select id="reportMonth"></select>
          <button id="reportLoadBtn" class="clear-filters-btn">Load</button>
          <label class="rpt-credit">Credit (prepaid inventory)
            <input type="text" id="reportCredit" inputmode="decimal" placeholder="optional" autocomplete="off" />
          </label>
          <button id="reportGenerateBtn" class="add-account-btn" disabled>Generate .xlsx</button>
          <span class="rpt-status" id="reportStatus"></span>
        </div>

        <div class="rpt-cards" id="reportCards"></div>
        <div id="reportWarnings"></div>

        <div class="log-wrap">
          <table class="log-table price-table">
            <thead>
              <tr>
                <th class="col-date">Ordered</th>
                <th>Tracking number</th>
                <th class="col-price">Subtotal</th>
                <th>Promo code</th>
                <th class="col-price">Marketing</th>
                <th class="col-desc">Items</th>
              </tr>
            </thead>
            <tbody id="reportBody">
              <tr class="log-empty-row">
                <td colspan="6"><div class="empty-state empty-state-muted"><h3>Nothing loaded yet</h3></div></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <!-- Add FCB price modal -->"""),
])

rep('src/index.js', [
("import { PriceManager } from './prices.js';",
 "import { PriceManager } from './prices.js';\nimport { ReportManager } from './report.js';"),
("""    this.prices = new PriceManager(this);""",
 """    this.prices = new PriceManager(this);
    this.report = new ReportManager(this);"""),
("""    this.pricesTab = document.getElementById('pricesTab');""",
 """    this.pricesTab = document.getElementById('pricesTab');
    this.reportTab = document.getElementById('reportTab');
    this.reportPanel = document.getElementById('reportPanel');
    this.reportStats = document.getElementById('reportStats');"""),
("""    this.pricesTab.addEventListener('click', () => {
      this.switchToAccountType('Prices');
    });""",
 """    this.pricesTab.addEventListener('click', () => {
      this.switchToAccountType('Prices');
    });

    this.reportTab.addEventListener('click', () => {
      this.switchToAccountType('Report');
    });"""),
("""    if (this.currentAccountType !== 'Log' && this.currentAccountType !== 'Prices') {""",
 """    if (['Log', 'Prices', 'Report'].indexOf(this.currentAccountType) < 0) {"""),
("""    if (type === 'Prices') {
      this.showPanel('prices');
      this.prices.onShow();
      return;
    }""",
 """    if (type === 'Prices') {
      this.showPanel('prices');
      this.prices.onShow();
      return;
    }

    if (type === 'Report') {
      this.showPanel('report');
      this.report.onShow();
      return;
    }"""),
("""  showPanel(which) {
    const isLog = which === 'log';
    const isPrices = which === 'prices';
    const isAccounts = !isLog && !isPrices;
    this.accountsPanel.hidden = !isAccounts;
    this.logPanel.hidden = !isLog;
    this.pricesPanel.hidden = !isPrices;
    this.accountStats.hidden = !isAccounts;
    this.logStats.hidden = !isLog;
    this.priceStats.hidden = !isPrices;
  }""",
 """  showPanel(which) {
    const isLog = which === 'log';
    const isPrices = which === 'prices';
    const isReport = which === 'report';
    const isAccounts = !isLog && !isPrices && !isReport;
    this.accountsPanel.hidden = !isAccounts;
    this.logPanel.hidden = !isLog;
    this.pricesPanel.hidden = !isPrices;
    this.reportPanel.hidden = !isReport;
    this.accountStats.hidden = !isAccounts;
    this.logStats.hidden = !isLog;
    this.priceStats.hidden = !isPrices;
    this.reportStats.hidden = !isReport;
  }"""),
("""      Prices: this.pricesTab
    };""",
 """      Prices: this.pricesTab,
      Report: this.reportTab
    };"""),
("""const modes = { Individual: 'individual-mode', Group: 'group-mode', Log: 'log-mode', Prices: 'prices-mode' };""",
 """const modes = { Individual: 'individual-mode', Group: 'group-mode', Log: 'log-mode', Prices: 'prices-mode', Report: 'report-mode' };"""),
("""    const type = (this.currentAccountType === 'Log' || this.currentAccountType === 'Prices') ? this.lastAccountType : this.currentAccountType;""",
 """    const type = (['Log', 'Prices', 'Report'].indexOf(this.currentAccountType) >= 0) ? this.lastAccountType : this.currentAccountType;"""),
("""window.setPriceData = (rowsData, metaData) => {""",
 """window.setReportData = (rowsData, metaData) => {
  accountManager.report.setData(rowsData, metaData);
};

window.setReportResult = (data) => {
  accountManager.report.setResult(data);
};

window.setPriceData = (rowsData, metaData) => {"""),
])

css = '''
/* =========================================================================
   FCB Report tab
   ========================================================================= */

.container.report-mode {
  background: linear-gradient(to bottom, #ffffff 0%, #f6f8fd 100%);
  border-left: 4px solid #2c3e80;
}

.container.report-mode .tab-button.active {
  background: linear-gradient(135deg, #2c3e80, #23325f);
  box-shadow: 0 2px 8px rgba(44, 62, 128, 0.3);
}

.container.report-mode .tab-button.active:hover,
.container.report-mode .add-account-btn:hover {
  background: linear-gradient(135deg, #23325f, #1b2749);
  box-shadow: 0 4px 12px rgba(44, 62, 128, 0.3);
}

.container.report-mode .add-account-btn {
  background: linear-gradient(135deg, #2c3e80, #23325f);
}

#reportPanel.is-busy .log-wrap,
#reportPanel.is-busy .rpt-cards {
  opacity: 0.55;
  pointer-events: none;
}

#reportMonth,
#reportCredit {
  padding: 12px 16px;
  border: 2px solid #ddd;
  border-radius: 8px;
  font-size: 1rem;
  background-color: white;
}

#reportMonth { cursor: pointer; }
#reportCredit { width: 120px; text-align: right; }

#reportMonth:focus,
#reportCredit:focus { outline: none; border-color: #2c3e80; }

.rpt-credit {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.82rem;
  font-weight: 600;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: #7f8c8d;
}

.rpt-status {
  font-size: 0.85rem;
  color: #7f8c8d;
}

.rpt-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
  margin-bottom: 20px;
}

.rpt-card {
  border: 1px solid #e6e6e6;
  border-radius: 10px;
  padding: 14px 16px;
  background-color: #fbfcfe;
}

.rpt-card-value {
  display: block;
  font-size: 1.35rem;
  font-weight: 600;
  color: #2c3e50;
  font-variant-numeric: tabular-nums;
}

.rpt-card-label {
  display: block;
  font-size: 0.74rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #95a5a6;
  margin-top: 2px;
}

.rpt-card-warn { background-color: #fdf6f5; border-color: #f0d3cf; }
.rpt-card-warn .rpt-card-value { color: #c0392b; }
.rpt-card-ok   { background-color: #f4fbf8; border-color: #cfe9e0; }

.rpt-warn {
  border: 1px solid #f0d3cf;
  background-color: #fdf6f5;
  border-radius: 10px;
  padding: 14px 18px;
  margin-bottom: 16px;
}

.rpt-warn h4 {
  margin: 0 0 4px;
  font-size: 0.95rem;
  color: #a93226;
}

.rpt-warn p {
  margin: 0 0 8px;
  font-size: 0.85rem;
  color: #7f8c8d;
}

.rpt-sku-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 18px;
  margin: 0;
  padding-left: 18px;
  font-size: 0.85rem;
  color: #566573;
}

.rpt-gaps code,
.rpt-sku-list code {
  font-size: 0.8rem;
  background-color: rgba(0, 0, 0, 0.04);
  padding: 1px 5px;
  border-radius: 4px;
}

.rpt-gaps { line-height: 2; }

#reportPanel .price-table thead th:nth-child(1) { width: 130px; }
#reportPanel .price-table thead th:nth-child(2) { width: 170px; }
#reportPanel .price-table thead th:nth-child(3) { width: 90px; }
#reportPanel .price-table thead th:nth-child(4) { width: 130px; }
#reportPanel .price-table thead th:nth-child(5) { width: 110px; }
#reportPanel .price-table thead th:nth-child(6) { width: auto; }
'''
p=root+'/src/style.css'; s=open(p).read()
marker='/* =========================================================================\n   Toast'
assert s.count(marker)==1
open(p,'w').write(s.replace(marker, css.lstrip('\n')+'\n'+marker))
print('wired')
