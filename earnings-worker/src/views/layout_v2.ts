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
    <title>AI Earnings Beats (v2.0)</title>
    <style>${STYLES}</style>
</head>
<body class="desktop-hidden">
    <div id="mobileOverlay" onclick="toggleSidebar()"></div> 
    <div id="sidebar">
        <h2>
            <span onclick="toggleSidebar()" class="btn-mobile-toggle" style="display:inline-block; font-size:1rem; margin-right:10px; color:#555;">&#9776;</span>
            My Portfolios
        </h2>
        <ul class="group-list" id="groupList"></ul>
        
        <div class="sidebar-footer">
            <button onclick="openModal()" class="btn-add">New Portfolio</button>
            <div style="margin-top:10px; font-size:0.8rem; color:#888;">
                <div id="healthBadge" style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#ccc; margin-right:5px;" onclick="checkHealth()"></div>
                System Status
            </div>
        </div>
    </div>

    <!-- Main Content -->
    <div id="main-content">
        <!-- Header -->
        <div class="header" id="mainHeader">
            <div style="display:flex; align-items:center;">
                <span onclick="toggleSidebar()" class="btn-mobile-toggle" style="margin-right:15px; font-size:1.2rem; cursor:pointer;">&#9776;</span>
                <h1 id="pageTitle" onclick="goHome()" style="cursor:pointer;">Brilliant Forecast Portfolios</h1>
            </div>
            <!-- Old btnManage removed from here -->
            <div id="dashboardMemo" style="margin-top:5px; font-size:0.9rem; color:#DDD;"></div>
        </div>

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
                    <div style="margin-top: 20px; text-align: right; position:sticky; bottom:0; left:0; background:white; padding:10px 0;">
                        <button onclick="recalcPortfolios()" style="padding: 6px 12px; font-size: 0.85rem; cursor: pointer;">&#x21bb; Recalculate All Metrics</button>
                    </div>
                </div>
            </div>

            <div id="view-dashboard" style="display: none;">
                <div class="dashboard-container">
                    <!-- Portfolio Title Bar -->
                    <div id="portfolioTitleBar" style="display:flex; justify-content:space-between; align-items:center; padding:15px 0; margin-bottom:10px; border-bottom:1px solid #eee;">
                        <div style="display:flex; align-items:center; gap:15px;">
                            <h2 id="portfolioTitle" style="margin:0; color:#333; font-size:1.3rem;"></h2>
                            <button id="btnEditPortfolio" onclick="toggleManager()" style="padding:4px 12px; border:1px solid #2196F3; background:white; color:#2196F3; border-radius:4px; cursor:pointer; font-size:0.8rem;">&#9998; Edit</button>
                        </div>
                        <div id="portfolioMemo" style="font-size:0.85rem; color:#666; max-width:400px; text-align:right;"></div>
                    </div>
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
                            <label style="display:block; font-weight:600; color:#444; margin-bottom:8px;">Memo</label>
                            <textarea id="editGroupMemo" class="input-field" rows="5" placeholder="Add notes here..." style="width:100%; box-sizing:border-box; font-family:inherit; resize:vertical;" oninput="checkDirty()"></textarea>
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

                        <div style="display:flex; gap:10px; margin-bottom:15px;">
                            <input type="text" id="newMemberInput" class="input-field" placeholder="Enter Symbol (e.g. MSFT)" style="flex:1;" onkeypress="if(event.key==='Enter') addMember()">
                            <button onclick="addMember()" class="btn-primary btn-add" style="padding: 8px 16px;">Add</button>
                        </div>
                        
                        <div id="membersGrid" class="members-grid"></div>

                        <div style="margin-top:15px; text-align:right;">
                            <button id="btnDistribute" onclick="distributeAllocation()" style="padding:5px 10px; font-size:0.8rem; border:1px solid #ccc; background:white; border-radius:4px; cursor:pointer; color:#555; display:none;">Auto Distribute</button>
                        </div>
                    </div>
                </div>
            </div>
            
            <div id="loadingText" style="text-align: center; margin-top: 50px; color: #666;">Loading...</div>
        </div>
    </div>

    <!-- Modals -->
    <div id="groupModal" class="modal">
        <div class="modal-content">
            <h3>New Portfolio</h3>
            
            <div style="margin-bottom: 20px;">
                <label style="display:block; margin-bottom:8px;">Mode:</label>
                <div style="display:flex; gap:20px;">
                     <label><input type="radio" name="createMode" value="blank" checked onchange="toggleCreateMode()"> Empty Portfolio</label>
                     <label><input type="radio" name="createMode" value="import" onchange="toggleCreateMode()"> Import Superinvestor</label>
                </div>
            </div>

            <!-- Blank Mode -->
            <div id="modeBlank">
                <input type="text" id="newGroupName" class="input-field" placeholder="Portfolio Name" style="width:100%; margin-bottom: 15px;">
            </div>

            <!-- Import Mode -->
            <div id="modeImport" style="display:none;">
                <p style="font-size:0.9rem; color:#666; margin-bottom:10px;">Select a guru to copy top holdings from:</p>
                <select id="investorSelect" class="input-field" style="width:100%; margin-bottom: 10px;">
                    <option value="">Loading...</option>
                </select>
                <div style="font-size:0.85rem; color: #888; margin-bottom: 15px;">
                     Limit: <input type="number" id="importLimit" value="10" min="5" max="50" style="width:50px;"> stocks
                </div>
            </div>

            <div style="text-align: right; margin-top: 20px;">
                <button onclick="closeModal()" style="margin-right: 10px; padding: 8px 16px; border: 1px solid #ccc; background: white; border-radius: 4px; cursor:pointer;">Cancel</button>
                <button id="btnCreateAction" onclick="if(document.querySelector('input[name=createMode]:checked').value === 'blank') createGroup(); else importGroup();" class="btn-primary">Create</button>
            </div>
        </div>
    </div>
    
    <div id="deleteModal" class="modal">
        <div class="modal-content" style="max-width: 400px;">
             <h3 style="color:#F44336; margin-top:0;">Delete Portfolio?</h3>
             <p>Are you sure you want to delete this portfolio? This cannot be undone.</p>
             <div style="text-align: right; margin-top: 25px;">
                <button onclick="closeDeleteModal()" style="margin-right: 10px; padding: 8px 16px; border: 1px solid #ccc; background: white; border-radius: 4px; cursor:pointer;">Keep</button>
                <button onclick="confirmDeleteGroup()" style="background:#F44336; color:white; border:none; padding: 8px 20px; border-radius: 4px; cursor:pointer;">Delete</button>
            </div>
        </div>
    </div>

    <!-- Scripts -->
    <script>${CLIENT_JS}</script>
    <script>${SCRIPTS}</script>
</body>
</html>`;
