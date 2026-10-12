import courses from '../data/dersler.json' with { type: 'json' };

const baseUrl = 'https://obs.itu.edu.tr';
const minEnrollmentArg = process.argv.find((arg) => arg.startsWith('--min='));
const minEnrollment = Number(minEnrollmentArg?.replace('--min=', '')) || 25;
const compact = process.argv.includes('--compact');
const allSnapshots = process.argv.includes('--all-snapshots');
const onlyArg = process.argv.find((arg) => arg.startsWith('--only='));
const onlyCodes = onlyArg
  ? new Set(onlyArg.replace('--only=', '').split(',').map((code) => code.trim()).filter(Boolean))
  : null;
const multiCrnSumCourseCodes = new Set(['UZB415E', 'UZB416E', 'UZB419E', 'UZB420E']);

const programs = [
  { code: 'UZBE_LS', facultyId: 13, type: 'lisans' },
  { code: 'UZB_LS', facultyId: 13, type: 'lisans' },
];

function normalizeCourseCode(value) {
  return String(value ?? '').replace(/\s+/g, '').trim().toLocaleUpperCase('tr');
}

function normalizeCourseFamily(value) {
  return normalizeCourseCode(value).replace(/E$/, '');
}

function normalizeName(value) {
  return String(value ?? '').toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim();
}

