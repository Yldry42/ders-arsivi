import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import courses from '../data/dersler.json' with { type: 'json' };
import gradeData from '../data/not-dagilimlari.json' with { type: 'json' };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const gradeDataPath = path.join(repoRoot, 'data', 'not-dagilimlari.json');

const minEnrollmentArg = process.argv.find((arg) => arg.startsWith('--min='));
const minEnrollment = Number(minEnrollmentArg?.replace('--min=', '')) || 10;

const includeMasters = process.argv.includes('--include-masters');
const allSnapshots = process.argv.includes('--all-snapshots');
const withObs = process.argv.includes('--with-obs');
const compact = process.argv.includes('--compact');
const writeAccepted = process.argv.includes('--write-accepted');
const titleAliases = process.argv.includes('--title-aliases');
const allInstructors = process.argv.includes('--all-instructors');
const onlyArg = process.argv.find((arg) => arg.startsWith('--only='));
const onlyCodes = onlyArg
  ? new Set(onlyArg.replace('--only=', '').split(',').map((code) => code.trim()).filter(Boolean))
  : null;
const multiCrnSumCourseCodes = new Set(['UZB419E', 'UZB420E', 'UZB415E', 'UZB416E']);
const courseCodeAliases = {
  UZB419E: [
    {
      code: 'UZB415E',
      name: 'Spacecraft Systems Design I',
      note: 'Eski kod: UZB415E',
    },
  ],
  UZB420E: [
    {
      code: 'UZB416E',
      name: 'Spacecraft Systems Design II',
      note: 'Eski kod: UZB416E',
    },
  ],
};

function normalizeCourseCode(value) {
  return String(value ?? '').replace(/\s+/g, '').trim();
}

function normalizeCourseFamily(value) {
  return normalizeCourseCode(value).replace(/E$/, '');
}

function getBranchCode(courseCode) {
  return String(courseCode).match(/^[A-Z]+/)?.[0] ?? '';
}

function normalizeName(value) {
  return String(value ?? '').toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim();
}

function isKnownInstructorName(value) {
  const normalized = normalizeName(value);
  return Boolean(normalized) &&
    normalized !== '-' &&
    !normalized.includes('***') &&
    !normalized.includes(',') &&
    !normalized.includes(' ve ') &&
    !normalized.includes(' and ') &&
    !normalized.includes('&');
}

function parseEnrollment(value) {
  return Number(String(value ?? '0').replace(/[^\d.-]/g, '')) || 0;
}

