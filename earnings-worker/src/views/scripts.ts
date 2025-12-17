export const SCRIPTS = `
        console.log("DASHBOARD SCRIPT STARTED");

        let currentGroup = null; 
        let currentView = 'dashboard';
        let groups = [];
        let dashboardData = []; 
        let currentSort = { key: 'changeYTD', dir: 'desc'};
        // Batch Saving State
        let localMembers = [];
        let originalState = {};

        window.addEventListener('load', async () => {
            checkHealth();
            // Updated Date logic removed as per user request
            await fetchGroups();
            
            // Auto-select "AI Earnings Beats" or first group
            const defaultGroup = groups.find(g => g.name === 'AI Earnings Beats') || groups[0];
            if (defaultGroup) selectGroup(defaultGroup);
        });

        async function checkHealth() {
             const badge = document.getElementById('healthBadge');
             if(!badge) return;
             try {
                 const res = await fetch('/api/health?t=' + Date.now()); // Cache bust
                 if(res.ok) {
                     badge.classList.add('ok');
                     badge.title = 'System Healthy';
                 } else {
                     badge.classList.add('error');
                     badge.title = 'System Error';
                 }
             } catch(e) {
                 badge.classList.add('error');
                 badge.title = 'Connection Error';
             }
        }

        async function fetchGroups() {
            try {
                const res = await fetch('/api/groups?t=' + Date.now());
                if (res.ok) {
                    groups = await res.json();
                    renderSidebar();
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
                li.innerHTML = \`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:8px"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg> \${g.name}\`;
                li.onclick = () => selectGroup(g);
                list.appendChild(li);
            });
        }

        async function selectGroup(group) {
            if (!group) return; 
            currentGroup = group;
            document.title = currentGroup.name;
            document.getElementById('pageTitle').textContent = currentGroup.name;
            // Update Memo
            const memoEl = document.getElementById('dashboardMemo');
            if(memoEl) memoEl.textContent = currentGroup.description || '';

            const btnManage = document.getElementById('btnManage');
            if(currentGroup.id) { btnManage.style.display = 'block'; btnManage.textContent = 'Edit'; }
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
            document.getElementById('view-dashboard').style.display = view === 'dashboard' ? 'flex' : 'none';
            document.getElementById('view-manager').style.display = view === 'manager' ? 'block' : 'none';
            const btnManage = document.getElementById('btnManage');
            document.getElementById('btnRefresh').style.display = view === 'manager' ? 'none' : 'inline-block';
            btnManage.style.display = view === 'manager' ? 'none' : 'inline-block';
            if(currentView === 'manager') {
                // btnManage.textContent = 'Back to Dashboard'; // Removed as button is hidden
                loadMembers();
                // Load group details into inputs
                if(currentGroup) {
                    document.getElementById('editGroupName').value = currentGroup.name || '';
                    document.getElementById('editGroupMemo').value = currentGroup.description || '';
                    const updated = currentGroup.updated_at || currentGroup.created_at;
                    document.getElementById('groupModified').textContent = updated ? new Date(updated).toLocaleString() : 'N/A';
                }
            } else {
                if(currentGroup.id) btnManage.textContent = 'Edit';
                // if(currentGroup.id) loadDashboardData(); // optimize: don't reload if just toggling view? actually safer to reload.
                if(currentGroup.id) loadDashboardData();
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
                    url += \`?groupId=\${currentGroup.id}\`;
                }
                // Cache bust
                url += (url.includes('?') ? '&' : '?') + 't=' + Date.now();

                document.getElementById('loadingText').textContent = 'Loading...';
                const res = await fetch(url);
                const response = await res.json();
                
                // Handle new format: { lastUpdated, data } or old format (array)
                if (response && response.data && Array.isArray(response.data)) {
                    dashboardData = response.data;
                    // Display lastUpdated
                    const lastUpdatedEl = document.getElementById('lastUpdated');
                    if (lastUpdatedEl && response.lastUpdated) {
                        // The server sends the time as a raw EST string (YYYY-MM-DD HH:MM:SS)
                        // We can display it directly, or format it. Since it's already EST, we don't need timezone conversion.
                        // Let's just prettify the string slightly: 2025-12-16 18:01:06 -> Dec 16, 18:01 EST
                        try {
                           const parts = response.lastUpdated.split(' '); // [YYYY-MM-DD, HH:MM:SS]
                           const d = new Date(parts[0] + 'T' + parts[1]); // Parse as local/iso (zoneless)
                           // Check if valid
                           if(!isNaN(d.getTime())) {
                               const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                               const timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
                               lastUpdatedEl.textContent = \`Updated: \${dateStr}, \${timeStr} EST\`;
                           } else {
                               lastUpdatedEl.textContent = 'Updated: ' + response.lastUpdated + ' EST';
                           }
                        } catch(e) {
                             lastUpdatedEl.textContent = 'Updated: ' + response.lastUpdated;
                        }
                    }
                } else if (Array.isArray(response)) {
                    // Fallback for old format
                    dashboardData = response;
                } else {
                    dashboardData = [];
                }
                
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
                if(key === 'pe' || key === 'ps' || key === 'peg') {
                   // nulls last
                   if(a[key] == null) va = Infinity;
                   if(b[key] == null) vb = Infinity;
                }
                if(key === 'yield') {
                    // special handler for yield
                    va = a.dividendYield ?? -Infinity;
                    vb = b.dividendYield ?? -Infinity;
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
            const arrow = currentSort.dir === 'asc' ? '\\u25B2' : '\\u25BC';
            const el = document.getElementById('sort-' + currentSort.key);
            if(el) el.textContent = arrow;
        }

        function renderTable(data) {
            const tbody = document.getElementById('tableBody');
            if(!tbody) return;
            let rows = '';
            
            // Weighted Average Headers
            let wTotalPE=0, wTotalGrowth=0, wTotalPS=0, wTotalPEG=0, wTotalYTD=0, wTotal1Y=0, wTotalYield=0;
            let totalAllocPE=0, totalAllocGrowth=0, totalAllocPS=0, totalAllocPEG=0, totalAllocYTD=0, totalAlloc1Y=0, totalAllocYield=0;

            const minPS=0, maxPS=20, minPE=0, maxPE=60, minYTD=0, maxYTD=100, min1Y=0, max1Y=100;
            
            data.forEach(stock => {
                const alloc = parseFloat(stock.allocation) || 0; // Allocation percentage (0-100)
                
                // Calculate Growth
                const epsC = parseFloat(stock.quote?.epsCurrentYear) || 0;
                const epsN = parseFloat(stock.quote?.epsNextYear) || 0;
                let growth = 0;
                if(epsC !== 0) growth = ((epsN - epsC) / Math.abs(epsC)) * 100;
                stock.growth = growth;

                if(stock.pe && alloc > 0) { wTotalPE += stock.pe * alloc; totalAllocPE += alloc; }
                if(Math.abs(growth) < 1000 && alloc > 0) { wTotalGrowth += growth * alloc; totalAllocGrowth += alloc; }
                if(stock.ps && alloc > 0) { wTotalPS += stock.ps * alloc; totalAllocPS += alloc; }
                if(stock.peg && alloc > 0) { wTotalPEG += stock.peg * alloc; totalAllocPEG += alloc; }
                if(stock.changeYTD != null && alloc > 0) { wTotalYTD += stock.changeYTD * alloc; totalAllocYTD += alloc; }
                if(stock.change1Y != null && alloc > 0) { wTotal1Y += stock.change1Y * alloc; totalAlloc1Y += alloc; }
                if(stock.dividendYield != null && alloc > 0) { wTotalYield += stock.dividendYield * alloc; totalAllocYield += alloc; }
                
                const psStyle = getGradientColor(stock.ps, minPS, maxPS, 255, 200, 100);
                // Color by meaning: Green > 0, Red < 0 (Background)
                let growthStyle = ''; 
                if (stock.growth > 0) growthStyle = 'background-color: #C8E6C9; color: black;'; // Light Green
                if (stock.growth < 0) growthStyle = 'background-color: #FFCDD2; color: black;'; // Light Red

                let peStyle = getGradientColor(stock.pe, minPE, maxPE, 255, 200, 100);
                if (!stock.pe && stock.pe !== 0) peStyle = 'background-color: rgb(255, 180, 100); color: black;';
                const pegStyle = getGradientColor(stock.peg, 0, 3, 255, 100, 100);
                const ytdStyle = getGradientColor(stock.changeYTD, minYTD, maxYTD, 76, 175, 80);
                const oneYStyle = getGradientColor(stock.change1Y, min1Y, max1Y, 76, 175, 80);
                // Yield Style: 0% (White) -> 5% (Green)
                const yieldPct = stock.dividendYield ? stock.dividendYield * 100 : 0;
                const yieldStyle = getGradientColor(yieldPct, 0, 5, 76, 175, 80);
                
                const deltaHigh = stock.delta52wHigh || 0;
                const deltaWidth = Math.min(Math.abs(deltaHigh) * 1.5, 50);
                const deltaColor = Math.abs(deltaHigh) > 20 ? 'red' : '';
                
                const rankHistory = (stock.rsRankHistory || []).map(x => { const n = parseFloat(x); return isNaN(n) ? 0 : n; });
                const maxR = rankHistory.length ? Math.max(...rankHistory) : 0;
                
                const rsBars = rankHistory.map((r,i) => {
                   const h = 20, bw = 2, gap=1;
                   const rh = Math.max((r/100)*h, 4);
                   const x = i*(bw+gap);
                   const col = (r >= maxR && maxR > 0) ? '#006400' : '#A5D6A7';
                   return '<rect x="' + x + '" y="' + (h-rh) + '" width="' + bw + '" height="' + rh + '" style="fill:' + col + '"></rect>';
                }).join('');

            rows += [
                '<tr>',
                '<td class="ticker-cell">',
                    '<span>' + stock.symbol + '</span>',
                '</td>',
                '<td style="text-align: center;" title="' + stock.name + '">' + parseFloat(stock.allocation || 0).toFixed(2) + '%</td>',
                '<td>$' + (stock.price || 0).toFixed(2) + '</td>',
                '<td style="' + yieldStyle + '">' + (stock.dividendYield ? (stock.dividendYield * 100).toFixed(2) + '%' : '-') + '</td>',
                '<td style="' + psStyle + '">' + (stock.ps ? stock.ps.toFixed(2) : '-') + '</td>',
                '<td style="' + peStyle + '">' + (stock.pe ? stock.pe.toFixed(2) : '-') + '</td>',
                '<td style="' + growthStyle + '">' + (stock.growth ? stock.growth.toFixed(1) + '%' : '-') + '</td>',
                '<td style="' + pegStyle + '">' + (stock.peg ? stock.peg.toFixed(2) : '-') + '</td>',
                '<td style="' + ytdStyle + '">' + (stock.changeYTD || 0).toFixed(0) + '%</td>',
                '<td>' + createSparkline(stock.history) + '</td>',
                '<td style="' + oneYStyle + '">' + (stock.change1Y || 0).toFixed(0) + '%</td>',
                '<td>',
                    '<div class="delta-bar-container">',
                        '<div>' + (deltaHigh >= 0 ? '&#9650;' : '&#9660;') + Math.abs(deltaHigh).toFixed(1) + '%</div>',
                    '</div>',
                '</td>',
                '<td><svg width="70" height="20">' + rsBars + '</svg></td>',
                '<td class="narrow-col">' + (stock.sma20 ? '<span style="color:#4CAF50">▲</span>' : '<span style="color:#F44336">▼</span>') + '</td>',
                '<td class="narrow-col">' + (stock.sma50 ? '<span style="color:#4CAF50">▲</span>' : '<span style="color:#F44336">▼</span>') + '</td>',
                '<td class="narrow-col">' + (stock.sma200 ? '<span style="color:#4CAF50">▲</span>' : '<span style="color:#F44336">▼</span>') + '</td>',
                '</tr>'
            ].join('');
            });
            tbody.innerHTML = rows;
            document.getElementById('tableFoot').style.display = 'table-header-group';
            
            document.getElementById('avgYield').textContent = totalAllocYield > 0 ? (wTotalYield * 100 / totalAllocYield).toFixed(2) + '%' : '-';
            document.getElementById('avgPS').textContent = totalAllocPS > 0 ? (wTotalPS / totalAllocPS).toFixed(2) : '-';
            document.getElementById('avgPE').textContent = totalAllocPE > 0 ? (wTotalPE / totalAllocPE).toFixed(2) : '-';
            document.getElementById('avgGrowth').textContent = totalAllocGrowth > 0 ? (wTotalGrowth / totalAllocGrowth).toFixed(1) + '%' : '-';
            document.getElementById('avgPEG').textContent = totalAllocPEG > 0 ? (wTotalPEG / totalAllocPEG).toFixed(2) : '-';
            document.getElementById('avgYTD').textContent = totalAllocYTD > 0 ? (wTotalYTD / totalAllocYTD).toFixed(1) + '%' : '-';
            document.getElementById('avg1Y').textContent = totalAlloc1Y > 0 ? (wTotal1Y / totalAlloc1Y).toFixed(1) + '%' : '-';
            
            // Call the new Client Module logic if available
            if (window.updateFooterAverages) {
                window.updateFooterAverages(data);
                console.log("Updated averages via new module");
            }
        }

        // Helpers
        function getGradientColor(v, min, max, r, g, b) {
            if (v == null) return '';
            const ratio = Math.max(0, Math.min(1, (v - min) / (max - min)));
            const nr = Math.round(255 + ratio * (r - 255));
            const ng = Math.round(255 + ratio * (g - 255));
            const nb = Math.round(255 + ratio * (b - 255));
            return \`background-color: rgb(\${nr},\${ng},\${nb}); color: black;\`;
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
            const d = pts.map((p,i) => {
                const x = (i / (pts.length - 1)) * w;
                const y = h - ((p - min) / (max - min)) * h;
                return (i===0 ? 'M' : 'L') + \`\${x} \${y}\`;
            }).join(' ');
            const isDown = pts[pts.length-1] < pts[0];
            return \`<svg class="sparkline \${isDown?'down':''}" viewBox="0 0 100 30"><path d="\${d}" stroke="\${isDown?'#F44336':'#4CAF50'}" fill="none" stroke-width="2"/></svg>\`;
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
        

        let managersLoaded = false;

        function toggleCreateMode() {
            const mode = document.querySelector('input[name="createMode"]:checked').value;
            document.getElementById('modeBlank').style.display = mode === 'blank' ? 'block' : 'none';
            document.getElementById('modeImport').style.display = mode === 'import' ? 'block' : 'none';
            document.getElementById('btnCreateAction').textContent = mode === 'import' ? 'Import' : 'Create';
            
            if (mode === 'import' && !managersLoaded) {
                loadManagers();
            }
        }

        async function loadManagers() {
            const sel = document.getElementById('investorSelect');
            sel.innerHTML = '<option>Loading...</option>';
            try {
                const res = await fetch('/api/superinvestors');
                const list = await res.json();
                sel.innerHTML = '<option value="">Select Manager...</option>';
                list.forEach(m => {
                    const opt = document.createElement('option');
                    opt.value = m.code;
                    opt.textContent = m.name;
                    sel.appendChild(opt);
                });
                managersLoaded = true;
            } catch (e) {
                sel.innerHTML = '<option>Error loading managers</option>';
            }
        }

        async function handleCreate() {
            const mode = document.querySelector('input[name="createMode"]:checked').value;
            if (mode === 'blank') {
                createGroup();
            } else {
                importGroup();
            }
        }

        async function importGroup() {
            const code = document.getElementById('investorSelect').value;
            if (!code) {
                showToast('Please select a manager', 'error');
                return;
            }
            
            const limitInput = document.getElementById('importLimit');
            const limit = limitInput ? parseInt(limitInput.value) : 10;

            const btn = document.getElementById('btnCreateAction');
            const originalText = btn.textContent;
            btn.textContent = 'Importing...';
            btn.disabled = true;

            try {
                const res = await fetch('/api/import-superinvestor', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code, limit }) // Send limit
                });
                
                const result = await res.json();
                if (!res.ok) throw new Error(result.error || 'Import failed');
                
                showToast('Imported ' + result.name + ' (' + result.memberCount + ' stocks)', 'success');
                closeModal();
                await fetchGroups();

                const newGroup = groups.find(g => g.id === result.id);
                if (newGroup) {
                     // Add holdings to the group object for the next step
                     newGroup.holdings = result.holdings || []; // Ensure holdings was returned
                     await selectGroup(newGroup);
                }

                if (newGroup && newGroup.holdings && newGroup.holdings.length > 0) {
                    showToast('Imported. Updating data for ' + newGroup.holdings.length + ' stocks...', 'info');
                    
                    // Client-side sequential update to avoid worker timeouts
                    let done = 0;
                    const total = newGroup.holdings.length;
                    
                    // Process in batches to speed up (concurrency of 20)
                    const BATCH_SIZE = 20;
                    for (let i = 0; i < total; i += BATCH_SIZE) {
                        const batch = newGroup.holdings.slice(i, i + BATCH_SIZE);
                        
                        await Promise.all(batch.map(async (holding) => {
                            try {
                                await fetch('/api/refresh/' + holding.symbol, { method: 'POST' });
                            } catch (e) {
                                console.error('Update failed for', holding.symbol);
                            } finally {
                                done++;
                            }
                        }));
                        
                        showToast('Updating data: ' + done + '/' + total + '...', 'info');
                        // Minimized delay
                        await new Promise(r => setTimeout(r, 10));
                    }
                    showToast('Data update complete', 'success');
                    // Refresh current view to show new data
                    if (currentGroup && currentGroup.id == newGroup.id) {
                        await loadDashboardData();
                    }
                }

            } catch (e) {
                showToast('Error importing: ' + e.message, 'error');
            } finally {
                btn.textContent = originalText;
                btn.disabled = false;
            }
        }

        async function createGroup() {
            const name = document.getElementById('newGroupName').value;
            if (!name) return;
            try {
                const res = await fetch('/api/groups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
                const newGroup = await res.json();
                closeModal();
                document.getElementById('newGroupName').value = '';
                await fetchGroups(); // refresh list

                // Auto-redirect
                if (newGroup.id) {
                    console.log('Created ID:', newGroup.id, 'Groups:', groups);
                    const g = groups.find(x => x.id == newGroup.id);
                    if (g) {
                        await selectGroup(g);
                        toggleManager(); // Switch to manager view
                    } else {
                        console.error('New group not found in list, race condition?');
                        // Fallback: manually select temp object
                        const tempG = { id: newGroup.id, name: name, description: '' };
                        groups.unshift(tempG); // Add to local list
                        renderSidebar();
                        await selectGroup(tempG);
                        toggleManager();
                    }
                }
            } catch (e) { alert('Error creating group'); }
        }
        async function deleteGroup() {
            if (!currentGroup.id) return;
            openDeleteModal();
        }
        async function confirmDeleteGroup() {
            if (!currentGroup.id) return;
            // Close immediately for better UX
            closeDeleteModal();
            try {
                const idToDelete = currentGroup.id;
                const res = await fetch(\`/api/groups/\${currentGroup.id}\`, { method:'DELETE'});
                
                if(!res.ok) showToast('Delete failed ' + res.status, 'error');
                else {
                    // Optimistic update
                    groups = groups.filter(g => g.id !== idToDelete);
                    renderSidebar();
                    showToast('Portfolio deleted', 'success');

                    if (groups.length > 0) {
                        selectGroup(groups[0]);
                    } else {
                        // Reset to empty state
                        currentGroup = null;
                        document.title = 'Dashboard';
                        document.getElementById('pageTitle').textContent = 'Dashboard';
                        document.getElementById('btnManage').style.display = 'none';
                        setView('dashboard');
                        renderSidebar();
                        // Load empty data or show welcome?
                        dashboardData = [];
                        renderTable([]);
                    }
                }
            } catch(e) { showToast('Error: ' + e, 'error'); }
        }

        
        async function updateGroup() {
            if(!currentGroup.id) return;
            const name = document.getElementById('editGroupName').value;
            const description = document.getElementById('editGroupMemo').value;
            // Send localMembers as well
            try {
                const res = await fetch(\`/api/groups/\${currentGroup.id}\`, { 
                    method:'PUT', 
                    headers:{'Content-Type':'application/json'}, 
                    body:JSON.stringify({name, description, members: localMembers}) 
                });
                if(res.ok) {
                    showToast('Saved successfully!', 'success');
                    await fetchGroups(); 
                    currentGroup.name = name;
                    currentGroup.description = description;
                    document.title = name;
                    document.getElementById('pageTitle').textContent = name;
                    const memoEl = document.getElementById('dashboardMemo');
                    if(memoEl) memoEl.textContent = description || '';
                    document.getElementById('groupModified').textContent = new Date().toLocaleString();
                    
                    // Reset original state
                    originalState = {
                        name: name,
                        description: description || '',
                        members: JSON.stringify(localMembers.sort())
                    };
                    checkDirty();
                    
                    // Redirect back to dashboard
                    toggleManager();
                    await loadDashboardData();
                } else showToast('Failed to save', 'error');
            } catch(e) { showToast('Error saving: ' + e.message, 'error'); }
        }
        
        async function loadMembers() {
            if(!currentGroup.id) return;
            const grid = document.getElementById('membersGrid');
            grid.innerHTML = 'Loading...';
            try {
                const res = await fetch(\`/api/groups/\${currentGroup.id}/members\`);
                const members = await res.json();
                
                // Initialize local state with allocation
                localMembers = members.map(m => ({ symbol: m.symbol, allocation: m.allocation || 0 }));
                originalState = {
                    name: currentGroup.name || '',
                    description: currentGroup.description || '',
                    members: JSON.stringify([...localMembers].sort((a,b) => a.symbol.localeCompare(b.symbol)))
                };
                checkDirty();
                renderMembers();
            } catch(e) { grid.textContent = 'Error'; }
        }

        function renderMembers() {
            const grid = document.getElementById('membersGrid');
            grid.innerHTML = '';
            
            // Toggle Distribute button
            const btnDist = document.getElementById('btnDistribute');
            if(btnDist) btnDist.style.display = localMembers.length > 0 ? 'block' : 'none';
            
            // Calculate total allocation
            const totalAlloc = localMembers.reduce((sum, m) => sum + (parseFloat(m.allocation) || 0), 0);
            
            localMembers.forEach((mem, index) => {
                const el = document.createElement('div');
                el.className = 'member-card';
                
                el.innerHTML = \`
                    <div class="member-symbol">\${mem.symbol}</div>
                    <div style="display:flex; align-items:center;">
                        <div class="member-alloc">
                            <input type="number" step="0.01" min="0" max="100" class="input-field" 
                                style="width:70px; padding:5px; text-align:right; font-size: 1rem; border:1px solid #DDD; height: 34px;" 
                                value="\${mem.allocation}" 
                                oninput="updateAllocation('\${mem.symbol}', this.value)"
                                placeholder="0.00">
                            <span style="font-size:0.9rem; color:#777; font-weight:500;">%</span>
                        </div>
                        <button class="btn-remove" onclick="removeMember('\${mem.symbol}')" title="Remove">&times;</button>
                    </div>
                \`;
                grid.appendChild(el);
            });

            // Show total
            if (localMembers.length > 0) {
                const totalEl = document.createElement('div');
                totalEl.style.gridColumn = '1 / -1';
                totalEl.style.textAlign = 'right';
                totalEl.style.padding = '10px';
                totalEl.style.fontWeight = 'bold';
                // Strict validation: > 100.00 is Error
                const isError = totalAlloc > 100.0001;
                totalEl.style.color = isError ? 'red' : (Math.abs(100 - totalAlloc) < 0.01 ? 'green' : '#666');
                totalEl.innerHTML = \`Total Allocation: \${totalAlloc.toFixed(2)}%\`;
                grid.appendChild(totalEl);
            }
        }
        
        
        // Revised renderMembers to handle Partial Updates if needed
        
        // Revised renderMembers to handle Partial Updates if needed, 
        // but for simplicity let's separate "Render Grid" vs "Render Stats"
        // For now, we revert the re-render call in updateAllocation to avoid typing issues.
        // We will add a specific function to update the Total Text.
        
        function updateTotalDisplay() {
             const totalAlloc = localMembers.reduce((sum, m) => sum + (parseFloat(m.allocation) || 0), 0);
             const grid = document.getElementById('membersGrid');
             if(grid.lastElementChild && grid.lastElementChild.textContent.includes('Total Allocation')) {
                 const totalEl = grid.lastElementChild;
                 const isError = totalAlloc > 100.0001;
                 totalEl.style.color = isError ? 'red' : (Math.abs(100 - totalAlloc) < 0.01 ? 'green' : '#666');
                 totalEl.innerHTML = \`Total Allocation: \${totalAlloc.toFixed(2)}%\`;
             }
        }

        // Overwrite updateAllocation to use the new optimized flow
        function updateAllocation(symbol, value) {
            const mem = localMembers.find(m => m.symbol === symbol);
            if(mem) {
                mem.allocation = value;
                checkDirty();
                updateTotalDisplay();
            }
        }
        
        function distributeAllocation() {
             if(localMembers.length === 0) return;
             
             const count = localMembers.length;
             const rawShare = 100 / count;
             const share = Math.floor(rawShare * 100) / 100; // Floor to 2 decimals
             
             // Assign floor share to all
             localMembers.forEach(m => m.allocation = share.toFixed(2));
             
             // Calculate remainder
             const currentTotal = share * count;
             const remainder = 100 - currentTotal;
             
             // Add remainder to first element (or distribute 0.01 to first N)
             if(remainder > 0.001) {
                 // How many pennies off? e.g. 0.02
                 const pennies = Math.round(remainder * 100);
                 for(let i=0; i<pennies; i++) {
                     if(localMembers[i]) {
                         let val = parseFloat(localMembers[i].allocation) + 0.01;
                         localMembers[i].allocation = val.toFixed(2);
                     }
                 }
             }

             renderMembers();
             checkDirty();
             showToast('Allocations distributed evenly', 'info');
        }

        async function addMember() {
            const inp = document.getElementById('newMemberInput');
            const symbol = inp.value.trim().toUpperCase();
            if(!symbol) return;
            
            if(localMembers.some(m => m.symbol === symbol)) {
                showToast('Symbol already in list', 'info');
                inp.value = '';
                return;
            }

            // UI Feedback
            const originalBtnText = document.querySelector('.btn-add').textContent;
            document.querySelector('.btn-add').textContent = '...';
            document.querySelector('.btn-add').disabled = true;

            try {
                const res = await fetch(\`/api/validate/\${symbol}\`);
                const data = await res.json();
                
                if (data.valid) {
                    localMembers.unshift({ symbol: data.symbol, allocation: 0 }); // Init with 0%
                    renderMembers();
                    checkDirty();
                    inp.value = '';
                    showToast(\`Added \${data.symbol}\`, 'success');
                    
                    // Trigger background refresh so data is ready on save
                    fetch(\`/api/refresh/\${data.symbol}\`, { method: 'POST' }).catch(console.error);
                } else {
                    showToast('Invalid symbol: ' + symbol, 'error');
                }
            } catch(e) {
                console.error(e);
                showToast('Error validating symbol', 'error');
            } finally {
                document.querySelector('.btn-add').textContent = originalBtnText;
                document.querySelector('.btn-add').disabled = false;
                inp.focus();
            }
        }

        function removeMember(symbol) {
             localMembers = localMembers.filter(m => m.symbol !== symbol);
             renderMembers();
             checkDirty();
        }

        function checkDirty() {
            const currentName = document.getElementById('editGroupName').value;
            const currentDesc = document.getElementById('editGroupMemo').value;
            // Sort to compare consistently
            const currentMembersStr = JSON.stringify([...localMembers].sort((a,b) => a.symbol.localeCompare(b.symbol)));
            
            const totalAlloc = localMembers.reduce((sum, m) => sum + (parseFloat(m.allocation) || 0), 0);
            
            const isDirty = (currentName !== originalState.name) ||
                            (currentDesc !== originalState.description) ||
                            (currentMembersStr !== originalState.members);
            
            const isValid = totalAlloc <= 100.0001; 

            const btn = document.getElementById('btnMainAction');
            const btnCancel = document.getElementById('btnCancel');
            
            if(isDirty) {
                if(btnCancel) btnCancel.style.display = 'inline-block';
                btn.textContent = 'Save';
                btn.style.background = isValid ? '#2196F3' : '#F44336'; // Blue if valid, Red if invalid
                btn.style.cursor = isValid ? 'pointer' : 'not-allowed';
                btn.disabled = !isValid;
                // Add * to indicate unsaved changes?
            } else {
                if(btnCancel) btnCancel.style.display = 'none';
                btn.textContent = 'Done';
                btn.style.background = '#999'; // Neutral
                btn.style.cursor = 'pointer';
                btn.disabled = false;
            }
        }

        function handleMainAction() {
            const btn = document.getElementById('btnMainAction');
            if(btn.textContent === 'Save') {
                updateGroup();
            } else {
                toggleManager();
            }
        }
        
        function showToast(message, type = 'info') {
            const container = document.getElementById('toast-container');
            if(!container) return;
            const el = document.createElement('div');
            el.className = \`toast \${type}\`;
            el.textContent = message;
            container.appendChild(el);
            
            // Trigger animation
            requestAnimationFrame(() => el.classList.add('show'));
            
            // Auto remove
            setTimeout(() => {
                el.classList.remove('show');
                setTimeout(() => el.remove(), 300);
            }, 3000);
        }
        async function refreshCurrentGroup() {
            if (!currentGroup) return;
            
            // Re-use logic from importGroup: fetch parallel updates
            // First, get latest members/holdings
            let holdings = [];
            // If we have dashboardData, we can use it, but safer to use members list
            // We need symbols.
            if (dashboardData.length > 0) {
                holdings = dashboardData.map(s => ({ symbol: s.symbol }));
            } else {
                // Fallback if empty dashboard (broken portfolio)
                // We should fetch members from API or use currentGroup details if we had them full
                // But loadDashboardData returns empty.
                // Let's try to fetch members first
                try {
                    const res = await fetch('/api/groups/' + currentGroup.id + '/members');
                    const members = await res.json();
                    holdings = members; // [{symbol: 'AAPL', ...}]
                } catch(e) {
                    showToast('Error getting members list', 'error');
                    return;
                }
            }

            if (!holdings || holdings.length === 0) {
                showToast('No stocks to refresh', 'info');
                return;
            }

            const btn = document.getElementById('btnRefresh');
            const originalText = btn.textContent;
            btn.disabled = true;
            btn.textContent = 'Refreshing...';
            
            let done = 0;
            const total = holdings.length;
            const BATCH_SIZE = 20;
            
            showToast('Starting refresh for ' + total + ' stocks...', 'info');

            for (let i = 0; i < total; i += BATCH_SIZE) {
                const batch = holdings.slice(i, i + BATCH_SIZE);
                await Promise.all(batch.map(async (h) => {
                    try {
                        await fetch('/api/refresh/' + h.symbol, { method: 'POST' });
                    } catch (e) { console.error(e); }
                    finally { done++; }
                }));
                showToast('Refreshed ' + done + '/' + total, 'info');
                await new Promise(r => setTimeout(r, 10));
            }
            
            showToast('Refresh Complete!', 'success');
            btn.disabled = false;
            btn.textContent = originalText;
            loadDashboardData();
        }
`;
