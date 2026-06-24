const fs = require('fs');
const path = require('path');
const p = path.join(__dirname, '..', 'data', 'dersler.json');
const raw = fs.readFileSync(p, 'utf8');
let data = JSON.parse(raw);

for (const d of data) {
  const name = (d.ders_adi || '').toLowerCase();
  let suffix = 'E';
  if (/laboratuvar|laboratuvarı|lab/.test(name)) suffix = 'EL';
  else if (/uygulama|pratik/.test(name)) suffix = 'A';

  // extract numeric part of no
  const base = String(d.no || '').replace(/[^0-9]/g, '');
  if (!base) continue;
  d.no = `${base}${suffix}`;
}

fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
console.log('Updated dersler.json with suffixes.');
