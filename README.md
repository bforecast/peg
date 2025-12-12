# Forward PEG Analysis System

A comprehensive financial analysis system combining a Python-based backtesting engine with a Cloudflare Worker-powered real-time dashboard. This project analyzes "Forward PEG" (Price/Earnings-to-Growth) ratios to identify high-potential stocks, specifically focusing on the QQQ (Nasdaq-100) universe.

## 🚀 Key Features

*   **Hybrid Data Architecture**:
    *   **Yahoo Finance**: Real-time prices, volume, asset profiles, and "Current Quarter" estimates.
    *   **Alpha Vantage**: Historical earnings data and long-term estimate trends.
    *   **Fallback Logic**: Automatically switches data sources on API failures.
*   **Real-Time Dashboard (Cloudflare Worker)**:
    *   **Mobile-First Design**: Optimized single-line ticker strip for iPhone/Mobile viewing.
    *   **Visualizations**: Interactive Chart.js graphs for Price vs. Forward PEG trends.
    *   **D1 Database**: Serverless SQL storage for caching earnings and price history at the edge.
*   **Advanced Metrics**:
    *   **Forward PEG**: Dynamic calculation using blended forward earnings.
    *   **YoY Growth**: Growth rates calculated against "Previous Year TTM" (Q-8 to Q-5) for seasonality-adjust accuracy.

## 📂 Project Structure

### 1. `earnings-worker/` (Cloudflare Worker)
The core web application and API.
*   **Stack**: TypeScript, Hono, Cloudflare Workers, D1 Database.
*   **Key Files**:
    *   `src/index.ts`: Main API logic and scheduled tasks.
    *   `src/yahoo.ts`: Custom module for robust Yahoo Finance scraping (Crumb/Cookie auth).
    *   `src/ui_new.html`: The HTML/JS frontend with responsive mobile CSS.
*   **Setup**:
    ```bash
    cd earnings-worker
    npm install
    npx wrangler deploy
    ```

### 2. Root Directory (Python Engine)
Backtesting and strategy analysis tools.
*   **Stack**: Python 3.10+, Pandas, Plotly.
*   **Key Files**:
    *   `backtester.py`: Simulates trading strategies based on historical PEG data.
    *   `data_loader.py`: Ingests and normalizes financial data from CSV/APIs.
    *   `strategy.py`: Defines the "Forward PEG" selection logic.
*   **Usage**:
    ```bash
    python main.py
    ```

## 🛠 Configuration
*   **Environment Variables**:
    *   `ALPHA_VANTAGE_KEY`: Required for historical earnings.
    *   `DB`: Cloudflare D1 binding (configured in `wrangler.toml`).

## 📱 Mobile UI Features
*   **Unified Strip**: Ticker, Price, and Metrics in a single horizontal scrollable row on mobile.
*   **Readable Fonts**: Optimized for legibility (18px/15px) without clutter.
*   **Interactive Charts**: Pan and Zoom capabilities for price trends.

## License
MIT
