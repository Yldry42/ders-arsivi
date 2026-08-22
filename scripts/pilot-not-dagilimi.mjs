import courses from '../data/dersler.json' with { type: 'json' };

const examples = new Set(['UZB421E', 'UZB441E', 'UZB352E']);

const gradeOrder = ['AA', 'BA+', 'BA', 'BB+', 'BB', 'CB+', 'CB', 'CC+', 'CC', 'DC+', 'DC', 'DD+', 'DD', 'FF', 'VF'];

async function fetchArchiveDates() {
  const response = await fetch('https://raw.githubusercontent.com/keepdying/itu-web-archive/main/public/dates.json');
  return response.json();
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
  const normalizedTerm = String(term).toLocaleLowerCase('tr');
  const dated = dates.map((item) => ({ ...item, time: new Date(`${item.value}T00:00:00Z`).getTime() }));

  const inRange = (from, to) => dated.filter((item) => item.time >= from.getTime() && item.time <= to.getTime());

  if (normalizedTerm.includes('güz')) {
    return inRange(new Date(`${start}-08-01T00:00:00Z`), new Date(`${end}-01-31T23:59:59Z`));
  }

  if (normalizedTerm.includes('bahar')) {
    return inRange(new Date(`${end}-01-01T00:00:00Z`), new Date(`${end}-06-15T23:59:59Z`));
  }

  if (normalizedTerm.includes('yaz')) {
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
  const url = `https://raw.githubusercontent.com/keepdying/itu-web-archive/main/public/${date}/${branchCode}.csv`;
  const response = await fetch(url);
  if (!response.ok) return [];

  const rows = parseCsv(await response.text());
  const header = rows[0] ?? [];
  return rows.slice(1).map((row) => Object.fromEntries(header.map((name, index) => [name, row[index] ?? ''])));
}

async function findArchiveMatches(branchCode, courseCode, dates) {
  const results = [];

  for (const date of dates) {
    const rows = await fetchArchiveRows(date.value, branchCode);
    const matches = rows.filter((row) => normalizeCourseCode(row['Course Code']) === courseCode);
    if (matches.length) {
      results.push({
        date: date.value,
        matches,
        instructors: [...new Set(matches.map((row) => row.Instructor).filter(Boolean))],
      });
    }
  }

  return results;
}

async function fetchObsDistributions(branchCode, courseNo, obsYear) {
  const url = `https://obs.itu.edu.tr/public/DersNotDagilimi/NotDagilimiSearch?bransKodu=${branchCode}&dersNo=${courseNo}&yil=${obsYear}`;
  const response = await fetch(url, {
    headers: {
      'x-requested-with': 'XMLHttpRequest',
      referer: `https://obs.itu.edu.tr/public/DersNotDagilimi?bransKodu=${branchCode}&dersNo=${courseNo}&yil=${obsYear}`,
    },
  });

  const html = await response.text();
  const match = html.match(/const ALL_DATA = (\[.*?\]);/s);
  return match ? JSON.parse(match[1]) : [];
}

function getObsYear(courseYear) {
  const years = String(courseYear).match(/\d{4}/g);
  return Number(years?.at(-1) ?? years?.[0] ?? 0);
}

function normalizeCourseCode(value) {
  return String(value).replace(/\s+/g, '').trim();
}

function pickObsTerm(distributions, term) {
  const normalizedTerm = term.toLocaleLowerCase('tr');
  const keyword = normalizedTerm.includes('bahar') ? 'bahar' : normalizedTerm.includes('güz') ? 'güz' : normalizedTerm.includes('yaz') ? 'yaz' : '';
  return distributions.find((item) => item.DonemTipAdi.toLocaleLowerCase('tr').includes(keyword)) ?? distributions[0];
}

const archiveDates = await fetchArchiveDates();

for (const course of courses.filter((item) => examples.has(`${item.kod}${item.no}`))) {
  const courseCode = `${course.kod}${course.no}`;
  const courseNo = String(course.no).replace(/\D/g, '');
  const obsYear = getObsYear(course.yil);
  const snapshotCandidates = getSemesterSnapshotCandidates(archiveDates, course.yil, course.donem);

  console.log(`\n### ${courseCode} — ${course.ders_adi}`);
  console.log(`Dersler.json: ${course.yil} ${course.donem} · ${course.ogretim_uyesi}`);

  let selectedArchiveMatch = null;

  for (const snapshot of snapshotCandidates) {
    const archiveRows = await fetchArchiveRows(snapshot.value, course.kod);
    const matches = archiveRows.filter((row) => normalizeCourseCode(row['Course Code']) === courseCode);
    if (matches.length) {
      selectedArchiveMatch = {
        snapshot: snapshot.value,
        matches,
        instructors: [...new Set(matches.map((row) => row.Instructor).filter(Boolean))],
      };
      break;
    }
  }

  const allArchiveMatches = selectedArchiveMatch ? [] : await findArchiveMatches(course.kod, courseCode, archiveDates);
  const instructors = selectedArchiveMatch?.instructors ?? [];

  console.log(
    selectedArchiveMatch
      ? `Arşiv: ${selectedArchiveMatch.snapshot} · ${selectedArchiveMatch.matches.length} şube · ${instructors.join(' | ')}`
      : `Arşiv: ${snapshotCandidates.map((item) => item.value).join(', ') || 'dönem snapshot yok'} · hoca yok`,
  );
  if (!selectedArchiveMatch && allArchiveMatches.length) {
    console.log('Diğer arşiv tarihlerinde bulunanlar:');
    for (const item of allArchiveMatches) {
      console.log(`- ${item.date}: ${item.matches.length} şube · ${item.instructors.join(' | ')}`);
    }
  }
  console.log(`Otomatik güven: ${instructors.length === 1 ? 'EVET, tek hoca' : 'HAYIR, manuel kontrol'}`);

  const obsDistributions = await fetchObsDistributions(course.kod, courseNo, obsYear);
  const selectedDistribution = pickObsTerm(obsDistributions, course.donem);

  if (!selectedDistribution) {
    console.log(`OBS: ${course.kod} ${courseNo}, yıl=${obsYear} için dağılım bulunamadı.`);
    continue;
  }

  const distribution = Object.fromEntries(gradeOrder.map((grade) => [
    grade,
    selectedDistribution.Dagilim.find((item) => item.HarfNotu === grade)?.Sayi ?? null,
  ]));

  console.log(`OBS: ${selectedDistribution.YilAdi} · ${selectedDistribution.DonemTipAdi} · ${selectedDistribution.ToplamAciklananOgrenci} öğrenci`);
  console.log(JSON.stringify(distribution, null, 2));
}