function normalizeTitle(value) {
  return String(value ?? '')
    .toLocaleLowerCase('tr')
    .replace(/&/g, ' and ')
    .replace(/\bctrl\b/g, 'control')
    .replace(/\bapplic\b/g, 'applications')
    .replace(/\bint\b/g, 'introduction')
    .replace(/[^a-z0-9çğıöşü]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleTokens(value) {
  return normalizeTitle(value)
    .split(' ')
    .filter((token) => token.length >= 4 && !['with', 'and', 'the', 'course'].includes(token));
}

function tokenMatches(expectedToken, actualTokens) {
  return actualTokens.some((actualToken) =>
    actualToken === expectedToken ||
    actualToken.startsWith(expectedToken.slice(0, Math.min(6, expectedToken.length))) ||
    expectedToken.startsWith(actualToken.slice(0, Math.min(6, actualToken.length)))
  );
}

function titleMatchesCourse(rowTitle, course) {
  const actualTokens = titleTokens(rowTitle);
  if (!actualTokens.length) return false;

  const candidateTitles = [course.ders_adi_en, course.ders_adi].filter(Boolean);
  return candidateTitles.some((title) => {
    const expectedTokens = titleTokens(title);
    if (!expectedTokens.length) return false;
    const matched = expectedTokens.filter((token) => tokenMatches(token, actualTokens)).length;
    return matched >= Math.min(2, expectedTokens.length) && matched / expectedTokens.length >= 0.55;
  });
}

function normalizeTerm(value) {
  const normalized = String(value ?? '').toLocaleLowerCase('tr');
  if (normalized.includes('güz') || normalized.includes('guz') || normalized.includes('fall')) return 'Güz';
  if (normalized.includes('bahar') || normalized.includes('spring')) return 'Bahar';
  if (normalized.includes('yaz') || normalized.includes('summer')) return 'Yaz';
  return String(value ?? '');
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

function termFromSnapshot(date) {
  const match = String(date).match(/^(\d{4})-(\d{2})/);
  if (!match) return '';
  const year = Number(match[1]);
  const month = Number(match[2]);

  if (month >= 8 && month <= 12) return `${year}-${year + 1} Güz`;
  if (month >= 1 && month <= 6) return `${year - 1}-${year} Bahar`;
  return `${year - 1}-${year} Yaz`;
}

function parseTermLabel(label) {
  const year = String(label ?? '').match(/\d{4}-\d{4}/)?.[0] ?? '';
  const term = normalizeTerm(label);
  return { year, term };
}

function getObsYear(academicYear) {
  const years = String(academicYear).match(/\d{4}/g);
  return Number(years?.at(-1) ?? years?.[0] ?? 0);
}

function getTime(date) {
  return new Date(`${date}T00:00:00Z`).getTime();
}

function selectRepresentativeSnapshots(dates) {
  const dated = dates
    .map((item) => ({ ...item, time: getTime(item.value) }))
    .filter((item) => Number.isFinite(item.time));
  const years = [...new Set(dated.map((item) => Number(String(item.value).slice(0, 4))))].sort((left, right) => left - right);
  const selected = new Map();

  const pickClosest = (label, target, from, to) => {
    const candidates = dated.filter((item) => item.time >= getTime(from) && item.time <= getTime(to));
    if (!candidates.length) return;

    candidates.sort((left, right) => Math.abs(left.time - getTime(target)) - Math.abs(right.time - getTime(target)));
    selected.set(label, {
      ...candidates[0],
      label,
      target,
    });
  };

  for (const year of years) {
    pickClosest(`${year}-${year + 1} Güz`, `${year}-10-15`, `${year}-09-01`, `${year}-11-15`);
    pickClosest(`${year - 1}-${year} Bahar`, `${year}-04-15`, `${year}-03-01`, `${year}-05-20`);
    pickClosest(`${year - 1}-${year} Yaz`, `${year}-07-15`, `${year}-07-01`, `${year}-08-15`);
  }

  return [...selected.values()].sort((left, right) => left.value.localeCompare(right.value));
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}

const archiveCache = new Map();

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

const obsCache = new Map();
const gradeOrder = ['AA', 'BA+', 'BA', 'BB+', 'BB', 'CB+', 'CB', 'CC+', 'CC', 'DC+', 'DC', 'DD+', 'DD', 'FF', 'VF'];

async function fetchObsDistributions(courseCode, academicYear) {
  const branchCode = String(courseCode).match(/^[A-Z]+/)?.[0] ?? '';
  const courseNo = String(courseCode).replace(/^[A-Z]+/, '').replace(/\D/g, '');
  const obsYear = getObsYear(academicYear);
  const cacheKey = `${branchCode}${courseNo}/${obsYear}`;
  if (obsCache.has(cacheKey)) return obsCache.get(cacheKey);

  const url = `https://obs.itu.edu.tr/public/DersNotDagilimi/NotDagilimiSearch?bransKodu=${branchCode}&dersNo=${courseNo}&yil=${obsYear}`;
  const response = await fetch(url, {
    headers: {
      'x-requested-with': 'XMLHttpRequest',
      referer: `https://obs.itu.edu.tr/public/DersNotDagilimi?bransKodu=${branchCode}&dersNo=${courseNo}&yil=${obsYear}`,
    },
  });

  if (!response.ok) {
    obsCache.set(cacheKey, []);
    return [];
  }

  const html = await response.text();
  const match = html.match(/const ALL_DATA = (\[.*?\]);/s);
  const distributions = match ? JSON.parse(match[1]) : [];
  obsCache.set(cacheKey, distributions);
  return distributions;
}

function buildDistribution(distribution) {
  return Object.fromEntries(gradeOrder.map((grade) => [
    grade,
    distribution.Dagilim.find((item) => item.HarfNotu === grade)?.Sayi ?? null,
  ]));
}

function getDistributionTotal(distribution) {
  return Number(distribution?.ToplamAciklananOgrenci) ||
    Object.values(buildDistribution(distribution)).reduce((sum, value) => sum + Number(value ?? 0), 0);
}

async function getObsCheck(courseCode, termLabel, enrolled) {
  const { year, term } = parseTermLabel(termLabel);
  if (!year || !term) {
    return { found: false, accepted: false, reason: 'Dönem etiketi okunamadı.' };
  }

  const distributions = await fetchObsDistributions(courseCode, year);
  const distribution = distributions.find((item) => normalizeTerm(item.DonemTipAdi) === term);
  if (!distribution) {
    return { found: false, accepted: false, year, term, reason: 'OBS harf notu dağılımı bulunamadı.' };
  }

  const total = getDistributionTotal(distribution);
  const ratio = enrolled ? total / enrolled : null;
  const absoluteDifference = Math.abs(total - enrolled);
  const accepted =
    total >= minEnrollment &&
    Boolean(ratio) &&
    (absoluteDifference <= 5 || (ratio >= 0.85 && ratio <= 1.15));

  return {
    found: true,
    accepted,
    year: distribution.YilAdi ?? year,
    term: normalizeTerm(distribution.DonemTipAdi) || term,
    total,
    enrolled,
    absoluteDifference,
    ratio: ratio === null ? null : Number(ratio.toFixed(3)),
    reason: accepted
      ? 'OBS toplamı arşiv yazılan sayısıyla uyumlu.'
      : 'OBS toplamı yok/düşük ya da arşiv yazılan sayısıyla uyumsuz.',
    distribution: buildDistribution(distribution),
  };
}

const targetCourses = courses.filter((course) => {
  const code = normalizeCourseCode(`${course.kod}${course.no}`);
  if (onlyCodes && !onlyCodes.has(code)) return false;
  if (!course.ogretim_uyesi || course.ogretim_uyesi === '-') return false;
  if (!includeMasters && String(course.kategori ?? '').includes('Yüksek Lisans')) return false;
  return true;
});

const allDates = await fetchJson('https://raw.githubusercontent.com/keepdying/itu-web-archive/main/public/dates.json');
const dates = allSnapshots ? allDates : selectRepresentativeSnapshots(allDates);
const report = [];

for (const course of targetCourses) {
  const courseCode = normalizeCourseCode(`${course.kod}${course.no}`);
  const expectedInstructor = normalizeName(course.ogretim_uyesi);
  const hits = [];
  const candidateCodes = [
    { code: courseCode, aliasNote: '', aliasName: '' },
    ...(courseCodeAliases[courseCode] ?? []).map((alias) => ({
      code: normalizeCourseCode(alias.code),
      aliasNote: alias.note ?? `Eski kod: ${normalizeCourseCode(alias.code)}`,
      aliasName: alias.name ?? '',
    })),
  ];

  for (const snapshot of dates) {
    for (const candidate of candidateCodes) {
      const sourceCourseCode = candidate.code;
      const branchCode = getBranchCode(sourceCourseCode);
      const rows = await fetchArchiveRows(snapshot.value, branchCode);
      const sameFamilyMatches = rows.filter((row) => normalizeCourseFamily(row['Course Code']) === normalizeCourseFamily(sourceCourseCode));
      const matches = sameFamilyMatches.filter((row) => normalizeCourseCode(row['Course Code']) === sourceCourseCode);
      const titleMatches = titleAliases && !candidate.aliasNote
        ? rows.filter((row) => titleMatchesCourse(row['Course Title'], course))
        : [];

      let rowsForHit = [];
      let matchType = '';

      if (sameFamilyMatches.length === 1 && matches.length === 1) {
        rowsForHit = [matches[0]];
        matchType = candidate.aliasNote ? 'alias-code' : 'code';
      } else if (
        multiCrnSumCourseCodes.has(sourceCourseCode) &&
        matches.length > 1 &&
        matches.length === sameFamilyMatches.length
      ) {
        rowsForHit = matches;
        matchType = candidate.aliasNote ? 'alias-multi-crn' : 'multi-crn';
      } else if (!sameFamilyMatches.length && titleMatches.length === 1) {
        rowsForHit = [titleMatches[0]];
        matchType = 'title';
      }

      if (!rowsForHit.length) continue;

      const instructorNames = [...new Set(rowsForHit.map((row) => row.Instructor).filter(isKnownInstructorName))];
      const instructors = [...new Set(instructorNames.map(normalizeName))];
      if (instructors.length !== 1) continue;
      if (!allInstructors && instructors[0] !== expectedInstructor) continue;

      const enrolled = rowsForHit.reduce((sum, row) => sum + parseEnrollment(row.Enrolled), 0);
      if (enrolled < minEnrollment) continue;
      const sourceCodes = [...new Set(rowsForHit.map((row) => normalizeCourseCode(row['Course Code'])).filter(Boolean))];

      hits.push({
        snapshot: snapshot.value,
        term: termFromSnapshot(snapshot.value),
        sourceCode: sourceCodes[0] ?? sourceCourseCode,
        matchType,
        aliasNote: candidate.aliasNote,
        aliasName: candidate.aliasName,
        crn: rowsForHit.map((row) => row.CRN).filter(Boolean).join('+'),
        title: rowsForHit[0]['Course Title'],
        instructor: instructorNames[0] ?? rowsForHit[0].Instructor,
        enrolled,
      });
    }
  }

  if (hits.length) {
    if (withObs) {
      for (const hit of hits) {
        hit.obs = await getObsCheck(hit.sourceCode ?? courseCode, hit.term, hit.enrolled);
      }
    }

    hits.sort((left, right) => right.enrolled - left.enrolled || right.snapshot.localeCompare(left.snapshot));
    report.push({
      code: courseCode,
      name: course.ders_adi,
      instructor: course.ogretim_uyesi,
      hitCount: hits.length,
      acceptedObsCount: withObs ? hits.filter((hit) => hit.obs?.accepted).length : undefined,
      acceptedHits: withObs ? hits.filter((hit) => hit.obs?.accepted) : undefined,
      best: hits[0],
      recent: [...hits].sort((left, right) => right.snapshot.localeCompare(left.snapshot)).slice(0, 3),
    });
  }
}

const output = {
  minEnrollment,
  snapshotMode: allSnapshots ? 'all' : 'representative',
  obsChecked: withObs,
  selectedSnapshots: dates.map((date) => ({
    label: date.label ?? termFromSnapshot(date.value),
    value: date.value,
    target: date.target ?? null,
  })),
  scanned: targetCourses.length,
  matched: report.length,
  acceptedWithObs: withObs ? report.reduce((sum, item) => sum + item.acceptedObsCount, 0) : undefined,
  report,
};

function entryKey(entry) {
  return [
    normalizeCourseCode(entry.ders_kodu),
    normalizeName(entry.akademisyen),
    String(entry.yil ?? ''),
    normalizeTerm(entry.donem),
  ].join('|');
}

if (writeAccepted) {
  if (!withObs) {
    throw new Error('--write-accepted için --with-obs gerekli.');
  }

  const mergedEntries = Array.isArray(gradeData.dagilimlar) ? [...gradeData.dagilimlar] : [];
  const indexByKey = new Map(mergedEntries.map((entry, index) => [entryKey(entry), index]));
  const acceptedEntries = report.flatMap((item) =>
    (item.acceptedHits ?? []).map((hit) => ({
      ders_kodu: item.code,
      ders_adi: item.name,
      akademisyen: hit.instructor ?? item.instructor,
      yil: hit.obs.year,
      donem: hit.obs.term,
      etiket: hit.aliasNote ?? '',
      dagilim: hit.obs.distribution,
    }))
  );

  for (const entry of acceptedEntries) {
    const key = entryKey(entry);
    const existingIndex = indexByKey.get(key);
    if (existingIndex === undefined) {
      mergedEntries.push(entry);
      indexByKey.set(key, mergedEntries.length - 1);
    } else {
      mergedEntries[existingIndex] = { ...mergedEntries[existingIndex], ...entry };
    }
  }

  fs.writeFileSync(gradeDataPath, `${JSON.stringify({ dagilimlar: mergedEntries }, null, 2)}\n`, 'utf8');
  console.error(`Yazıldı: ${gradeDataPath}`);
  console.error(`Eklenen/güncellenen güvenli dağılım: ${acceptedEntries.length}`);
}

if (compact) {
  console.log(JSON.stringify({
    minEnrollment: output.minEnrollment,
    snapshotMode: output.snapshotMode,
    obsChecked: output.obsChecked,
    scanned: output.scanned,
    matched: output.matched,
    acceptedWithObs: output.acceptedWithObs,
    accepted: report.flatMap((item) =>
      (item.acceptedHits ?? item.recent)
        .map((hit) => ({
          code: item.code,
          name: item.name,
          instructor: hit.instructor ?? item.instructor,
          sourceCode: hit.sourceCode ?? item.code,
          matchType: hit.matchType ?? 'code',
          aliasNote: hit.aliasNote ?? '',
          term: hit.obs?.year && hit.obs?.term ? `${hit.obs.year} ${hit.obs.term}` : hit.term,
          snapshot: hit.snapshot,
          crn: hit.crn,
          enrolled: hit.enrolled,
          obsTotal: hit.obs?.total ?? null,
          ratio: hit.obs?.ratio ?? null,
        }))
    ),
    rejectedCourses: report
      .filter((item) => withObs && item.acceptedObsCount === 0)
      .map((item) => ({ code: item.code, name: item.name, instructor: item.instructor, hitCount: item.hitCount })),
  }, null, 2));
} else {
  console.log(JSON.stringify(output, null, 2));
}
