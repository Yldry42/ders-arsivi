const [courseCodeArg = 'UZB337E'] = process.argv.slice(2);
const courseCode = courseCodeArg.replace(/\s+/g, '').trim();
const branchCode = courseCode.match(/^[A-Z]+/)?.[0];

if (!branchCode) {
  throw new Error('Ders kodu okunamadı. Örnek: UZB337E');
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (quoted && next === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

async function fetchRows(date) {
  const url = `https://raw.githubusercontent.com/keepdying/itu-web-archive/main/public/${date}/${branchCode}.csv`;
  const response = await fetch(url);
  if (!response.ok) return [];

  const rows = parseCsv(await response.text());
  const header = rows[0] ?? [];
  return rows.slice(1).map((row) => Object.fromEntries(header.map((name, index) => [name, row[index] ?? ''])));
}

const dates = await (await fetch('https://raw.githubusercontent.com/keepdying/itu-web-archive/main/public/dates.json')).json();

for (const date of dates) {
  const rows = await fetchRows(date.value);
  const matches = rows.filter((row) => String(row['Course Code'] ?? '').replace(/\s+/g, '') === courseCode);
  if (!matches.length) continue;

  console.log(`\n${date.value}`);
  for (const row of matches) {
    console.log([
      `CRN=${row.CRN}`,
      `Course=${row['Course Code']}`,
      `Title=${row['Course Title']}`,
      `Instructor=${row.Instructor}`,
      `Day=${row.Day}`,
      `Time=${row.Time}`,
      `Enrolled=${row.Enrolled}`,
    ].join(' | '));
  }
}
