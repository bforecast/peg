const now = new Date();
const past24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

const options = {
    timeZone: "America/New_York",
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
};

const parts = new Intl.DateTimeFormat('en-US', options).formatToParts(past24h);
const p = (type) => parts.find(x => x.type === type)?.value || '00';
const cutoff = `${p('year')}-${p('month')}-${p('day')} ${p('hour')}:${p('minute')}:${p('second')}`;

console.log("Now (Local):", now.toString());
console.log("Past 24h (EST Object):", past24h.toLocaleString("en-US", { timeZone: "America/New_York" }));
console.log("Generated Cutoff String:", cutoff);
