
import os

path = r"d:\AntigravityProjects\forward_peg_system\earnings-worker\src\dashboard_html.ts"

# Added Debugging to Title and Loading Text
html_content = r"""// Dashboard HTML exported as string
export const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Earnings Beats</title>
    <style>
        :root { --bg-color: #FAFAFA; --text-color: #111; --sidebar-width: 250px; --sidebar-bg: #F8F9FA; --active-item-bg: #E8F5E9; --active-item-text: #2E7D32; --border-color: #DDD; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--bg-color); color: var(--text-color); margin: 0; padding: 0; height: 100vh; display: flex; overflow: hidden; }
        #sidebar { width: var(--sidebar-width); background: var(--sidebar-bg); border-right: 1px solid var(--border-color); display: flex; flex-direction: column; padding: 20px; box-sizing: border-box; flex-shrink: 0; margin-left: 0; }
        #sidebar h2 { font-size: 1.2rem; margin-top: 0; color: #333; margin-bottom: 20px; }
        .group-list { list-style: none; padding: 0; margin: 0; flex-grow: 1; overflow-y: auto; }
        .group-item { padding: 10px 15px; margin-bottom: 5px; border-radius: 6px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; color: #555; transition: background 0.2s; }
        .group-item:hover { background: #EEE; }
        .group-item.active { background: var(--active-item-bg); color: var(--active-item-text); font-weight: 500; }
        .btn-new-group { margin-top: 15px; width: 100%; padding: 10px; background: white; border: 1px dashed #CCC; color: #666; cursor: pointer; border-radius: 6px; display: flex; align-items: center; justify-content: center; gap: 8px; transition: all 0.2s; }
        .btn-new-group:hover { border-color: #4CAF50; color: #4CAF50; background: #F1F8E9; }
        
        #main-content { flex-grow: 1; display: flex; flex-direction: column; overflow: hidden; background: white; }
        header { padding: 15px 25px; border-bottom: 1px solid #EEE; display: flex; justify-content: space-between; align-items: center; background: white; }
        h1 { margin: 0; font-size: 1.5rem; color: #333; letter-spacing: -0.5px; }
        #headerActions { display: flex; align-items: center; gap: 15px; }
        
        .view-container { flex-grow: 1; overflow-y: auto; padding: 20px 25px; position: relative; }
        .dashboard-container { max-width: 1400px; margin: 0 auto; background: white; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); border: 1px solid #EEE; overflow: hidden; }
        
        table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
        th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid #EEE; font-weight: 600; }
        th { background: #F9F9F9; font-weight: 700; color: #555; cursor: pointer; user-select: none; font-size: 11px; white-space: nowrap; }
        th:hover { background: #E0E0E0; }
        th.narrow-col, td.narrow-col { width: 40px; text-align: center; padding: 8px 4px; }
        
        /* Manager View Styles */
        .manager-header { display: flex; gap: 10px; margin-bottom: 20px; }
        .input-group { display: flex; gap: 10px; flex-grow: 1; max-width: 600px; }
        .input-field { padding: 10px; border: 1px solid #DDD; border-radius: 4px; flex-grow: 1; font-size: 1rem; }
        .btn-add { padding: 10px 20px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 500; }
        .members-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 15px; }
        .member-card { background: white; border: 1px solid #EEE; border-radius: 6px; padding: 15px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
        .member-symbol { font-size: 1.2rem; font-weight: bold; font-family: 'Courier New', monospace; }
        .btn-remove { color: #F44336; background: none; border: none; cursor: pointer; font-size: 1.2rem; opacity: 0.6; }
        .btn-remove:hover { opacity: 1; }
        
        /* Modal */
        .modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); align-items: center; justify-content: center; z-index: 1000; }
        .modal.open { display: flex; }
        .modal-content { background: white; padding: 25px; border-radius: 8px; width: 400px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
        .modal-footer { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }
        
        .loading-overlay { position: absolute; top:0; left:0; width:100%; height:100%; background:rgba(255,255,255,0.9); display:flex; flex-direction:column; justify-content:center; align-items:center; z-index:500; }
        .spinner { border: 4px solid #f3f3f3; border-top: 4px solid #333; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin-bottom: 15px; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        
        /* Visualization */
        .delta-bar-container { display: flex; align-items: center; justify-content: flex-end; gap: 5px; }
        .delta-bar { height: 10px; background-color: #FF9800; border-radius: 2px; }
        .delta-bar.red { background-color: #F44336; }
        .ticker-cell { font-weight: bold; display: flex; align-items: center; gap: 4px; }
        /* Transitions */
        #sidebar { transition: margin-left 0.3s ease, left 0.3s ease; }
        
        /* Desktop Sidebar Hiding */
        @media (min-width: 769px) {
            body.desktop-hidden #sidebar { margin-left: -250px; }
            body.desktop-hidden .dashboard-container { max-width: 100%; }
        }

        /* Mobile Responsive */
        @media (max-width: 768px) {
            #sidebar { position: fixed; left: -260px; top: 0; bottom: 0; z-index: 1000; box-shadow: 2px 0 5px rgba(0,0,0,0.2); transform: none; }
            #sidebar.open { left: 0; }
            #main-content { margin-left: 0; width: 100%; }
            #mobileOverlay { display: none; position: fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.3); z-index:900; }
            #mobileOverlay.open { display: block; }
            .btn-mobile-toggle { display: block !important; margin-right: 15px; font-size: 1.5rem; cursor: pointer; color: #333; }
        }
        /* Show toggle button on desktop too but style it */
        .btn-mobile-toggle { display: block; margin-right: 15px; background: none; border: none; font-size: 1.5rem; cursor: pointer; color: #333; }
        @media (min-width: 769px) {
             /* Hide the inner Close button on desktop if we want, or keep it consistent. 
                The inner one is inside h2. Let's hide the inner 'X' on desktop. */
             #sidebar .btn-mobile-toggle { display: none !important; }
        }
    </style>
</head>
<body class="desktop-hidden">
    <div id="mobileOverlay" onclick="toggleSidebar()"></div> 
    <div id="sidebar">
        <h2>
            <span onclick="toggleSidebar()" class="btn-mobile-toggle" style="display:inline-block; font-size:1rem; margin-right:10px; color:#555;">✕</span>
            My Portfolios
        </h2>
        <ul class="group-list" id="groupList"></ul>
        <button class="btn-new-group" onclick="openModal()"><span>+</span> Create New Group</button>
    </div>

    <div id="main-content">
        <header>
            <div style="display:flex; align-items:center;">
                <button class="btn-mobile-toggle" onclick="toggleSidebar()">☰</button>
                <h1 id="pageTitle">AI Earnings Beats</h1>
            </div>
            <div id="headerActions">
                <button id="btnManage" onclick="toggleManager()" style="display:none; padding: 6px 12px; border: 1px solid #CCC; background: white; border-radius: 4px; cursor: pointer;">Manage Group</button>
                <div style="font-size: 0.9rem; color: #666;" id="currentDate"></div>
            </div>
        </header>

        <div class="view-container">
            <div id="view-dashboard" style="display: block;">
                <div class="dashboard-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Ticker</th><th>Company</th><th>Price</th><th>Market Cap</th>
                                <th class="sortable" onclick="sortData('ps')">P/S <span id="sort-ps"></span></th>
                                <th class="sortable" onclick="sortData('pe')">P/E <span id="sort-pe"></span></th>
                                <th class="sortable" onclick="sortData('changeYTD')">% YTD <span id="sort-changeYTD"></span></th>
                                <th>Chart 1Y</th>
                                <th class="sortable" onclick="sortData('change1Y')">% 1Y <span id="sort-change1Y"></span></th>
                                <th>Δ 52w High</th><th>RS Rank 1M</th><th class="narrow-col">20SMA</th><th class="narrow-col">50SMA</th><th class="narrow-col">200SMA</th>
                            </tr>
                        </thead>
                        <tbody id="tableBody"></tbody>
                        <tfoot id="tableFoot" style="display:none;">
                            <tr style="background: #F9F9F9; font-weight: bold;">
                                <td colspan="4" style="text-align: right;">Avg.</td>
                                <td id="avgPS">-</td><td id="avgPE">-</td><td colspan="8"></td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>

            <div id="view-manager" style="display: none;">
                <div class="manager-header">
                    <div class="input-group">
                        <input type="text" id="newMemberInput" class="input-field" placeholder="Enter stock symbol (e.g. NVDA)">
                        <button class="btn-add" onclick="addMember()">+ Add Stock</button>
                    </div>
                    <button onclick="deleteGroup()" style="color: red; background: none; border: 1px solid red; padding: 10px; border-radius: 4px; cursor: pointer;">Delete Group</button>
                </div>
                <h2>Manage Members</h2>
                <div id="membersGrid" class="members-grid"></div>
            </div>
            
            <div id="loading" class="loading-overlay">
                <div class="spinner"></div>
                <div id="loadingText">Loading...</div>
            </div>
        </div>
    </div>

    <div id="groupModal" class="modal">
        <div class="modal-content">
            <h3>Create New Group</h3>
            <input type="text" id="newGroupName" class="input-field" placeholder="Group Name">
            <div class="modal-footer">
                <button onclick="closeModal()" style="padding: 8px 16px; cursor: pointer;">Cancel</button>
                <button onclick="createGroup()" style="padding: 8px 16px; background: #4CAF50; color: white; border: none; cursor: pointer; border-radius: 4px;">Create</button>
            </div>
        </div>
    </div>

    <div id="deleteModal" class="modal">
        <div class="modal-content">
            <h3>Delete Group?</h3>
            <p>Are you sure you want to delete this group? This cannot be undone.</p>
            <div class="modal-footer">
                <button onclick="closeDeleteModal()" style="padding: 8px 16px; cursor: pointer;">Cancel</button>
                <button onclick="confirmDeleteGroup()" style="padding: 8px 16px; background: #F44336; color: white; border: none; cursor: pointer; border-radius: 4px;">Delete</button>
            </div>
        </div>
    </div>

    <script>
        console.log("DASHBOARD SCRIPT STARTED");
        let currentGroup = null; 
        let currentView = 'dashboard';
        let groups = [];
        let dashboardData = []; 
        let currentSort = { key: 'changeYTD', dir: 'desc'};

        window.addEventListener('load', async () => {
            document.getElementById('currentDate').textContent = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric'});
            await fetchGroups();
            // Selection now handled in fetchGroups
        });

        async function fetchGroups() {
            try {
                const res = await fetch('/api/groups?t=' + Date.now());
                if (res.ok) {
                    groups = await res.json();
                    renderSidebar();
                    
                    // Auto-select "AI Earnings Beats" or first group
                    const defaultGroup = groups.find(g => g.name === 'AI Earnings Beats') || groups[0];
                    if (defaultGroup) selectGroup(defaultGroup);
                }
            } catch (e) { console.error('Error fetching groups', e); }
        }

        function renderSidebar() {
            const list = document.getElementById('groupList');
            if(!list) return;
            list.innerHTML = '';
            
            groups.forEach(g => {
                const li = document.createElement('li');
                li.className = 'group-item ' + (currentGroup && currentGroup.id === g.id ? 'active' : '');
                // Icon: Folder
                li.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:8px"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg> ${g.name}`;
                li.onclick = () => selectGroup(g);
                list.appendChild(li);
            });
        }

        async function selectGroup(group) {
            if (!group) return; 
            currentGroup = group;
            document.title = currentGroup.name;
            document.getElementById('pageTitle').textContent = currentGroup.name;
            const btnManage = document.getElementById('btnManage');
            if(currentGroup.id) { btnManage.style.display = 'block'; btnManage.textContent = 'Manage Group'; }
            else { btnManage.style.display = 'none'; }
            
            // Auto-hide sidebar
            if(window.innerWidth <= 768) {
                document.getElementById('sidebar').classList.remove('open');
                document.getElementById('mobileOverlay').classList.remove('open');
            } else {
                document.body.classList.add('desktop-hidden');
            }

            setView('dashboard');
            renderSidebar();
            await loadDashboardData();
        }

        function setView(view) {
            currentView = view;
            document.getElementById('view-dashboard').style.display = view === 'dashboard' ? 'block' : 'none';
            document.getElementById('view-manager').style.display = view === 'manager' ? 'block' : 'none';
            const btnManage = document.getElementById('btnManage');
            if(currentView === 'manager') {
                btnManage.textContent = 'Back to Dashboard';
                loadMembers();
            } else {
                if(currentGroup.id) btnManage.textContent = 'Manage Group';
                if(currentGroup.id) loadDashboardData(); // Reload data when returning to dashboard
            }
        }

        function toggleManager() {
            if (currentView === 'dashboard') setView('manager');
            else setView('dashboard');
        }

        async function loadDashboardData() {
            const loading = document.getElementById('loading');
            loading.style.display = 'flex';
            
            
            try {
                let url = '/api/dashboard-data';
                if (currentGroup && currentGroup.id) {
                    url += `?groupId=${currentGroup.id}`;
                }
                // Cache bust
                url += (url.includes('?') ? '&' : '?') + 't=' + Date.now();

                document.getElementById('loadingText').textContent = 'Loading...';
                const res = await fetch(url);
                const data = await res.json();
                dashboardData = Array.isArray(data) ? data : []; 
                // document.getElementById('pageTitle').textContent += " [" + url + "]"; // DEBUG TITLE REMOVED
                executeSort(currentSort.key);
            } catch (e) {
                console.error('Error loading data', e);
            } finally {
                loading.style.display = 'none';
            }
        }

        function executeSort(key) {
            if(!dashboardData) return;
            dashboardData.sort((a, b) => {
                let va = a[key] ?? -Infinity;
                let vb = b[key] ?? -Infinity;
                if(key === 'pe' || key === 'ps') {
                   // nulls last
                   if(a[key] == null) va = Infinity;
                   if(b[key] == null) vb = Infinity;
                }
                return currentSort.dir === 'asc' ? (va - vb) : (vb - va);
            });
            renderTable(dashboardData);
            updateSortIcons();
        }

        function sortData(key) {
            if (currentSort.key === key) currentSort.dir = currentSort.dir === 'desc' ? 'asc' : 'desc';
            else { currentSort.key = key; currentSort.dir = 'desc'; }
            executeSort(key);
        }

        function updateSortIcons() {
            document.querySelectorAll('thead th span').forEach(sp => sp.textContent = '');
            const arrow = currentSort.dir === 'asc' ? '▲' : '▼';
            const el = document.getElementById('sort-' + currentSort.key);
            if(el) el.textContent = arrow;
        }

        function renderTable(data) {
            const tbody = document.getElementById('tableBody');
            if(!tbody) return;
            let rows = '';
            let totalPE=0, totalPS=0, countPE=0, countPS=0;
            const minPS=0, maxPS=20, minPE=0, maxPE=60, minYTD=0, maxYTD=100, min1Y=0, max1Y=100;
            
            data.forEach(stock => {
                if(stock.pe) { totalPE+=stock.pe; countPE++; }
                if(stock.ps) { totalPS+=stock.ps; countPS++; }
                
                const psStyle = getGradientColor(stock.ps, minPS, maxPS, 255, 200, 100);
                let peStyle = getGradientColor(stock.pe, minPE, maxPE, 255, 200, 100);
                if (!stock.pe && stock.pe !== 0) peStyle = 'background-color: rgb(255, 180, 100); color: black;';
                const ytdStyle = getGradientColor(stock.changeYTD, minYTD, maxYTD, 76, 175, 80);
                const oneYStyle = getGradientColor(stock.change1Y, min1Y, max1Y, 76, 175, 80);
                
                // Visualization
                const deltaHigh = stock.delta52wHigh || 0;
                const deltaWidth = Math.min(Math.abs(deltaHigh) * 2, 80);
                const deltaColor = Math.abs(deltaHigh) > 20 ? 'red' : '';
                
                // Ensure numbers, treat invalid as 0
                const rankHistory = (stock.rsRankHistory || []).map(x => { const n = parseFloat(x); return isNaN(n) ? 0 : n; });
                const maxR = rankHistory.length ? Math.max(...rankHistory) : 0;
                
                const rsBars = rankHistory.map((r,i) => {
                   const h = 20, bw = 2, gap=1;
                   const rh = Math.max((r/100)*h, 4);
                   const x = i*(bw+gap);
                   // Highlight max rank: Deep Green (#006400), others Light Green
                   const col = (r >= maxR && maxR > 0) ? '#006400' : '#A5D6A7';
                   return `<rect x="\${x}" y="\${h-rh}" width="\${bw}" height="\${rh}" style="fill:\${col}"><title>Rank: \${r}</title></rect>`;
                }).join('');
                
                rows += `
                <tr>
                    <td class="ticker-cell">
                        <img src="https://logo.clearbit.com/\${(stock.symbol||'').toLowerCase()}.com" class="ticker-icon" onerror="this.remove()" onload="this.style.display='inline-block'">
                        \${stock.symbol}
                    </td>
                    <td style="font-weight:normal">\${stock.name}</td>
                    <td>$\${(stock.price||0).toFixed(2)}</td>
                    <td>\${formatMarketCap(stock.marketCap)}</td>
                    <td style="\${psStyle}">\${stock.ps ? stock.ps.toFixed(2) : '-'}</td>
                    <td style="\${peStyle}">\${stock.pe ? stock.pe.toFixed(2) : '-'}</td>
                    <td style="\${ytdStyle}">\${(stock.changeYTD||0).toFixed(2)}%</td>
                    <td>\${createSparkline(stock.history)}</td>
                    <td style="\${oneYStyle}">\${(stock.change1Y||0).toFixed(2)}%</td>
                    <td>
                        <div class="delta-bar-container">
                            <div class="delta-bar \${deltaColor}" style="width:\${deltaWidth}px"></div>
                            <div>\${deltaHigh.toFixed(2)}%</div>
                        </div>
                    </td>
                    <td><svg width="70" height="20">\${rsBars}</svg></td>
                    <td class="narrow-col">${stock.sma20 ? '<span style="color:#4CAF50">▲</span>' : '<span style="color:#F44336">▼</span>'}</td>
                    <td class="narrow-col">${stock.sma50 ? '<span style="color:#4CAF50">▲</span>' : '<span style="color:#F44336">▼</span>'}</td>
                    <td class="narrow-col">${stock.sma200 ? '<span style="color:#4CAF50">▲</span>' : '<span style="color:#F44336">▼</span>'}</td>
                </tr>`;
            });
            tbody.innerHTML = rows;
            document.getElementById('tableFoot').style.display = 'table-header-group';
            document.getElementById('avgPS').textContent = countPS ? (totalPS/countPS).toFixed(2) : '-';
            document.getElementById('avgPE').textContent = countPE ? (totalPE/countPE).toFixed(2) : '-';
        }

        // Helpers
        function getGradientColor(v, min, max, r, g, b) {
            if(v==null) return '';
            const ratio = Math.max(0, Math.min(1, (v - min) / (max - min)));
            const nr = Math.round(255 + ratio * (r - 255));
            const ng = Math.round(255 + ratio * (g - 255));
            const nb = Math.round(255 + ratio * (b - 255));
            return `background-color: rgb(\${nr},\${ng},\${nb}); color: black;`;
        }
        function formatMarketCap(n) {
             if(!n) return '-';
             if(n >= 1e12) return (n/1e12).toFixed(2) + 'T';
             if(n >= 1e9) return (n/1e9).toFixed(2) + 'B';
             return (n/1e6).toFixed(2) + 'M';
        }
        function createSparkline(pts) {
            if(!pts || pts.length < 2) return '';
            const min = Math.min(...pts), max = Math.max(...pts);
            const w = 100, h = 30;
            const path = pts.map((p, i) => {
                const x = (i / (pts.length - 1)) * w;
                const y = h - ((p - min) / (max - min)) * h;
                return `\${x},\${y}`;
            }).join(' L'); // Wait, d="M..."
            // Points needs to be string "x,y x,y" for polyline or "Mx,y Lx,y" for path
            // Simplify: <path d="M... L..." />
            const d = pts.map((p,i) => {
                const x = (i / (pts.length - 1)) * w;
                const y = h - ((p - min) / (max - min)) * h;
                return (i===0 ? 'M' : 'L') + `\${x} \${y}`;
            }).join(' ');
            const isDown = pts[pts.length-1] < pts[0];
            return `<svg class="sparkline \${isDown?'down':''}" viewBox="0 0 100 30"><path d="\${d}" stroke="\${isDown?'#F44336':'#4CAF50'}" fill="none" stroke-width="2"/></svg>`;
        }
        
        // Modal / Group Ops
        function toggleSidebar() {
            if(window.innerWidth <= 768) {
                // Mobile behavior
                document.getElementById('sidebar').classList.toggle('open');
                document.getElementById('mobileOverlay').classList.toggle('open');
            } else {
                // Desktop behavior
                document.body.classList.toggle('desktop-hidden');
            }
        }
        function openModal() { document.getElementById('groupModal').classList.add('open'); }
        function closeModal() { document.getElementById('groupModal').classList.remove('open'); }
        function openDeleteModal() { document.getElementById('deleteModal').classList.add('open'); }
        function closeDeleteModal() { document.getElementById('deleteModal').classList.remove('open'); }
        
        async function createGroup() {
            const name = document.getElementById('newGroupName').value;
            if(!name) return;
            try {
                await fetch('/api/groups', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name}) });
                closeModal();
                document.getElementById('newGroupName').value = '';
                await fetchGroups();
            } catch(e) { alert('Error'); }
        }
        async function deleteGroup() {
             if(!currentGroup.id) return;
             openDeleteModal();
        }
        async function confirmDeleteGroup() {
            if(!currentGroup.id) return;
            // Close immediately for better UX
            closeDeleteModal();
            try {
                const idToDelete = currentGroup.id;
                const res = await fetch(`/api/groups/${currentGroup.id}`, { method:'DELETE'});
                
                if(!res.ok) alert('Delete failed ' + res.status);
                else {
                    // Optimistic update
                    groups = groups.filter(g => g.id !== idToDelete);
                    selectGroup(null);
                    renderSidebar();
                    // await fetchGroups(); // Removed to prevent zombie re-add
                }
            } catch(e) { alert('Error: ' + e); }
        }
        
        // Members
        async function loadMembers() {
            if(!currentGroup.id) return;
            const grid = document.getElementById('membersGrid');
            grid.innerHTML = 'Loading...';
            try {
                const res = await fetch(`/api/groups/\${currentGroup.id}/members`);
                const members = await res.json();
                grid.innerHTML = '';
                members.forEach(m => {
                    const el = document.createElement('div');
                    el.className = 'member-card';
                    el.innerHTML = `<div class="member-symbol">\${m.symbol}</div><button class="btn-remove" onclick="removeMember('\${m.symbol}')">×</button>`;
                    grid.appendChild(el);
                });
            } catch(e) { grid.textContent = 'Error'; }
        }
        async function addMember() {
            const inp = document.getElementById('newMemberInput');
            const symbol = inp.value.trim().toUpperCase();
            if(!symbol) return;
            try {
                await fetch(`/api/groups/\${currentGroup.id}/members`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({symbol}) });
                inp.value = '';
                loadMembers();
            } catch(e) { alert('Error'); }
        }
        async function removeMember(symbol) {
             try {
                await fetch(`/api/groups/\${currentGroup.id}/members/\${symbol}`, { method: 'DELETE' });
                loadMembers();
            } catch(e) { alert('Error'); }
        }
    </script>
</body>
</html>`;
"""

with open(path, 'w', encoding='utf-8') as f:
    f.write(html_content)

print("Restored dashboard_html.ts with DEBUGGING enabled.")
