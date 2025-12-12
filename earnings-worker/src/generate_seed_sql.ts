
import fs from 'fs';
import path from 'path';

const cachePath = path.join(__dirname, '../../cache/earnings_cache.json');
const outputPath = path.join(__dirname, '../seed.sql');

if (!fs.existsSync(cachePath)) {
    console.error(`Cache file not found at ${cachePath}`);
    process.exit(1);
}

const data = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
let sql = '';

console.log(`Processing ${Object.keys(data).length} symbols...`);

for (const [symbol, records] of Object.entries(data)) {
    if (!Array.isArray(records)) continue;

    for (const r of records as any[]) {
        if (r.fiscalDateEnding < '2018-01-01') continue;

        const est = parseFloat(r.estimatedEPS) || 'NULL';
        const rep = parseFloat(r.reportedEPS) || 'NULL';
        const sur = parseFloat(r.surprise) || 'NULL';
        const surP = parseFloat(r.surprisePercentage) || 'NULL';

        // Escape strings safely (sqlite)
        const safeSym = symbol.replace(/'/g, "''");

        sql += `INSERT OR REPLACE INTO earnings_estimates (symbol, fiscal_date_ending, estimated_eps, reported_eps, surprise, surprise_percentage, report_date) VALUES ('${safeSym}', '${r.fiscalDateEnding}', ${est}, ${rep}, ${sur}, ${surP}, '${r.reportedDate}');\n`;
    }
}

fs.writeFileSync(outputPath, sql);
console.log(`Generated SQL with ${sql.split('\n').length - 1} statements at ${outputPath}`);
