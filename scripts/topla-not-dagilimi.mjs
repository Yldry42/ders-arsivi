import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import courses from '../data/dersler.json' with { type: 'json' };
import gradeData from '../data/not-dagilimlari.json' with { type: 'json' };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const gradeDataPath = path.join(repoRoot, 'data', 'not-dagilimlari.json');
const reviewPath = path.join(repoRoot, 'data', 'not-dagilimi-kontrol.json');

const args = new Set(process.argv.slice(2));
const writeMode = args.has('--write');
const trustAllMedium = args.has('--trust-medium');
const trustMediumArg = process.argv.find((arg) => arg.startsWith('--trust-medium='));
const trustedMediumCodes = trustMediumArg
  ? new Set(trustMediumArg.replace('--trust-medium=', '').split(',').map((code) => code.trim()).filter(Boolean))
  : null;
const onlyArg = process.argv.find((arg) => arg.startsWith('--only='));
const onlyCodes = onlyArg
  ? new Set(onlyArg.replace('--only=', '').split(',').map((code) => code.trim()).filter(Boolean))
  : null;

const gradeOrder = ['AA', 'BA+', 'BA', 'BB+', 'BB', 'CB+', 'CB', 'CC+', 'CC', 'DC+', 'DC', 'DD+', 'DD', 'FF', 'VF'];
const archiveCache = new Map();
const instructorAliases = {
  'Seher Eken': ['Seher Durmaz'],
};

function normalizeCourseCode(value) {
  return String(value ?? '').replace(/\s+/g, '').trim();
}

function normalizeName(value) {
  return String(value ?? '').toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim();
}

function normalizeTerm(value) {
  const normalized = String(value ?? '').toLocaleLowerCase('tr');
  if (normalized.includes('güz') || normalized.includes('guz') || normalized.includes('fall')) return 'Güz';
  if (normalized.includes('bahar') || normalized.includes('spring')) return 'Bahar';
  if (normalized.includes('yaz') || normalized.includes('summer')) return 'Yaz';
  return String(value ?? '');
}

function normalizeInstructors(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
}

function getInstructorNamesWithAliases(value) {
  return normalizeInstructors(value).flatMap((name) => [name, ...(instructorAliases[name] ?? [])]);
}

function getAcademicYears(courseYear) {
  const years = String(courseYear).match(/\d{4}/g);
  return {
    start: Number(years?.[0] ?? 0),
    end: Number(years?.at(-1) ?? years?.[0] ?? 0),
  };
}

