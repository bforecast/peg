import { STYLES } from './styles';
import { SCRIPTS } from './scripts';
import { CLIENT_JS } from './client_build';

export const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
    <meta http-equiv="Pragma" content="no-cache">
    <meta http-equiv="Expires" content="0">
    <title>AI Earnings Beats (v2.20)</title>
    <style>${STYLES}</style>
</head>
<body class="desktop-hidden">
    <div id="mobileOverlay" onclick="toggleSidebar()"></div> 
    <nav id="sidebar">
        <h2>
            <span onclick="toggleSidebar()" class="btn-mobile-toggle" style="display:inline-block; font-size:1rem; margin-right:10px; color:#555;">&#9776;</span>
            Brilliant Forecast
        </h2>

        <ul id="groupList" class="group-list">
            <!-- Populated by JS -->
        </ul>
        <button class="btn-new-group" onclick="openModal()">+ New Portfolio</button>
    </nav>
    <div id="main-content">
        <header>
            <div style="display:flex; align-items:center; gap: 12px;">
                <button class="btn-mobile-toggle" onclick="toggleSidebar()">&#9776;</button>
                <div style="display:flex; flex-direction:column; justify-content:center;">
                    <div style="display:flex; align-items:center; gap: 10px;">
                        <h1 id="pageTitle" onclick="goHome()" style="margin:0; line-height: 1.2; cursor:pointer;" title="Return to Home">Brilliant Forecast Portfolios</h1>
                    </div>
                    <div id="dashboardMemo" style="font-size: 0.85rem; color: #666; margin-top: 2px;"></div>
                </div>
            </div>
            <div id="headerActions" style="display:flex; align-items:center; gap: 12px;">
                <span id="healthBadge" class="health-badge" title="System Check Pending"></span>
                <span id="lastUpdated" style="font-size: 0.75rem; color: #888; font-style: italic;"></span>
                <button onclick="openSettings()" style="padding: 6px 10px; border: 1px solid #DDD; background: white; color: #555; border-radius: 4px; cursor: pointer; font-size: 1.2rem; line-height: 1; transition: all 0.2s;" title="System Settings">&#9881;</button>
            </div>
        </header>

        <div class="view-container">
            <!-- Portfolios Board (Recap) -->
            <div id="view-portfolios" style="display: flex;">
                <div class="dashboard-container portfolios-scroll-container">
                    <table class="portfolio-table" id="portfoliosTable">
                        <thead>
                            <tr>
                                <th class="sticky-col">Portfolio Name</th>
                                <th onclick="window.sortPortfolios('member_count')" style="cursor:pointer;">Holdings <span id="sort-p-member_count"></span></th>
                                <th onclick="window.sortPortfolios('cagr')" style="cursor:pointer;" title="Annualized Return">CAGR <span id="sort-p-cagr"></span></th>
                                <th onclick="window.sortPortfolios('std_dev')" style="cursor:pointer;" title="Annualized Volatility">Std Dev <span id="sort-p-std_dev"></span></th>
                                <th onclick="window.sortPortfolios('max_drawdown')" style="cursor:pointer;">Max DD <span id="sort-p-max_drawdown"></span></th>
                                <th onclick="window.sortPortfolios('sharpe')" style="cursor:pointer;">Sharpe <span id="sort-p-sharpe"></span></th>
                                <th onclick="window.sortPortfolios('sortino')" style="cursor:pointer;">Sortino <span id="sort-p-sortino"></span></th>
                                <th onclick="window.sortPortfolios('correlation_spy')" style="cursor:pointer;" title="Correlation vs SPY">Corr. SPY <span id="sort-p-correlation_spy"></span></th>
                                <th>Created</th>
                            </tr>
                        </thead>
                        <tbody id="portfoliosBody"></tbody>
                    </table>

                </div>
            </div>

            <div id="view-dashboard" style="display: none;">
                    <!-- Portfolio Title Bar -->
                    <div id="portfolioTitleBar" style="display:flex; justify-content:space-between; align-items:flex-start; padding:15px 0; margin-bottom:10px; border-bottom:1px solid #eee; margin-left: auto; margin-right: auto; width: 100%; max-width: 1400px;">
                        <div style="display:flex; flex-direction:column; gap:4px;">
                            <div style="display:flex; align-items:center; gap:15px;">
                                <h2 id="portfolioTitle" style="margin:0; color:#333; font-size:1.3rem;"></h2>
                                <button id="btnEditPortfolio" onclick="toggleManager()" style="padding:4px 12px; border:1px solid #2196F3; background:white; color:#2196F3; border-radius:4px; cursor:pointer; font-size:0.8rem;">&#9998; Edit</button>
                            </div>
                            <div id="portfolioMemo" style="font-size:0.85rem; color:#666; text-align:left;"></div>
                        </div>
                    </div>
                <div class="dashboard-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Ticker</th><th style="cursor:pointer; text-align: center;" onclick="sortData('allocation')">% Portfolio <span id="sort-allocation"></span></th><th>Price</th>
                                <th class="sortable" onclick="sortData('yield')">% FWD <span id="sort-yield"></span></th>
                                <th class="sortable" onclick="sortData('ps')">P/S <span id="sort-ps"></span></th>
                                <th class="sortable" onclick="sortData('pe')">P/E <span id="sort-pe"></span></th>
                                <th class="sortable" onclick="sortData('growth')">% Growth <span id="sort-growth"></span></th>
                                <th class="sortable" onclick="sortData('peg')">PEG <span id="sort-peg"></span></th>
                                <th class="sortable" onclick="sortData('changeYTD')">% YTD <span id="sort-changeYTD"></span></th>
                                <th>Chart 1Y</th>
                                <th class="sortable" onclick="sortData('change1Y')">% 1Y <span id="sort-change1Y"></span></th>
                                <th>Δ 52w High</th><th>RS Rank 1M</th><th class="narrow-col">20SMA</th><th class="narrow-col">50SMA</th><th class="narrow-col">200SMA</th>
                            </tr>
                        </thead>
                        <tbody id="tableBody"></tbody>
                        <tfoot id="tableFoot" style="display:none;">
                            <tr style="background: #F9F9F9; font-weight: bold;">
                                <td colspan="3" style="text-align: right;">W. Avg.</td>
                                <td id="avgYield" style="text-align: center;">-</td>
                                <td id="avgPS">-</td><td id="avgPE">-</td><td id="avgGrowth">-</td><td id="avgPEG">-</td>
                                <td id="avgYTD">-</td><td></td><td id="avg1Y">-</td>
                                <td colspan="5"></td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>

            <div id="view-manager" style="display: none;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; border-bottom: 1px solid #eee; padding-bottom: 15px;">
                    <h2 style="margin:0; font-size:1.4rem;">Edit: <span id="managerPortfolioName" style="color:#2196F3;"></span></h2>
                    <div style="display:flex; gap:10px;">
                        <button onclick="deleteGroup()" style="color: #F44336; background: white; border: 1px solid #F44336; padding: 6px 14px; border-radius: 4px; cursor: pointer; font-size:0.9rem;">Delete</button>
                        <button id="btnCancel" onclick="toggleManager()" style="display:none; color: white; background: #666; border: none; padding: 6px 18px; border-radius: 4px; cursor: pointer; font-weight:500;">Cancel</button>
                        <button id="btnMainAction" onclick="handleMainAction()" style="color: white; background: #999; border: none; padding: 6px 18px; border-radius: 4px; cursor: pointer; font-weight:500;">Done</button>
                    </div>
                </div>
                
                <div class="manager-layout">
                    <!-- Left Column: Settings -->
                    <div>
                        <h3 style="margin-top:0; color:#555; font-size:1.1rem; margin-bottom:15px;">Settings</h3>
                        
                        <div style="margin-bottom:20px;">
                            <label style="display:block; font-weight:600; color:#444; margin-bottom:8px;">Portfolio Name</label>
                            <input type="text" id="editGroupName" class="input-field" placeholder="Portfolio Name" oninput="checkDirty()" style="width:100%; box-sizing:border-box;">
                        </div>

                        <div style="margin-bottom:20px;">
                            <label style="display:block; font-weight:600; color:#444; margin-bottom:8px;">Memo
                                <button onclick="parseMemoSymbols()" style="margin-left:8px; padding:2px 8px; font-size:0.8rem; background:#E3F2FD; color:#2196F3; border:1px solid #2196F3; border-radius:4px; cursor:pointer;" title="Extract symbols from memo (e.g. $AAPL)">$ Extract</button>
                            </label>
                            <textarea id="editGroupMemo" class="input-field" rows="5" placeholder="Add notes here... use $AAPL to tag stocks" style="width:100%; box-sizing:border-box; font-family:inherit; resize:vertical;" oninput="checkDirty()"></textarea>
                        </div>

                            <div style="font-size:0.85rem; color:#888;">
                                Last Modified: <span id="groupModified">-</span>
                            </div>
                    </div>

                    <!-- Right Column: Stocks -->
                    <div>
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <h3 style="margin-top:0; color:#555; font-size:1.1rem; margin-bottom:15px;">Stocks</h3>
                        </div>
                        
                        <div style="display:flex; gap:10px; margin-bottom:20px; align-items:center;">
                            <div class="input-group" style="flex-grow:1;">
                                <input type="text" id="newMemberInput" class="input-field" placeholder="Add Symbol (e.g. MSFT)" onkeydown="if(event.key==='Enter') addMember()">
                                <button class="btn-add" onclick="addMember()">Add</button>
                            </div>
                            <button id="btnDistribute" onclick="distributeAllocation()" style="display:none; height:42px; padding:0 15px; border:1px solid #2196F3; color:#2196F3; background:white; border-radius:4px; cursor:pointer; white-space:nowrap;">Equalize</button>
                        </div>

                        <div id="membersGrid" class="members-grid" style="max-height: 500px; overflow-y: auto;"></div>
                    </div>
                </div>
            </div>
            
            <div id="loading" class="loading-overlay">
                <div class="spinner"></div>
                <div id="loadingText">Loading...</div>
            </div>
        </div>
    </div>

    <div id="toast-container"></div>
    <div id="groupModal" class="modal">
        <div class="modal-content">
            <h3>Create New Portfolio</h3>
            
            <div style="margin-bottom: 20px; display: flex; gap: 15px; font-size: 0.95rem;">
                <label style="cursor: pointer; display: flex; align-items: center; gap: 6px;">
                    <input type="radio" name="createMode" value="blank" checked onchange="toggleCreateMode()"> Blank Portfolio
                </label>
                <label style="cursor: pointer; display: flex; align-items: center; gap: 6px;">
                    <input type="radio" name="createMode" value="import" onchange="toggleCreateMode()"> Import Superinvestor
                </label>
            </div>

            <div id="modeBlank">
                 <input type="text" id="newGroupName" class="input-field" placeholder="Portfolio Name">
            </div>

            <div id="modeImport" style="display:none;">
                 <select id="investorSelect" class="input-field" style="width: 100%; margin-bottom: 15px; padding: 10px;">
                     <option value="">Select Manager...</option>
                 </select>
                 <div style="margin-bottom: 15px;">
                     <label style="display:block; font-weight:600; color:#444; margin-bottom:5px;">Max Stocks to Import</label>
                     <input type="number" id="importLimit" class="input-field" value="10" min="1" max="500" style="width: 100px;">
                 </div>
                 <div style="font-size: 0.85rem; color: #666; margin-bottom: 10px;">
                     This will create a new portfolio with the top holdings from the selected manager.
                 </div>
            </div>

            <div class="modal-footer">
                <button onclick="closeModal()" style="padding: 8px 16px; cursor: pointer;">Cancel</button>
                <button id="btnCreateAction" onclick="handleCreate()" style="padding: 8px 16px; background: #4CAF50; color: white; border: none; cursor: pointer; border-radius: 4px;">Create</button>
            </div>
        </div>
    </div>

    <div id="deleteModal" class="modal">
        <div class="modal-content">
            <h3>Delete Portfolio?</h3>
            <p>Are you sure you want to delete this portfolio? This cannot be undone.</p>
            <div class="modal-footer">
                <button onclick="closeDeleteModal()" style="padding: 8px 16px; cursor: pointer;">Cancel</button>
                <button onclick="confirmDeleteGroup()" style="padding: 8px 16px; background: #F44336; color: white; border: none; cursor: pointer; border-radius: 4px;">Delete</button>
            </div>
        </div>
    </div>

    <div id="settingsModal" class="modal">
        <div class="modal-content" style="width: 320px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; border-bottom:1px solid #eee; padding-bottom:10px;">
                <h3 style="margin:0;">Settings</h3>
                <span onclick="closeSettings()" style="cursor:pointer; font-size:1.5rem; color:#888;">&times;</span>
            </div>
            
            <div style="display:flex; flex-direction:column; gap: 15px;">
                <!-- Frontpage Option 1: Recalculate -->
                <button id="btnRecalcSettings" onclick="recalcPortfolios()" style="padding: 12px; border: 1px solid #9C27B0; background: white; color: #9C27B0; border-radius: 6px; cursor: pointer; font-weight: 600; display:flex; align-items:center; justify-content:center; gap:8px;">
                    <span>&#x2699;</span> Recalculate Metrics (1Y)
                </button>
                
                <!-- Holding Page Option 1: Refresh -->
                <button id="btnRefreshSettings" onclick="refreshCurrentGroup(); closeSettings()" style="padding: 12px; border: 1px solid #2196F3; background: white; color: #2196F3; border-radius: 6px; cursor: pointer; font-weight: 600; display:flex; align-items:center; justify-content:center; gap:8px;">
                     <span>&#x21bb;</span> Refresh Current View
                </button>

                <!-- Common Option 2: Cron Page -->
                <a href="/status" style="text-decoration:none; padding: 12px; border: 1px solid #4CAF50; background: white; color: #4CAF50; border-radius: 6px; cursor: pointer; font-weight: 600; display:flex; align-items:center; justify-content:center; gap:8px;">
                    <span>&#128202;</span> View System Status
                </a>
            </div>
            
            <div style="margin-top: 20px; font-size: 0.8rem; color: #999; text-align: center;">
                Brilliant Forecast System v2.20
            </div>
        </div>
    </div>

    <script>${CLIENT_JS}</script>
    <script>${SCRIPTS}</script>
</body>
</html>`;

