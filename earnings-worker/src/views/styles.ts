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
        td:nth-child(1), th:nth-child(2), td:nth-child(2) { text-align: left; }
        
        /* Sticky Header */
        /* Sticky Header */
        th { background: #F9F9F9 !important; font-weight: 700; color: #555 !important; cursor: pointer; user-select: none; font-size: 1rem; white-space: nowrap; position: sticky; top: 0; z-index: 20; border-bottom: 2px solid #EEE !important; border-top: none !important; box-shadow: none !important; } 
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
        .portfolio-table th { background: #F5F5F5; position: sticky; top: 45px; z-index: 20; font-size: 1rem; padding: 10px 8px; white-space: nowrap; }
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

        /* Sidebar Redesign Styles */
        .category-header {
            display: flex; align-items: center; justify-content: space-between;
            padding: 12px 15px; cursor: pointer; color: #444; font-weight: 600; font-size: 0.95rem;
            transition: background 0.2s; border-radius: 6px; margin-top: 5px;
        }
        .category-header:hover { background: #E0E0E0; }
        .category-header svg { width: 18px; height: 18px; fill: currentColor; opacity: 0.7; }
        .category-title { display: flex; align-items: center; gap: 10px; }
        .category-arrow { transition: transform 0.2s; font-size: 0.8rem; opacity: 0.5; }
        .category-header.collapsed .category-arrow { transform: rotate(-90deg); }
        
        .category-list { list-style: none; padding: 0; margin: 0; overflow: hidden; transition: max-height 0.3s ease-out; }
        .category-list.collapsed { max-height: 0; }
        
        /* Indent sub-items */
        .category-list .group-item {
            padding-left: 42px; /* 15px pad + 18px icon + 10px gap */
            font-size: 0.9rem;
            margin-bottom: 2px;
            padding-top: 8px; padding-bottom: 8px;
        }
        /* Collapsible Memo Styles */
        .memo-container {
            max-height: 4.5em; /* Approx 3 lines */
            overflow: hidden;
            position: relative;
            cursor: pointer;
            transition: max-height 0.4s ease-out;
            line-height: 1.5;
        }
        .memo-container.expanded {
            max-height: 1000px; /* Large enough to show all */
            transition: max-height 0.6s ease-in;
        }
        .memo-container::after {
            content: '';
            position: absolute;
            bottom: 0; right: 0; left: 0;
            height: 2em;
            background: linear-gradient(to bottom, transparent, white);
            pointer-events: none;
            opacity: 1;
            transition: opacity 0.3s;
        }
        .memo-container.expanded::after {
            opacity: 0;
            pointer-events: none;
        }
        /* Mobile adjustment for fade color matching background if needed */
        @media (max-width: 768px) {
             /* Assuming white background, logic holds */
        }

        /* Chat UI Styles */
        .fab-btn {
            position: fixed;
            bottom: 30px;
            right: 30px;
            background: linear-gradient(135deg, #2563EB, #1D4ED8);
            color: white;
            width: 60px;
            height: 60px;
            border-radius: 30px;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 15px rgba(37, 99, 235, 0.3);
            cursor: pointer;
            transition: transform 0.2s, box-shadow 0.2s;
            z-index: 2000;
        }

        .fab-btn:hover {
            transform: scale(1.05);
            box-shadow: 0 6px 20px rgba(37, 99, 235, 0.4);
        }

        .chat-container {
            position: fixed;
            bottom: 80px;
            right: 20px;
            width: 600px;
            height: 800px;
            max-height: 90vh;
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border: 1px solid rgba(255, 255, 255, 0.5);
            border-radius: 20px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
            display: flex;
            flex-direction: column;
            overflow: hidden;
            z-index: 2000;
            transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .chat-container.maximized {
            width: 90vw;
            height: 90vh;
            right: 5vw;
            bottom: 5vh;
            max-height: 90vh;
        }

        @media (max-width: 768px) {
            .chat-container {
                width: 96vw;
                right: 2vw;
                bottom: 80px;
                height: 70vh;
            }
            
            .chat-container.maximized {
                position: fixed !important;
                width: 100vw !important;
                height: 100dvh !important;
                top: 0 !important;
                left: 0 !important;
                right: 0 !important;
                bottom: 0 !important;
                margin: 0 !important;
                border: none !important;
                border-radius: 0 !important;
                max-height: none !important;
                z-index: 9999 !important;
            }
        }

        .chat-header {
            padding: 20px;
            background: rgba(255, 255, 255, 0.8);
            border-bottom: 1px solid rgba(0, 0, 0, 0.05);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .header-title {
            font-weight: 600;
            font-size: 16px;
            color: #111827;
            display: flex;
            flex-direction: column;
            gap: 2px;
        }

        .header-subtitle {
            font-size: 11px;
            color: #6B7280;
            font-weight: 500;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .status-dot {
            width: 8px;
            height: 8px;
            background: #10B981;
            border-radius: 50%;
        }

        .close-btn { color: #6B7280; cursor: pointer; font-size: 24px; line-height: 1; }

        .chat-messages {
            flex: 1;
            padding: 20px;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 16px;
        }

        .chat-messages table {
            width: 100%;
            border-collapse: collapse;
            margin: 12px 0;
            font-size: 0.85rem;
            display: block;
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
            border-radius: 8px;
            background: #ffffff;
            border: 1px solid rgba(0, 0, 0, 0.08);
            box-shadow: 0 1px 3px rgba(0,0,0,0.02);
        }

        .chat-messages th, .chat-messages td {
            border: 1px solid rgba(0, 0, 0, 0.08);
            padding: 8px 12px;
            text-align: left;
            min-width: 80px;
        }

        .chat-messages th {
            background: rgba(0, 0, 0, 0.03);
            color: #374151;
            font-weight: 600;
            white-space: nowrap;
        }

        .chat-messages tr:nth-child(even) {
            background: rgba(0, 0, 0, 0.01);
        }

        .message {
            max-width: 85%;
            padding: 12px 16px;
            border-radius: 16px;
            font-size: 0.95rem;
            line-height: 1.5;
            position: relative;
        }

        .message.bot {
            background: #F3F4F6;
            color: #1F2937;
            border-bottom-left-radius: 4px;
            box-shadow: 0 1px 2px rgba(0,0,0,0.05);
            align-self: flex-start;
        }

        .message.user {
            background: #2563EB;
            color: white;
            border-bottom-right-radius: 4px;
            align-self: flex-end;
            box-shadow: 0 2px 4px rgba(37, 99, 235, 0.2);
        }

        .typing-indicator {
            display: flex;
            gap: 4px;
            padding: 12px 16px;
            background: #F3F4F6;
            border-radius: 16px;
            border-bottom-left-radius: 4px;
            width: fit-content;
            margin-bottom: 8px;
            align-self: flex-start;
        }

        .dot {
            width: 6px;
            height: 6px;
            background: #9CA3AF;
            border-radius: 50%;
            animation: bounce 1.4s infinite ease-in-out;
        }
        .dot:nth-child(1) { animation-delay: -0.32s; }
        .dot:nth-child(2) { animation-delay: -0.16s; }
        @keyframes bounce {
            0%, 80%, 100% { transform: scale(0); }
            40% { transform: scale(1); }
        }

        .input-area {
            padding: 12px 16px;
            background: rgba(255, 255, 255, 0.95);
            border-top: 1px solid rgba(0, 0, 0, 0.05);
            display: flex;
            flex-direction: column;
            gap: 10px;
        }

        .chips-row {
            display: flex;
            gap: 8px;
            overflow-x: auto;
            padding-bottom: 4px;
            scrollbar-width: none;
        }

        .chip {
            background: #EFF6FF;
            color: #2563EB;
            font-size: 11px;
            font-weight: 500;
            padding: 4px 10px;
            border-radius: 12px;
            white-space: nowrap;
            cursor: pointer;
            border: 1px solid rgba(37, 99, 235, 0.1);
            transition: all 0.2s;
        }
        .chip:hover { background: #DBEAFE; transform: translateY(-1px); }

        .input-wrapper { display: flex; gap: 10px; align-items: center; }
        .chat-input {
            flex: 1;
            padding: 10px 14px;
            border-radius: 12px;
            border: 1px solid #E5E7EB;
            outline: none;
            font-family: inherit;
            font-size: 14px;
            transition: border-color 0.2s;
        }
        .chat-input:focus { border-color: #2563EB; }

        .send-btn {
            background: #2563EB;
            color: white;
            border: none;
            border-radius: 12px;
            width: 40px;
            height: 40px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: background 0.2s;
            flex-shrink: 0;
        }
        .send-btn:hover { background: #1D4ED8; }

        .slash-menu {
            position: absolute;
            bottom: 80px;
            left: 20px;
            width: 250px;
            background: white;
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.15);
            border: 1px solid #E5E7EB;
            overflow-y: auto;
            max-height: 300px;
            z-index: 2001;
            animation: slideUp 0.2s ease-out;
        }

        .slash-header {
            padding: 8px 12px;
            background: #F9FAFB;
            font-size: 11px;
            font-weight: 600;
            color: #6B7280;
            border-bottom: 1px solid #E5E7EB;
        }
        .slash-item {
            padding: 10px 12px;
            display: flex;
            align-items: center;
            gap: 10px;
            cursor: pointer; transition: background 0.1s;
        }
        .slash-item:hover, .slash-item.active { background: #EFF6FF; }
        .slash-icon {
            width: 24px; height: 24px; background: #DBEAFE; color: #2563EB;
            border-radius: 6px; display: flex; align-items: center; justify-content: center;
            font-size: 12px; font-weight: 600;
        }
        .slash-text { font-size: 13px; color: #1F2937; font-weight: 500; }
        .slash-desc { font-size: 11px; color: #6B7280; margin-left: auto; }
        @keyframes slideUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

        @media (max-width: 480px) {
            .chat-container { width: 100%; height: 100%; max-height: 100%; bottom: 0; right: 0; border-radius: 0; }
        }

        /* Portfolio Performance & Trend Section (Compact Mobile-Optimized) */
        .perf-control-bar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 8px;
            margin-bottom: 8px;
        }
        .perf-period-buttons {
            display: inline-flex;
            gap: 3px;
            background: #F1F5F9;
            padding: 2px;
            border-radius: 6px;
        }
        .perf-period-btn {
            background: transparent;
            border: none;
            border-radius: 4px;
            padding: 4px 8px;
            font-size: 0.76rem;
            font-weight: 500;
            color: #64748B;
            cursor: pointer;
            transition: all 0.15s;
            white-space: nowrap;
        }
        .perf-period-btn:hover {
            color: #0F172A;
        }
        .perf-period-btn.active {
            background: white;
            color: #2563EB;
            font-weight: 600;
            box-shadow: 0 1px 2px rgba(0,0,0,0.08);
        }
        .btn-toggle-chart {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            padding: 4px 10px;
            font-size: 0.76rem;
            font-weight: 600;
            color: #475569;
            background: white;
            border: 1px solid #CBD5E1;
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.15s;
            white-space: nowrap;
        }
        .btn-toggle-chart:hover {
            background: #F8FAFC;
            color: #0F172A;
            border-color: #94A3B8;
        }
        .btn-toggle-chart.active {
            background: #EFF6FF;
            color: #2563EB;
            border-color: #93C5FD;
        }

        .perf-stats-text-bar {
            background: #F8FAFC;
            border: 1px solid #E2E8F0;
            border-radius: 8px;
            padding: 7px 12px;
            display: flex;
            align-items: center;
            flex-wrap: wrap;
            gap: 8px 14px;
            font-size: 0.8rem;
            color: #475569;
            line-height: 1.35;
            margin-bottom: 10px;
        }
        .perf-stat-item {
            display: inline-flex;
            align-items: baseline;
            gap: 4px;
            white-space: nowrap;
        }
        .perf-stat-label {
            color: #64748B;
            font-weight: 500;
            font-size: 0.76rem;
        }
        .perf-stat-val {
            font-weight: 700;
            color: #0F172A;
        }
        .perf-stat-sub {
            color: #94A3B8;
            font-size: 0.72rem;
            font-weight: 400;
        }
        .val-pos { color: #10B981 !important; }
        .val-neg { color: #EF4444 !important; }

        .perf-chart-card {
            background: white;
            border: 1px solid #E2E8F0;
            border-radius: 8px;
            padding: 14px 16px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.04);
            margin-bottom: 15px;
        }
        .perf-chart-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 10px;
            margin-bottom: 12px;
            padding-bottom: 8px;
            border-bottom: 1px solid #F1F5F9;
        }
        .perf-legend {
            display: inline-flex;
            align-items: center;
            gap: 12px;
            font-size: 0.8rem;
            color: #475569;
        }
        .legend-item {
            display: inline-flex;
            align-items: center;
            gap: 5px;
        }
        .legend-dot {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            display: inline-block;
        }
        .legend-diamond {
            width: 8px;
            height: 8px;
            transform: rotate(45deg);
            display: inline-block;
        }
        .legend-dash {
            width: 14px;
            height: 0;
            border-top: 2px dashed #0284c7;
            display: inline-block;
            vertical-align: middle;
        }
        .perf-period-buttons {
            display: inline-flex;
            gap: 4px;
            background: #F1F5F9;
            padding: 2px;
            border-radius: 6px;
        }
        .perf-period-btn {
            background: transparent;
            border: none;
            border-radius: 4px;
            padding: 4px 10px;
            font-size: 0.8rem;
            font-weight: 500;
            color: #64748B;
            cursor: pointer;
            transition: all 0.15s;
        }
        .perf-period-btn:hover {
            color: #0F172A;
        }
        .perf-period-btn.active {
            background: white;
            color: #2563EB;
            font-weight: 600;
            box-shadow: 0 1px 2px rgba(0,0,0,0.08);
        }

        .perf-tooltip {
            position: absolute;
            background: rgba(15, 23, 42, 0.92);
            color: white;
            padding: 8px 12px;
            border-radius: 6px;
            font-size: 0.78rem;
            pointer-events: none;
            z-index: 100;
            box-shadow: 0 4px 12px rgba(0,0,0,0.25);
            backdrop-filter: blur(4px);
            line-height: 1.4;
            min-width: 150px;
            transform: translate(-50%, -110%);
        }
        .perf-tooltip .tt-date { font-weight: 700; color: #94A3B8; margin-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.15); padding-bottom: 2px; }
        .perf-tooltip .tt-row { display: flex; justify-content: space-between; gap: 12px; margin: 2px 0; }
        .perf-tooltip .tt-val { font-weight: 600; }

        .perf-chart-loading {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(255,255,255,0.85);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            z-index: 20;
            border-radius: 6px;
        }
`;
