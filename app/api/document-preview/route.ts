import { inflateRawSync } from 'node:zlib';
import { NextRequest } from 'next/server';

export const runtime = 'nodejs';

const allowedArchiveHost = 'pub-9166db2e46694c818420c32e7545d40c.r2.dev';

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const decodeXml = (value: string) =>
  value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

const highlight = (value: string, query: string) => {
  const safeValue = escapeHtml(value);
  const safeQuery = query.trim();
  if (!safeQuery) return safeValue;

  return safeValue.replace(new RegExp(`(${escapeRegExp(escapeHtml(safeQuery))})`, 'gi'), '<mark>$1</mark>');
};

const getFileExtension = (fileName: string) => fileName.split('.').pop()?.toLowerCase() ?? '';

const getXmlTextValues = (xml: string, prefix: string) =>
  [...xml.matchAll(new RegExp(`<${prefix}:t(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${prefix}:t>`, 'g'))]
    .map((match) => decodeXml(match[1]))
    .join('');

function readZipEntries(buffer: Buffer) {
  const entries = new Map<string, Buffer>();
  const endSignature = 0x06054b50;
  let endOffset = -1;

  for (let offset = buffer.length - 22; offset >= 0; offset -= 1) {
    if (buffer.readUInt32LE(offset) === endSignature) {
      endOffset = offset;
      break;
    }
  }

  if (endOffset < 0) throw new Error('ZIP end record not found.');

  const totalEntries = buffer.readUInt16LE(endOffset + 10);
  let centralOffset = buffer.readUInt32LE(endOffset + 16);

  for (let index = 0; index < totalEntries; index += 1) {
    if (buffer.readUInt32LE(centralOffset) !== 0x02014b50) break;

    const method = buffer.readUInt16LE(centralOffset + 10);
    const compressedSize = buffer.readUInt32LE(centralOffset + 20);
    const fileNameLength = buffer.readUInt16LE(centralOffset + 28);
    const extraLength = buffer.readUInt16LE(centralOffset + 30);
    const commentLength = buffer.readUInt16LE(centralOffset + 32);
    const localHeaderOffset = buffer.readUInt32LE(centralOffset + 42);
    const fileName = buffer.slice(centralOffset + 46, centralOffset + 46 + fileNameLength).toString('utf8');

    const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataOffset = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const compressedData = buffer.slice(dataOffset, dataOffset + compressedSize);

    if (method === 0) {
      entries.set(fileName, compressedData);
    } else if (method === 8) {
      entries.set(fileName, inflateRawSync(compressedData));
    }

    centralOffset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

const extractDocxParagraphs = (entries: Map<string, Buffer>) => {
  const documentXml = entries.get('word/document.xml')?.toString('utf8');
  if (!documentXml) throw new Error('DOCX document XML not found.');

  const paragraphs = [...documentXml.matchAll(/<w:p[\s\S]*?<\/w:p>/g)]
    .map(([paragraph]) => getXmlTextValues(paragraph, 'w'))
    .map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  return paragraphs.length ? paragraphs : ['Bu DOCX dosyasında okunabilir metin bulunamadı.'];
};

const extractPptxParagraphs = (entries: Map<string, Buffer>) => {
  const slideEntries = [...entries.entries()]
    .filter(([name]) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true }));

  if (!slideEntries.length) throw new Error('PPTX slides not found.');

  const paragraphs = slideEntries.flatMap(([, slide], index) => {
    const texts = [...slide.toString('utf8').matchAll(/<a:p[\s\S]*?<\/a:p>/g)]
      .map(([paragraph]) => getXmlTextValues(paragraph, 'a').replace(/\s+/g, ' ').trim())
      .filter(Boolean);

    return texts.length ? [`Slayt ${index + 1}`, ...texts] : [`Slayt ${index + 1}`, 'Bu slaytta okunabilir metin bulunamadı.'];
  });

  return paragraphs.length ? paragraphs : ['Bu PPTX dosyasında okunabilir metin bulunamadı.'];
};

const getSharedStrings = (entries: Map<string, Buffer>) => {
  const sharedXml = entries.get('xl/sharedStrings.xml')?.toString('utf8');
  if (!sharedXml) return [];

  return [...sharedXml.matchAll(/<si[\s\S]*?<\/si>/g)]
    .map(([item]) => getXmlTextValues(item, 't').replace(/\s+/g, ' ').trim());
};

const getInlineCellText = (cellXml: string) =>
  [...cellXml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)]
    .map((match) => decodeXml(match[1]))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();

