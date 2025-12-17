import { STYLES } from './styles';
import { SCRIPTS } from './scripts';
import { CLIENT_JS } from './client_build';

export const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Earnings Beats</title>
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
        <button class="btn-new-group" onclick="openModal()"><span>+</span> Create New Portfolio</button>
    </div>
    <div id="main-content">
        <header>
            <div style="display:flex; align-items:center; gap: 12px;">
                <button class="btn-mobile-toggle" onclick="toggleSidebar()">&#9776;</button>
                <div style="display:flex; flex-direction:column; justify-content:center;">
                    <div style="display:flex; align-items:center; gap: 10px;">
                        <h1 id="pageTitle" style="margin:0; line-height: 1.2;">AI Earnings Beats <small style="font-size:0.8rem; color:#888;">v1.4.0</small></h1>
                        <button id="btnManage" onclick="toggleManager()" style="display:none; padding: 4px 10px; border: 1px solid #E0E0E0; background: #FAFAFA; border-radius: 4px; cursor: pointer; font-size: 0.8rem; color: #666; transition: all 0.2s;">&#9998; Edit</button>
                    </div>
                    <div id="dashboardMemo" style="font-size: 0.85rem; color: #666; margin-top: 2px;"></div>
                </div>
            </div>
            <div id="headerActions" style="display:flex; align-items:center; gap: 12px;">
                <span id="healthBadge" class="health-badge" title="System Check Pending"></span>
                <span id="lastUpdated" style="font-size: 0.75rem; color: #888; font-style: italic;"></span>
                <button id="btnRefresh" onclick="refreshCurrentGroup()" style="padding: 6px 14px; border: 1px solid #2196F3; background: white; color: #2196F3; border-radius: 4px; cursor: pointer; font-weight: 500; transition: all 0.2s;">&#x21bb; Refresh</button>
            </div>
        </header>

        <div class="view-container">
            <div id="view-dashboard" style="display: flex;">
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
                    <h2 style="margin:0; font-size:1.4rem;">Edit Portfolio</h2>
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

    <script>${CLIENT_JS}</script>
    <script>${SCRIPTS}</script>
</body>
</html>`;

