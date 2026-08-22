import courses from '../data/dersler.json' with { type: 'json' };

const archiveCache = new Map();

function normalizeCourseCode(value) {
  return String(value ?? '').replace(/\s+/g, '').trim();
}

function normalizeTerm(value) {
  const normalized = String(value ?? '').toLocaleLowerCase('tr');
  if (normalized.includes('güz') || normalized.includes('guz') || normalized.includes('fall')) return 'Güz';
  if (normalized.includes('bahar') || normalized.includes('spring')) return 'Bahar';
  if (normalized.includes('yaz') || normalized.includes('summer')) return 'Yaz';
  return String(value ?? '');
}

function getAcademicYears(courseYear) {
  const years = String(courseYear).match(/\d{4}/g);
  return {
    start: Number(years?.[0] ?? 0),
    end: Number(years?.at(-1) ?? years?.[0] ?? 0),
  };
}

function getSemesterSnapshotCandidates(dates, courseYear, term) {
  const { start, end } = getAcademicYears(courseYear);
  const normalizedTerm = normalizeTerm(term);
  const dated = dates.map((item) => ({ ...item, time: new Date(`${item.value}T00:00:00Z`).getTime() }));
  const inRange = (from, to) => dated.filter((item) => item.time >= from.getTime() && item.time <= to.getTime());

  if (normalizedTerm === 'Güz') {
    return inRange(new Date(`${start}-08-01T00:00:00Z`), new Date(`${end}-01-31T23:59:59Z`));
  }

  if (normalizedTerm === 'Bahar') {
    return inRange(new Date(`${end}-01-01T00:00:00Z`), new Date(`${end}-06-15T23:59:59Z`));
  }

  if (normalizedTerm === 'Yaz') {
    return inRange(new Date(`${end}-06-01T00:00:00Z`), new Date(`${end}-08-31T23:59:59Z`));
  }

  return dated;
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

async function fetchArchiveRows(date, branchCode) {
  const cacheKey = `${date}/${branchCode}`;
  if (archiveCache.has(cacheKey)) return archiveCache.get(cacheKey);

  const url = `https://raw.githubusercontent.com/keepdying/itu-web-archive/main/public/${date}/${branchCode}.csv`;
  const response = await fetch(url);
  if (!response.ok) {
    archiveCache.set(cacheKey, []);
    return [];
  }

  const rows = parseCsv(await response.text());
  const header = rows[0] ?? [];
  const parsed = rows.slice(1).map((row) => Object.fromEntries(header.map((name, index) => [name, row[index] ?? ''])));
  archiveCache.set(cacheKey, parsed);
  return parsed;
}

const dates = await (await fetch('https://raw.githubusercontent.com/keepdying/itu-web-archive/main/public/dates.json')).json();
const suggestions = [];

for (const course of courses) {
  const courseCode = `${course.kod}${course.no}`;
  const archiveCandidates = [];

  for (const snapshot of getSemesterSnapshotCandidates(dates, course.yil, course.donem)) {
    const rows = await fetchArchiveRows(snapshot.value, course.kod);
    const matches = rows.filter((row) => normalizeCourseCode(row['Course Code']) === courseCode);
    if (!matches.length) continue;

    const enrolled = Math.max(...matches.map((row) => Number(String(row.Enrolled ?? '0').replace(/[^\d.-]/g, '')) || 0), 0);
    const titles = [...new Set(matches.map((row) => row['Course Title']).filter(Boolean))];
    archiveCandidates.push({ snapshot: snapshot.value, enrolled, titles });
  }

  archiveCandidates.sort((left, right) => right.enrolled - left.enrolled || right.snapshot.localeCompare(left.snapshot));
  const archiveTitle = archiveCandidates[0]?.titles?.[0] ?? '';
  if (!archiveTitle) continue;

  const currentTitles = new Set([course.ders_adi, course.ders_adi_en].filter(Boolean));
  if (!currentTitles.has(archiveTitle)) {
    suggestions.push({
      ders_kodu: courseCode,
      mevcut_tr: course.ders_adi,
      mevcut_en: course.ders_adi_en,
      arsiv: archiveTitle,
      snapshot: archiveCandidates[0].snapshot,
      ogrenci: archiveCandidates[0].enrolled,
    });
  }
}

console.log(JSON.stringify(suggestions, null, 2));