function getObsYear(courseYear) {
  return getAcademicYears(courseYear).end;
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

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
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

async function findArchiveMatch(dates, course) {
  const courseCode = `${course.kod}${course.no}`;
  const expectedInstructors = getInstructorNamesWithAliases(course.ogretim_uyesi).map(normalizeName);
  const candidates = getSemesterSnapshotCandidates(dates, course.yil, course.donem);
  const archiveCandidates = [];

  for (const snapshot of candidates) {
    const rows = await fetchArchiveRows(snapshot.value, course.kod);
    const matches = rows.filter((row) => normalizeCourseCode(row['Course Code']) === courseCode);
    if (!matches.length) continue;

    const instructors = [...new Set(matches.map((row) => row.Instructor).filter(Boolean))];
    const enrolled = Math.max(...matches.map((row) => Number(String(row.Enrolled ?? '0').replace(/[^\d.-]/g, '')) || 0), 0);
    archiveCandidates.push({ snapshot: snapshot.value, matches, instructors, enrolled });
  }

  if (archiveCandidates.length) {
    archiveCandidates.sort((left, right) => right.enrolled - left.enrolled || right.snapshot.localeCompare(left.snapshot));
    const selected = archiveCandidates[0];
    const normalizedInstructors = selected.instructors.map(normalizeName);
    const allMatchExpected =
      expectedInstructors.length > 0 &&
      normalizedInstructors.length > 0 &&
      normalizedInstructors.every((name) => expectedInstructors.includes(name));

    return {
      snapshot: selected.snapshot,
      branchCount: selected.matches.length,
      instructors: selected.instructors,
      enrolled: selected.enrolled,
      confidence: selected.instructors.length === 1 && allMatchExpected ? 'high' : 'review',
      reason: selected.instructors.length === 1 && allMatchExpected ? 'Arşivde dönem içinde tek ve beklenen hoca.' : 'Arşivde hoca bilgisi dersler.json ile net uyuşmuyor.',
    };
  }

  return {
    snapshot: null,
    branchCount: 0,
    instructors: [],
    confidence: expectedInstructors.length ? 'medium' : 'review',
    reason: expectedInstructors.length
      ? 'Dönem arşiv snapshotında ders yok; dersler.json hocası kullanılacak.'
      : 'Dönem arşiv snapshotında ders yok ve dersler.json hocası yok.',
  };
}

async function fetchObsDistributions(course) {
  const courseNo = String(course.no).replace(/\D/g, '');
  const obsYear = getObsYear(course.yil);
  const url = `https://obs.itu.edu.tr/public/DersNotDagilimi/NotDagilimiSearch?bransKodu=${course.kod}&dersNo=${courseNo}&yil=${obsYear}`;
  const response = await fetch(url, {
    headers: {
      'x-requested-with': 'XMLHttpRequest',
      referer: `https://obs.itu.edu.tr/public/DersNotDagilimi?bransKodu=${course.kod}&dersNo=${courseNo}&yil=${obsYear}`,
    },
  });

  if (!response.ok) return [];

  const html = await response.text();
  const match = html.match(/const ALL_DATA = (\[.*?\]);/s);
  return match ? JSON.parse(match[1]) : [];
}

function pickObsTerm(distributions, term) {
  const normalizedTerm = normalizeTerm(term);
  return distributions.find((item) => normalizeTerm(item.DonemTipAdi) === normalizedTerm) ?? null;
}

function buildDistribution(selectedDistribution) {
  return Object.fromEntries(gradeOrder.map((grade) => [
    grade,
    selectedDistribution.Dagilim.find((item) => item.HarfNotu === grade)?.Sayi ?? null,
  ]));
}

function shouldTrustMedium(courseCode) {
  return trustAllMedium || trustedMediumCodes?.has(courseCode);
}

function entryKey(entry) {
  return [
    normalizeCourseCode(entry.ders_kodu),
    normalizeName(entry.akademisyen),
    String(entry.yil ?? ''),
    normalizeTerm(entry.donem),
  ].join('|');
}

const dates = await fetchJson('https://raw.githubusercontent.com/keepdying/itu-web-archive/main/public/dates.json');
const targetCourses = courses.filter((course) => !onlyCodes || onlyCodes.has(`${course.kod}${course.no}`));
const existingEntries = Array.isArray(gradeData.dagilimlar) ? gradeData.dagilimlar : [];
const mergedEntries = [...existingEntries];
const indexByKey = new Map(mergedEntries.map((entry, index) => [entryKey(entry), index]));
const review = [];
const collected = [];

for (const course of targetCourses) {
  const courseCode = `${course.kod}${course.no}`;
  const obsDistributions = await fetchObsDistributions(course);
  const selectedDistribution = pickObsTerm(obsDistributions, course.donem);

  if (!selectedDistribution) {
    review.push({
      ders_kodu: courseCode,
      ders_adi: course.ders_adi,
      akademisyen: course.ogretim_uyesi,
      yil: course.yil,
      donem: course.donem,
      durum: 'OBS dağılımı bulunamadı.',
    });
    continue;
  }

  const archiveMatch = await findArchiveMatch(dates, course);
  const instructors = normalizeInstructors(course.ogretim_uyesi);
  const canonicalInstructor = instructors.find((name) => name && name !== '-') ?? '';
  const academicName = canonicalInstructor || archiveMatch.instructors[0] || '';
  const entry = {
    ders_kodu: courseCode,
    ders_adi: course.ders_adi,
    akademisyen: academicName,
    yil: selectedDistribution.YilAdi ?? course.yil,
    donem: normalizeTerm(selectedDistribution.DonemTipAdi) || normalizeTerm(course.donem),
    etiket: '',
    dagilim: buildDistribution(selectedDistribution),
  };

  collected.push({
    guven: archiveMatch.confidence,
    sebep: archiveMatch.reason,
    snapshot: archiveMatch.snapshot,
    sube_sayisi: archiveMatch.branchCount,
    arsiv_hocalari: archiveMatch.instructors,
    entry,
  });

  if (archiveMatch.confidence === 'high' || (archiveMatch.confidence === 'medium' && shouldTrustMedium(courseCode))) {
    const key = entryKey(entry);
    const existingIndex = indexByKey.get(key);
    if (existingIndex === undefined) {
      mergedEntries.push(entry);
      indexByKey.set(key, mergedEntries.length - 1);
    } else {
      mergedEntries[existingIndex] = { ...mergedEntries[existingIndex], ...entry };
    }
  } else {
    review.push({
      ders_kodu: courseCode,
      ders_adi: course.ders_adi,
      akademisyen: course.ogretim_uyesi,
      yil: course.yil,
      donem: course.donem,
      guven: archiveMatch.confidence,
      sebep: archiveMatch.reason,
      arsiv_hocalari: archiveMatch.instructors,
      snapshot: archiveMatch.snapshot,
      obs: {
        yil: selectedDistribution.YilAdi,
        donem: selectedDistribution.DonemTipAdi,
        toplam: selectedDistribution.ToplamAciklananOgrenci,
      },
    });
  }
}

console.log(`\nToplanan: ${collected.length}`);
console.log(`- yüksek güven: ${collected.filter((item) => item.guven === 'high').length}`);
console.log(`- orta güven: ${collected.filter((item) => item.guven === 'medium').length}`);
console.log(`- kontrol: ${review.length}`);

for (const item of collected) {
  console.log(`\n[${item.guven.toUpperCase()}] ${item.entry.ders_kodu} · ${item.entry.yil} ${item.entry.donem} · ${item.entry.akademisyen}`);
  console.log(`OBS toplam: ${Object.values(item.entry.dagilim).reduce((sum, value) => sum + Number(value ?? 0), 0)} · ${item.sebep}`);
}

if (review.length) {
  console.log('\nKontrol gerektirenler:');
  for (const item of review) {
    console.log(`- ${item.ders_kodu} · ${item.yil} ${item.donem}: ${item.durum ?? item.sebep}`);
  }
}

if (writeMode) {
  fs.writeFileSync(gradeDataPath, `${JSON.stringify({ dagilimlar: mergedEntries }, null, 2)}\n`, 'utf8');
  fs.writeFileSync(reviewPath, `${JSON.stringify(review, null, 2)}\n`, 'utf8');
  console.log(`\nYazıldı: ${gradeDataPath}`);
  console.log(`Kontrol raporu: ${reviewPath}`);
} else {
  console.log('\nDry-run tamam. Yazmak için: node scripts/topla-not-dagilimi.mjs --write');
}
