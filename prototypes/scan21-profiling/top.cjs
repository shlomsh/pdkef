const fs = require('fs');
const dir = process.argv[2];
const f = fs.readdirSync(dir).map((x) => dir + '/' + x).sort().pop();
const p = JSON.parse(fs.readFileSync(f));
const self = {};
const byId = {};
p.nodes.forEach((n) => (byId[n.id] = n));
p.samples.forEach((s, i) => {
  const n = byId[s];
  const k = n.callFrame.functionName + ':' + n.callFrame.lineNumber + ' ' + n.callFrame.url.split('/').pop();
  self[k] = (self[k] || 0) + (p.timeDeltas[i] || 0);
});
Object.entries(self).sort((a, b) => b[1] - a[1]).slice(0, 12).forEach(([k, v]) => console.log((v / 1000).toFixed(0), 'ms', k));