function normalizeTitle(value) {
  return String(value ?? '')
    .toLocaleLowerCase('tr')
    .replace(/&/g, ' and ')
    .replace(/\bctrl\b/g, 'control')
    .replace(/\bapplic\b/g, 'applications')
    .replace(/\bint\b/g, 'introduction')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleTokens(value) {
  const stopWords = new Set(['with', 'and', 'the', 'course', 'dersi', 'giris', 'introduction']);
  return normalizeTitle(value)
    .split(' ')
    .filter((token) => token.length >= 4 && !stopWords.has(token));
}

function tokenMatches(expectedToken, actualTokens) {
  return actualTokens.some((actualToken) =>
    actualToken === expectedToken ||
    actualToken.startsWith(expectedToken.slice(0, Math.min(6, expectedToken.length))) ||
    expectedToken.startsWith(actualToken.slice(0, Math.min(6, actualToken.length)))
  );
}

function titleScore(left, right) {
  const expectedTokens = titleTokens(left);
  const actualTokens = titleTokens(right);
  if (!expectedTokens.length || !actualTokens.length) return 0;
  const expectedSequence = titleSequence(left);
  const actualSequence = titleSequence(right);
  if (expectedSequence && actualSequence && expectedSequence !== actualSequence) return 0;
  const matched = expectedTokens.filter((token) => tokenMatches(token, actualTokens)).length;
  return Number((matched / expectedTokens.length).toFixed(3));
}

function titleSequence(value) {
  const normalized = ` ${normalizeTitle(value)} `;
  if (/\b(ii|2)\b/.test(normalized)) return '2';
  if (/\b(i|1)\b/.test(normalized)) return '1';
  return '';
}

function titleScoreForCourse(planCourse, course) {
  const candidates = [course.ders_adi_en, course.ders_adi].filter(Boolean);
  return Math.max(...candidates.map((title) => titleScore(title, planCourse.title)), 0);
}

function parseEnrollment(value) {
  return Number(String(value ?? '0').replace(/[^\d.-]/g, '')) || 0;
}

function normalizeTerm(value) {
  const normalized = String(value ?? '').toLocaleLowerCase('tr');
  if (normalized.includes('güz') || normalized.includes('guz') || normalized.includes('fall')) return 'Güz';
  if (normalized.includes('bahar') || normalized.includes('spring')) return 'Bahar';
  if (normalized.includes('yaz') || normalized.includes('summer')) return 'Yaz';
  return String(value ?? '');
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
    selected.set(label, { ...candidates[0], label, target });
  };

  for (const year of years) {
    pickClosest(`${year}-${year + 1} Güz`, `${year}-10-15`, `${year}-09-01`, `${year}-11-15`);
    pickClosest(`${year - 1}-${year} Bahar`, `${year}-04-15`, `${year}-03-01`, `${year}-05-20`);
    pickClosest(`${year - 1}-${year} Yaz`, `${year}-07-15`, `${year}-07-01`, `${year}-08-15`);
  }

  return [...selected.values()].sort((left, right) => left.value.localeCompare(right.value));
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

async function fetchText(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.text();
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}

function extractPlanIds(html) {
  return [...new Set([...html.matchAll(/DersPlanDetay\/(\d+)/g)].map((match) => match[1]))];
}

function stripTags(value) {
  return String(value ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x131;/g, 'ı')
    .replace(/&#x130;/g, 'İ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractPlanCourses(html, planId) {
  const text = stripTags(html);
  const coursePattern = /\b([A-ZÇĞİÖŞÜ]{2,5})\s*(\d{3,4}E?)\b\s+([^|]{4,120}?)(?=\s+\d+(?:,\d+)?\s+\d+(?:,\d+)?|\s+[A-ZÇĞİÖŞÜ]{2,5}\s*\d{3,4}E?\b|$)/g;
  const courses = [];
  for (const match of text.matchAll(coursePattern)) {
    const code = normalizeCourseCode(`${match[1]}${match[2]}`);
    const title = String(match[3] ?? '').replace(/\s+/g, ' ').trim();
    if (!title || title.length < 4) continue;
    courses.push({ planId, code, title });
  }
  return courses;
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
  const url = `${baseUrl}/public/DersNotDagilimi/NotDagilimiSearch?bransKodu=${branchCode}&dersNo=${courseNo}&yil=${obsYear}`;
  const response = await fetch(url, {
    headers: {
      'x-requested-with': 'XMLHttpRequest',
      referer: `${baseUrl}/public/DersNotDagilimi?bransKodu=${branchCode}&dersNo=${courseNo}&yil=${obsYear}`,
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
  const distributions = await fetchObsDistributions(courseCode, year);
  const distribution = distributions.find((item) => normalizeTerm(item.DonemTipAdi) === term);
  if (!distribution) return { found: false, accepted: false };
  const total = getDistributionTotal(distribution);
  const ratio = enrolled ? total / enrolled : null;
  const absoluteDifference = Math.abs(total - enrolled);
  const accepted = total >= minEnrollment && Boolean(ratio) && (absoluteDifference <= 5 || (ratio >= 0.85 && ratio <= 1.15));
  return {
    found: true,
    accepted,
    year: distribution.YilAdi ?? year,
    term: normalizeTerm(distribution.DonemTipAdi) || term,
    total,
    enrolled,
    absoluteDifference,
    ratio: ratio === null ? null : Number(ratio.toFixed(3)),
  };
}

async function fetchPlanCourses() {
  const planCourses = [];
  for (const program of programs) {
    const listHtml = await fetchText(`${baseUrl}/public/DersPlan/DersPlanlariList?PlanTipiKodu=${program.type}&programKodu=${program.code}&FakulteId=${program.facultyId}`);
    const planIds = extractPlanIds(listHtml);
    for (const planId of planIds) {
      const detailHtml = await fetchText(`${baseUrl}/public/DersPlan/DersPlanDetay/${planId}`);
      for (const course of extractPlanCourses(detailHtml, planId)) {
        planCourses.push({ ...course, program: program.code });
      }
    }
  }
  const unique = new Map();
  for (const course of planCourses) {
    unique.set(`${course.program}|${course.planId}|${course.code}|${normalizeTitle(course.title)}`, course);
  }
  return [...unique.values()];
}

const activeCourses = courses
  .filter((course) => course.ogretim_uyesi && course.ogretim_uyesi !== '-' && !String(course.kategori ?? '').includes('Yüksek Lisans'))
  .filter((course) => !onlyCodes || onlyCodes.has(normalizeCourseCode(`${course.kod}${course.no}`)));

const allDates = await fetchJson('https://raw.githubusercontent.com/keepdying/itu-web-archive/main/public/dates.json');
const dates = allSnapshots ? allDates : selectRepresentativeSnapshots(allDates);
const planCourses = await fetchPlanCourses();
const aliasCandidates = [];

for (const course of activeCourses) {
  const currentCode = normalizeCourseCode(`${course.kod}${course.no}`);
  const currentFamily = normalizeCourseFamily(currentCode);
  const candidates = planCourses
    .map((planCourse) => ({
      ...planCourse,
      score: titleScoreForCourse(planCourse, course),
    }))
    .filter((planCourse) =>
      planCourse.score >= 0.72 &&
      normalizeCourseFamily(planCourse.code) !== currentFamily &&
      normalizeCourseCode(planCourse.code).match(/^[A-Z]+[0-9]+E?$/)
    )
    .sort((left, right) => right.score - left.score);

  const grouped = new Map();
  for (const candidate of candidates) {
    if (!grouped.has(candidate.code)) grouped.set(candidate.code, candidate);
  }

  for (const candidate of grouped.values()) {
    aliasCandidates.push({
      currentCode,
      currentTitle: course.ders_adi,
      currentTitleEn: course.ders_adi_en,
      instructor: course.ogretim_uyesi,
      oldCode: candidate.code,
      oldTitle: candidate.title,
      score: candidate.score,
      planId: candidate.planId,
      program: candidate.program,
    });
  }
}

const report = [];

for (const candidate of aliasCandidates) {
  const branchCode = candidate.oldCode.match(/^[A-Z]+/)?.[0] ?? '';
  const expectedInstructor = normalizeName(candidate.instructor);
  const hits = [];

  for (const snapshot of dates) {
    const rows = await fetchArchiveRows(snapshot.value, branchCode);
    const exactRows = rows.filter((row) => normalizeCourseCode(row['Course Code']) === candidate.oldCode);
    const sameFamilyRows = rows.filter((row) => normalizeCourseFamily(row['Course Code']) === normalizeCourseFamily(candidate.oldCode));
    const rowsForHit =
      exactRows.length === 1 && sameFamilyRows.length === 1
        ? exactRows
        : multiCrnSumCourseCodes.has(candidate.oldCode) && exactRows.length > 1 && exactRows.length === sameFamilyRows.length
          ? exactRows
          : [];
    if (!rowsForHit.length) continue;
    const row = rowsForHit[0];
    const enrolled = rowsForHit.reduce((sum, item) => sum + parseEnrollment(item.Enrolled), 0);
    if (enrolled < minEnrollment) continue;
    const instructors = [...new Set(rowsForHit.map((item) => normalizeName(item.Instructor)).filter(Boolean))];
    if (instructors.length !== 1 || instructors[0] !== expectedInstructor) continue;
    const term = termFromSnapshot(snapshot.value);
    const obs = await getObsCheck(candidate.oldCode, term, enrolled);
    if (!obs.accepted) continue;
    hits.push({
      snapshot: snapshot.value,
      term: obs.year && obs.term ? `${obs.year} ${obs.term}` : term,
      crn: rowsForHit.map((item) => item.CRN).filter(Boolean).join('+'),
      enrolled,
      obsTotal: obs.total,
      ratio: obs.ratio,
      archiveTitle: row['Course Title'],
    });
  }

  if (hits.length) {
    report.push({
      ...candidate,
      hitCount: hits.length,
      hits,
    });
  }
}

report.sort((left, right) => right.hitCount - left.hitCount || right.score - left.score || left.currentCode.localeCompare(right.currentCode));

if (compact) {
  console.log(JSON.stringify({
    minEnrollment,
    snapshotMode: allSnapshots ? 'all' : 'representative',
    activeCourses: activeCourses.length,
    planCourses: planCourses.length,
    aliasCandidates: aliasCandidates.length,
    acceptedAliasCourses: report.length,
    acceptedAliases: report.map((item) => ({
      currentCode: item.currentCode,
      currentTitle: item.currentTitle,
      oldCode: item.oldCode,
      oldTitle: item.oldTitle,
      score: item.score,
      instructor: item.instructor,
      hitCount: item.hitCount,
      hits: item.hits,
    })),
  }, null, 2));
} else {
  console.log(JSON.stringify({
    minEnrollment,
    snapshotMode: allSnapshots ? 'all' : 'representative',
    activeCourses: activeCourses.length,
    planCourses,
    aliasCandidates,
    report,
  }, null, 2));
}