const extractXlsxParagraphs = (entries: Map<string, Buffer>) => {
  const sharedStrings = getSharedStrings(entries);
  const sheetEntries = [...entries.entries()]
    .filter(([name]) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
    .sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true }));

  if (!sheetEntries.length) throw new Error('XLSX sheets not found.');

  const paragraphs = sheetEntries.flatMap(([, sheet], sheetIndex) => {
    const rows = [...sheet.toString('utf8').matchAll(/<row[\s\S]*?<\/row>/g)]
      .map(([rowXml]) => {
        const cells = [...rowXml.matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)]
          .map(([, attrs, body]) => {
            if (attrs.includes('t="s"')) {
              const index = Number(body.match(/<v>(.*?)<\/v>/)?.[1] ?? -1);
              return sharedStrings[index] ?? '';
            }

            if (attrs.includes('t="inlineStr"')) return getInlineCellText(body);
            return decodeXml(body.match(/<v>(.*?)<\/v>/)?.[1] ?? '').trim();
          })
          .filter(Boolean);

        return cells.join('   |   ');
      })
      .filter(Boolean);

    return rows.length ? [`Sayfa ${sheetIndex + 1}`, ...rows] : [`Sayfa ${sheetIndex + 1}`, 'Bu sayfada okunabilir veri bulunamadı.'];
  });

  return paragraphs.length ? paragraphs : ['Bu XLSX dosyasında okunabilir veri bulunamadı.'];
};

const extractOfficeParagraphs = (buffer: Buffer, name: string) => {
  const extension = getFileExtension(name);

  if (extension === 'doc' || extension === 'ppt') return extractLegacyOfficeText(buffer, extension);

  const entries = readZipEntries(buffer);
  if (extension === 'docx') return extractDocxParagraphs(entries);
  if (extension === 'pptx') return extractPptxParagraphs(entries);
  if (extension === 'xlsx') return extractXlsxParagraphs(entries);

  throw new Error('Unsupported document type.');
};

const extractReadableRuns = (value: string) =>
  value
    .replace(/\u0000/g, ' ')
    .replace(/[\u0001-\u0008\u000b\u000c\u000e-\u001f]+/g, ' ')
    .split(/\s{2,}|\r?\n/)
    .map((item) => item.replace(/\s+/g, ' ').trim())
    .filter((item) => item.length >= 3 && /[A-Za-zÇĞİÖŞÜçğıöşü0-9]/.test(item));

const extractLegacyOfficeText = (buffer: Buffer, extension: string) => {
  const utf16Text = extractReadableRuns(buffer.toString('utf16le'));
  const latinText = extractReadableRuns(buffer.toString('latin1'));
  const seen = new Set<string>();
  const paragraphs = [...utf16Text, ...latinText].filter((item) => {
    const normalized = item.toLocaleLowerCase('tr');
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });

  if (paragraphs.length) return [
    extension === 'ppt'
      ? 'Eski PPT dosyasından çıkarılan metin'
      : 'Eski DOC dosyasından çıkarılan metin',
    ...paragraphs.slice(0, 600),
  ];

  return [
    extension === 'ppt'
      ? 'Bu eski PPT dosyasında okunabilir metin çıkarılamadı.'
      : 'Bu eski DOC dosyasında okunabilir metin çıkarılamadı.',
  ];
};

const renderParagraphPreview = (paragraphs: string[], query: string) =>
  paragraphs.map((paragraph) => `<p class="${/^(Slayt|Sayfa) \d+$/.test(paragraph) ? 'section' : ''}">${highlight(paragraph, query)}</p>`).join('\n');

const renderSlidePreview = (paragraphs: string[], query: string) => {
  const slides: { title: string; lines: string[] }[] = [];

  for (const paragraph of paragraphs) {
    if (/^Slayt \d+$/i.test(paragraph)) {
      slides.push({ title: paragraph, lines: [] });
    } else if (slides.length) {
      slides[slides.length - 1].lines.push(paragraph);
    } else {
      slides.push({ title: 'Slayt 1', lines: [paragraph] });
    }
  }

  if (!slides.length) return renderParagraphPreview(paragraphs, query);

  return `<div class="slide-deck">${slides
    .map((slide, index) => {
      const [firstLine, ...otherLines] = slide.lines;
      return `<section class="slide-card">
        <div class="slide-header">
          <span>${highlight(slide.title || `Slayt ${index + 1}`, query)}</span>
          <span>${index + 1} / ${slides.length}</span>
        </div>
        <div class="slide-stage">
          ${firstLine ? `<h2>${highlight(firstLine, query)}</h2>` : ''}
          ${otherLines.map((line) => `<p>${highlight(line, query)}</p>`).join('\n')}
        </div>
      </section>`;
    })
    .join('\n')}</div>`;
};

