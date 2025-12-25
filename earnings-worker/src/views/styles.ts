export const STYLES = `
        :root { --bg-color: #FAFAFA; --text-color: #111; --sidebar-width: 250px; --sidebar-bg: #F8F9FA; --active-item-bg: #E8F5E9; --active-item-text: #2E7D32; --border-color: #DDD; }
        * { box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--bg-color); color: var(--text-color); margin: 0; padding: 0; height: 100vh; display: flex; overflow: hidden; }
        #sidebar { width: var(--sidebar-width); background: var(--sidebar-bg); border-right: 1px solid var(--border-color); display: flex; flex-direction: column; padding: 20px; flex-shrink: 0; margin-left: 0; }
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
        
        .view-container { flex-grow: 1; overflow: hidden; padding: 0 25px 20px 25px; position: relative; display: flex; flex-direction: column; }
        /* Dashboard View specific: Pass height to table container */
        #view-dashboard { flex-grow: 1; display: flex; flex-direction: column; overflow: hidden; height: 100%; }
        .dashboard-container { width: 100%; max-width: 1400px; margin: 0 auto; background: white; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); border: 1px solid #EEE; overflow: auto; flex-grow: 1; -webkit-overflow-scrolling: touch; position: relative; }
        
        /* Manager View specific: Needs its own scroll */
        #view-manager { flex-grow: 1; overflow-y: auto; height: 100%; padding-top: 20px; }
        
        table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
        th, td { padding: 6px 6px; text-align: center; border-bottom: 1px solid #EEE; font-weight: 600; }
        th:nth-child(1), td:nth-child(1), th:nth-child(2), td:nth-child(2) { text-align: left; }
        
        /* Sticky Header */
        /* Sticky Header */
        th { background: #F9F9F9 !important; font-weight: 700; color: #555 !important; cursor: pointer; user-select: none; font-size: 13px; white-space: nowrap; position: sticky; top: 0; z-index: 20; border-bottom: 2px solid #EEE !important; border-top: none !important; box-shadow: none !important; } 
        th:hover { background: #E0E0E0 !important; }

        /* Sticky Ticker Column */
        td:nth-child(1), th:nth-child(1) { position: sticky; left: 0; z-index: 30; border-right: 1px solid #EEE; }
        /* Top Left Corner needs highest z-index */
        th:nth-child(1) { z-index: 40; }
        
        /* Fix background transparency on sticky col */
        td:nth-child(1) { background-color: #fff; }
        /* Ensure hover doesn't break opacity on iOS */
        tbody tr:hover td:nth-child(1) { background-color: #F5F5F5; }

        th.narrow-col, td.narrow-col { width: 25px; padding: 6px 2px; font-size: 0.75rem; }
        .company-cell { max-width: 120px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; }
        


        
        /* Manager View Styles */
        .manager-header { display: flex; gap: 10px; margin-bottom: 20px; }
        .input-group { display: flex; gap: 10px; flex-grow: 1; max-width: 600px; }
        .input-field { padding: 10px; border: 1px solid #DDD; border-radius: 4px; flex-grow: 1; font-size: 1rem; }
        .btn-add { padding: 10px 20px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 500; }
        .manager-layout { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
        .members-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 15px; }
        .member-card { background: white; border: 1px solid #EEE; border-radius: 8px; padding: 12px 15px; display: flex; align-items: center; justify-content: space-between; position: relative; box-shadow: 0 1px 2px rgba(0,0,0,0.05); transition: box-shadow 0.2s; }
        .member-card:hover { box-shadow: 0 4px 8px rgba(0,0,0,0.1); }
        .member-symbol { font-size: 1.1rem; font-weight: 700; color: #333; }
        .member-alloc { display: flex; align-items: center; gap: 8px; }
        .btn-remove { margin-left: 10px; color: #DDD; background: none; border: none; cursor: pointer; font-size: 1.4rem; line-height: 1; padding: 0; transition: color 0.2s; }
        .btn-remove:hover { color: #F44336; }
        
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
        .ticker-cell { font-weight: bold; vertical-align: middle; }
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
            .manager-layout { grid-template-columns: 1fr; gap: 20px; }
        }
        /* Show toggle button on desktop too but style it */
        .btn-mobile-toggle { display: block; margin-right: 15px; background: none; border: none; font-size: 1.5rem; cursor: pointer; color: #333; }
        @media (min-width: 769px) {
             /* Hide the inner Close button on desktop if we want, or keep it consistent. 
                The inner one is inside h2. Let's hide the inner 'X' on desktop. */
             #sidebar .btn-mobile-toggle { display: none !important; }
        }
        
        /* Toast Notification */
        #toast-container { position: fixed; bottom: 20px; right: 20px; z-index: 2000; display: flex; flex-direction: column; gap: 10px; pointer-events: none; }
        .toast { pointer-events: auto; background: #333; color: white; padding: 12px 24px; border-radius: 4px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); font-size: 0.95rem; opacity: 0; transform: translateY(20px); transition: all 0.3s ease; display: flex; align-items: center; min-width: 250px; }
        .toast.show { opacity: 1; transform: translateY(0); }
        .toast.success { background: #4CAF50; }
        .toast.error { background: #F44336; }
        .toast.info { background: #2196F3; }
        
        /* Portfolios Board Specific */
        .portfolios-scroll-container { overflow: auto; max-height: calc(100vh - 150px); }
        .portfolio-table { border-collapse: separate; border-spacing: 0; }
        .portfolio-table th { background: #F5F5F5; position: sticky; top: 45px; z-index: 20; font-size: 0.75rem; padding: 10px 8px; white-space: nowrap; }
        .portfolio-table th:hover { background: #E0E0E0; }
        .portfolio-table td { padding: 8px; }
        .portfolio-table .sticky-col { position: sticky; left: 0; z-index: 30; background: white; border-right: 2px solid #EEE; min-width: 150px; }
        .portfolio-table th.sticky-col { z-index: 40; background: #F5F5F5; }
        .portfolio-table tbody tr:hover .sticky-col { background: #f0f9ff; }
        
        /* FORCE WHITE HEADERS - Overriding artifacts */
        th, .portfolio-table th, .sticky-col { background: #FFFFFF !important; background-color: #FFFFFF !important; color: #333 !important; }
        th:hover, .portfolio-table th:hover { background: #F0F0F0 !important; }


        /* Global Table Hover */
        tbody tr:hover { background-color: #f0f9ff !important; transition: background 0.2s; }
        
        /* Compact SVGs for Dashboard */
        .dashboard-container table td svg { height: 25px; width: auto; vertical-align: middle; }

        /* FORCE STICKY HEADER LAYERING */
        .portfolio-table th { top: 0 !important; z-index: 100 !important; }
        .portfolio-table th.sticky-col { z-index: 110 !important; }
`;
