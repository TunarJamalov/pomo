const minutes = 5;
const startMs = Date.now();
const interval = setInterval(() => {
    const now = Date.now();
    const elapsed = Math.floor((now - startMs) / 1000 / 60);
    const percentage = elapsed / minutes;
    console.log(`[Interval] Elapsed: ${elapsed}m, Progress: ${Math.round(percentage * 100)}%`);
}, 60 * 1000);

setTimeout(() => {
    console.log(`[Timeout] Completion triggered. Cancelling interval.`);
    clearInterval(interval);
}, minutes * 60 * 1000);