export async function GET(request: NextRequest) {
  const source = request.nextUrl.searchParams.get('url');
  const name = request.nextUrl.searchParams.get('name') ?? 'document';
  const query = request.nextUrl.searchParams.get('q') ?? '';
  const zoom = Math.min(180, Math.max(70, Number(request.nextUrl.searchParams.get('zoom') ?? 100) || 100));
  const extension = getFileExtension(name);

  if (!source) return new Response('Missing file URL.', { status: 400 });

  if (extension === 'ppt' || extension === 'pptx') {
    return new Response('PPT/PPTX preview requires a generated PDF preview.', { status: 415 });
  }

  let fileUrl: URL;

  try {
    fileUrl = new URL(source, request.url);
  } catch {
    return new Response('Invalid file URL.', { status: 400 });
  }

  const isR2File = fileUrl.hostname === allowedArchiveHost;
  const isLocalArchiveFile = fileUrl.origin === request.nextUrl.origin && fileUrl.pathname.startsWith('/arsiv/');

  if (!isR2File && !isLocalArchiveFile) {
    return new Response('File source is not allowed.', { status: 403 });
  }

  const upstream = await fetch(fileUrl.toString());
  if (!upstream.ok) return new Response('File could not be fetched.', { status: upstream.status || 502 });

  let paragraphs: string[];

  try {
    paragraphs = extractOfficeParagraphs(Buffer.from(await upstream.arrayBuffer()), name);
  } catch {
    return new Response('Document preview could not be generated.', { status: 422 });
  }

  const contentHtml = extension === 'ppt' || extension === 'pptx'
    ? renderSlidePreview(paragraphs, query)
    : renderParagraphPreview(paragraphs, query);

  const body = `<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    :root { color-scheme: light dark; }
    body {
      margin: 0;
      background: #f8fafc;
      color: #0f172a;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: ${zoom}%;
      line-height: 1.75;
    }
    main {
      max-width: 980px;
      margin: 0 auto;
      padding: 32px clamp(18px, 5vw, 56px);
    }
    h1 {
      margin: 0 0 22px;
      overflow-wrap: anywhere;
      font-size: 1.35rem;
      line-height: 1.35;
    }
    p {
      margin: 0 0 0.9rem;
      overflow-wrap: anywhere;
      white-space: pre-wrap;
    }
    p.section {
      margin-top: 1.35rem;
      border-top: 1px solid rgba(148, 163, 184, 0.35);
      padding-top: 1rem;
      color: #334155;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .slide-deck {
      display: grid;
      gap: 28px;
    }
    .slide-card {
      aspect-ratio: 16 / 9;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      border: 1px solid rgba(148, 163, 184, 0.35);
      border-radius: 24px;
      background:
        radial-gradient(circle at top right, rgba(59, 130, 246, 0.13), transparent 34%),
        linear-gradient(135deg, #ffffff 0%, #f8fafc 58%, #eef2ff 100%);
      box-shadow: 0 18px 45px rgba(15, 23, 42, 0.12);
    }
    .slide-header {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      border-bottom: 1px solid rgba(148, 163, 184, 0.28);
      padding: 14px 20px;
      color: #64748b;
      font-size: 0.76rem;
      font-weight: 900;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
    .slide-stage {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      padding: clamp(24px, 5vw, 58px);
    }
    .slide-stage h2 {
      max-width: 92%;
      margin: 0 0 1.1rem;
      color: #0f172a;
      font-size: clamp(1.65rem, 3.4vw, 3.35rem);
      line-height: 1.08;
      overflow-wrap: anywhere;
    }
    .slide-stage p {
      max-width: 88%;
      margin: 0 0 0.72rem;
      color: #1e293b;
      font-size: clamp(1rem, 1.45vw, 1.45rem);
      line-height: 1.35;
    }
    mark {
      border-radius: 0.35rem;
      background: #fde68a;
      color: inherit;
      padding: 0 0.15em;
    }
    @media (prefers-color-scheme: dark) {
      body { background: #020617; color: #e2e8f0; }
      p.section { color: #cbd5e1; }
      .slide-card {
        border-color: rgba(100, 116, 139, 0.55);
        background:
          radial-gradient(circle at top right, rgba(96, 165, 250, 0.16), transparent 34%),
          linear-gradient(135deg, #0f172a 0%, #111827 60%, #1e1b4b 100%);
      }
      .slide-header { color: #cbd5e1; border-color: rgba(100, 116, 139, 0.45); }
      .slide-stage h2 { color: #f8fafc; }
      .slide-stage p { color: #dbeafe; }
      mark { background: #f59e0b; color: #111827; }
    }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(name)}</h1>
    ${contentHtml}
  </main>
</body>
</html>`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
