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
    <title>Brilliant Forecast Portfolios</title>
    <link rel="icon" type="image/x-icon" href="/favicon.ico">
    <link rel="manifest" href="/manifest.json">
    <meta name="theme-color" content="#ffffff">
    <style>${STYLES}</style>
</head>
<body class="desktop-hidden">
    <div id="mobileOverlay" onclick="toggleSidebar()"></div> 
    <nav id="sidebar">
        <h2>
            <span onclick="toggleSidebar()" class="btn-mobile-toggle" style="display:inline-block; font-size:1rem; margin-right:10px; color:#555;">&#9776;</span>
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
                                <th onclick="window.sortPortfolios('type')" style="cursor:pointer; text-align:center;">Type <span id="sort-p-type"></span></th>
                                <th onclick="window.sortPortfolios('member_count')" style="cursor:pointer;">Holdings <span id="sort-p-member_count"></span></th>
                                <th onclick="window.sortPortfolios('change_1d')" style="cursor:pointer;" title="1-Day Change">% 1D <span id="sort-p-change_1d"></span></th>
                                <th onclick="window.sortPortfolios('cagr')" style="cursor:pointer;" title="Annualized Return">CAGR <span id="sort-p-cagr"></span></th>
                                <th onclick="window.sortPortfolios('std_dev')" style="cursor:pointer;" title="Annualized Volatility">Std Dev <span id="sort-p-std_dev"></span></th>
                                <th onclick="window.sortPortfolios('max_drawdown')" style="cursor:pointer;">Max DD <span id="sort-p-max_drawdown"></span></th>
                                <th onclick="window.sortPortfolios('sharpe')" style="cursor:pointer;">Sharpe <span id="sort-p-sharpe"></span></th>
                                <th onclick="window.sortPortfolios('sortino')" style="cursor:pointer;">Sortino <span id="sort-p-sortino"></span></th>
                                <th onclick="window.sortPortfolios('dr')" style="cursor:pointer;" title="Diversification Ratio (Higher is Better)">DR <span id="sort-p-dr"></span></th>
                                <th onclick="window.sortPortfolios('last_score')" style="cursor:pointer;" title="Weekly Portfolio Score">Score <span id="sort-p-last_score"></span></th>
                                <th onclick="window.sortPortfolios('created_at')" style="cursor:pointer;">Created <span id="sort-p-created_at"></span></th>
                            </tr>
                        </thead>
                        <tbody id="portfoliosBody"></tbody>
                    </table>

                </div>
            </div>

            <div id="view-dashboard" style="display: none;">
                    <!-- Portfolio Title Bar -->
                    <div id="portfolioTitleBar" style="display:flex; justify-content:space-between; align-items:flex-start; padding:15px 0; margin-bottom:10px; border-bottom:1px solid #eee; margin-left: auto; margin-right: auto; width: 100%; max-width: 1400px;">
                        <div style="display:flex; flex-direction:column; gap:4px; flex-grow: 1;">
                            <div style="display:flex; align-items:center; flex-wrap:wrap; gap:10px;">
                                <h2 id="portfolioTitle" style="margin:0; color:#333; font-size:1.3rem; display:inline-flex; align-items:center;"></h2>
                                <span id="portfolioCreatedDate" style="font-size:0.8rem; color:#888; background:#F5F5F5; padding:2px 8px; border-radius:4px; font-weight:500; display:inline-block; margin-top:2px;"></span>
                            </div>
                            <div id="portfolioMemo" style="font-size:0.85rem; color:#666; text-align:left; margin-top: 4px;"></div>
                        </div>
                        <button id="btnEditPortfolio" onclick="toggleManager()" style="padding:4px 12px; border:1px solid #2196F3; background:white; color:#2196F3; border-radius:4px; cursor:pointer; font-size:0.8rem; margin-left:15px; flex-shrink: 0;">&#9998; Edit</button>
                    </div>

                    <!-- Portfolio Performance & Trend Chart Section (Compact Mobile Optimized) -->
                    <div id="portfolioPerformanceSection" style="margin-left: auto; margin-right: auto; width: 100%; max-width: 1400px; margin-bottom: 12px;">
                        
                        <!-- Top Toolbar: Period Buttons (Always Outside & Visible) & Expand Chart Toggle -->
                        <div class="perf-control-bar">
                            <div class="perf-period-buttons">
                                <button class="perf-period-btn" id="btnPeriodCreated" onclick="changePerfPeriod('created')">Created Date</button>
                                <button class="perf-period-btn" id="btnPeriod2025" onclick="changePerfPeriod('2025')">2025~Present</button>
                                <button class="perf-period-btn active" id="btnPeriod1Y" onclick="changePerfPeriod('1y')">1Y</button>
                                <button class="perf-period-btn" id="btnPeriodAll" onclick="changePerfPeriod('all')">All</button>
                            </div>
                            <button id="btnTogglePerfChart" class="btn-toggle-chart" onclick="togglePerfChart()">📈 View Chart ▼</button>
                        </div>

                        <!-- Compact Return & Risk Statistics (Plain Text, Highly Space-Efficient) -->
                        <div class="perf-stats-text-bar" id="perfStatsTextBar">
                            <div class="perf-stat-item">
                                <span class="perf-stat-label">Total:</span>
                                <span class="perf-stat-val" id="statTotalReturn">-</span>
                                <span class="perf-stat-sub" id="statBenchReturn">(QQQ: -)</span>
                            </div>
                            <div class="perf-stat-item">
                                <span class="perf-stat-label">CAGR:</span>
                                <span class="perf-stat-val" id="statAnnualizedReturn">-</span>
                            </div>
                            <div class="perf-stat-item">
                                <span class="perf-stat-label">Vol:</span>
                                <span class="perf-stat-val" id="statVolatility">-</span>
                            </div>
                            <div class="perf-stat-item">
                                <span class="perf-stat-label">MaxDD:</span>
                                <span class="perf-stat-val val-neg" id="statMaxDD">-</span>
                                <span class="perf-stat-sub" id="statMaxDDPeriod"></span>
                            </div>
                            <div class="perf-stat-item">
                                <span class="perf-stat-label">Sharpe:</span>
                                <span class="perf-stat-val" id="statSharpe">-</span>
                            </div>
                            <div class="perf-stat-item">
                                <span class="perf-stat-label">Calmar:</span>
                                <span class="perf-stat-val" id="statCalmar">-</span>
                            </div>
                            <div class="perf-stat-item">
                                <span class="perf-stat-label">Sortino:</span>
                                <span class="perf-stat-val" id="statSortino">-</span>
                            </div>
                            <div class="perf-stat-item">
                                <span class="perf-stat-label">Win/Beta:</span>
                                <span class="perf-stat-val" id="statWinRate">-</span>
                                <span class="perf-stat-sub" id="statBeta"></span>
                            </div>
                        </div>

                        <!-- Collapsible Performance Chart Container (Toggled via Button) -->
                        <div class="perf-chart-card" id="perfChartContainer" style="display:none;">
                            <div class="perf-chart-header">
                                <div style="display:flex; align-items:center; gap: 10px; flex-wrap: wrap;">
                                    <span style="font-weight: 700; font-size: 0.88rem; color: #1e293b;">Cumulative Returns & Drawdowns (vs QQQ)</span>
                                    <div class="perf-legend">
                                        <span class="legend-item"><span class="legend-dot" style="background:#8b5cf6;"></span> Portfolio</span>
                                        <span class="legend-item"><span class="legend-dot" style="background:#64748b;"></span> Benchmark (QQQ)</span>
                                        <span class="legend-item"><span class="legend-diamond" style="background:#3b82f6;"></span> Peak</span>
                                        <span class="legend-item"><span class="legend-diamond" style="background:#ef4444;"></span> Valley</span>
                                        <span class="legend-item"><span class="legend-dash"></span> Created Date</span>
                                    </div>
                                </div>
                            </div>

                            <div id="perfChartWrapper" style="position:relative; width:100%; min-height:360px;">
                                <canvas id="perfCanvas" style="width:100%; height:360px; display:block; cursor:crosshair;"></canvas>
                                <div id="perfChartTooltip" class="perf-tooltip" style="display:none;"></div>
                                <div id="perfChartLoading" class="perf-chart-loading" style="display:none;">
                                    <div class="spinner" style="width:28px; height:28px;"></div>
                                    <div style="font-size:0.85rem; color:#64748b; margin-top:8px;">Calculating performance...</div>
                                </div>
                            </div>
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
                        
                        <div style="margin-bottom:20px; display:flex; gap:15px;">
                             <div style="flex:1;">
                                 <label style="display:block; font-weight:600; color:#444; margin-bottom:8px;">Portfolio Type</label>
                                 <select id="editGroupType" class="input-field" style="width:100%; box-sizing:border-box;" onchange="checkDirty()">
                                     <option value="">Personal</option>
                                     <option value="SuperInvestor">SuperInvestor</option>
                                     <option value="ETF">ETF</option>
                                     <option value="MutualFund">Mutual Fund</option>
                                     <option value="Index">Index</option>
                                     <option value="X">X</option>
                                 </select>
                             </div>
                             <div style="flex:2;">
                                 <label style="display:block; font-weight:600; color:#444; margin-bottom:8px;">Reference URL</label>
                                 <input type="text" id="editGroupRef" class="input-field" placeholder="https://..." oninput="checkDirty()" style="width:100%; box-sizing:border-box;">
                             </div>
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
                <label style="cursor: pointer; display: flex; align-items: center; gap: 6px;">
                    <input type="radio" name="createMode" value="x" onchange="toggleCreateMode()"> Import from X
                </label>
            </div>

            <div id="modeBlank">
                 <input type="text" id="newGroupName" class="input-field" placeholder="Portfolio Name">
            </div>

            <div id="modeImport" style="display:none;">
                 <div style="margin-bottom: 12px;">
                     <label style="display:block; font-weight:600; color:#444; margin-bottom:5px;">Search Manager (Local & SEC EDGAR)</label>
                     <div style="display: flex; gap: 8px;">
                         <input type="text" id="investorSearchInput" class="input-field" placeholder="Type manager name (e.g. Aschenbrenner, Situational, Druckenmiller)..." oninput="handleManagerSearch()" onkeydown="if(event.key==='Enter'){event.preventDefault();handleManagerSearch(true);}" style="flex: 1; margin: 0; padding: 9px 12px;">
                         <button type="button" onclick="handleManagerSearch(true)" style="padding: 8px 14px; background: #2563eb; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.85rem; font-weight: 500; white-space: nowrap;">Search SEC</button>
                     </div>
                     <div id="searchStatus" style="font-size: 0.8rem; color: #64748b; margin-top: 4px; display: none;"></div>
                 </div>
                 <div style="margin-bottom: 15px;">
                     <label style="display:block; font-weight:600; color:#444; margin-bottom:5px;">Select Manager</label>
                     <select id="investorSelect" class="input-field" onfocus="if(!managersLoaded) loadManagers()" onclick="if(!managersLoaded) loadManagers()" style="width: 100%; margin-bottom: 0; padding: 10px;">
                         <option value="">Select Manager...</option>
                     </select>
                 </div>
                 <div style="margin-bottom: 15px;">
                     <label style="display:block; font-weight:600; color:#444; margin-bottom:5px;">Max Stocks to Import</label>
                     <input type="number" id="importLimit" class="input-field" value="10" min="1" max="500" style="width: 100px;">
                 </div>
                 <div style="font-size: 0.85rem; color: #666; margin-bottom: 10px;">
                     This will create a new portfolio with the top holdings from the selected manager.
                 </div>
            </div>

            <div id="modeX" style="display:none;">
                 <div style="margin-bottom: 15px;">
                     <label style="display:block; font-weight:600; color:#444; margin-bottom:5px;">X Post URL</label>
                     <input type="text" id="xUrl" class="input-field" placeholder="https://x.com/username/status/..." style="width: 100%;">
                 </div>
                 <div style="font-size: 0.85rem; color: #666; margin-bottom: 10px;">
                     This will create a new portfolio from the stocks mentioned in the post.
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

    <!-- Floating Action Button -->
    <div id="fabBtn" class="fab-btn" onclick="toggleChat()">
        <svg  xmlns="http://www.w3.org/2000/svg"  width="24"  height="24"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M18 4a3 3 0 0 1 3 3v8a3 3 0 0 1 -3 3h-5l-5 3v-3h-2a3 3 0 0 1 -3 -3v-8a3 3 0 0 1 3 -3h12z" /><path d="M9.5 9h.01" /><path d="M14.5 9h.01" /><path d="M9.5 13a3.5 3.5 0 0 0 5 0" /></svg>
    </div>

    <!-- Chat Interface -->
    <div id="chatContainer" class="chat-container" style="display: none;">
        <div class="chat-header">
            <div class="header-title">
                Investment AI Expert
                <div class="header-subtitle">
                    <span class="status-dot"></span>
                    <span id="chatContext">None</span>
                </div>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
                <select id="modelSelector" style="padding:4px 8px; border-radius:4px; border:1px solid #ddd; font-size:0.8rem; background:white;">
                    <option value="gemma-4-26b-a4b-it" selected>Gemma-4-26B (Cloudflare)</option>
                    <option value="nemotron-3-super-120b-a12b">Nemotron-3 Super 120B</option>
                </select>
                <button id="langToggleBtn" class="translate-toggle-btn" onclick="toggleChatLanguage()" title="当前语言：中文 (点击切换为 English)" style="padding:3px 8px; border-radius:4px; border:1px solid #CBD5E1; font-size:0.75rem; background:white; cursor:pointer; display:inline-flex; align-items:center; gap:3px; height:28px; transition:all 0.2s;">
                    <span id="langLabelZh" style="color:#2563EB; font-weight:700;">中</span>
                    <span style="color:#CBD5E1; font-size:0.7rem;">/</span>
                    <span id="langLabelEn" style="color:#94A3B8; font-weight:500;">EN</span>
                </button>
                <button onclick="toggleMaximize()" style="background:none; border:none; cursor:pointer;" title="Maximize">
                    <svg id="maxIcon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    </svg>
                    <svg id="restoreIcon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:none;">
                       <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
                    </svg>
                </button>
                <button onclick="toggleChat()" style="background:none; border:none; cursor:pointer;">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
        </div>
        
        <div id="chatMessages" class="chat-messages">
            <div class="message bot">
                您好！我是您的投资组合与个股分析专家。您可以向我咨询估值指标、技术趋势或组合配置。<br><br>
                输入 <b>/p</b> 可选择投资组合，或输入 <b>@</b> 分析具体股票。
            </div>
        </div>

        <div id="slashMenu" class="slash-menu" style="display: none;">
            <div class="slash-header">PORTFOLIOS (/p)</div>
            <div id="slashList"></div>
        </div>

        <div class="input-area">
            <div class="chips-row">
                <div class="chip" onclick="setContextQuestion('✨ 分析当前组合')">✨ 综合分析</div>
                <div class="chip" onclick="setContextQuestion('📈 分析技术趋势')">📈 技术趋势</div>
                <div class="chip" onclick="setContextQuestion('💰 估值与PEG评估')">💰 估值评估</div>
            </div>
            <div class="input-wrapper">
                <input type="text" id="chatInput" class="chat-input" placeholder="提问、@提及股票 或 输入 / 命令..." onkeydown="handleChatInput(event)" oninput="handleInputTrigger(event)">
                <button class="send-btn" onclick="sendChat()">
                    <svg  xmlns="http://www.w3.org/2000/svg"  width="20"  height="20"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M10 14l11 -11" /><path d="M21 3l-6.5 18a.55 .55 0 0 1 -1 0l-3.5 -7l-7 -3.5a.55 .55 0 0 1 0 -1l18 -6.5" /></svg>
                </button>
            </div>
        </div>
    </div>

    <script>${CLIENT_JS}</script>
    <script>${SCRIPTS}</script>
    <script>
      if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
          navigator.serviceWorker.register('/sw.js');
        });
      }
    </script>
</body>
</html>`;

