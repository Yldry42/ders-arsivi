import { NextRequest } from 'next/server';

const allowedArchiveHost = 'pub-9166db2e46694c818420c32e7545d40c.r2.dev';

const getSafeFileName = (fileName: string) =>
  fileName
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim() || 'dosya';

export async function GET(request: NextRequest) {
  const source = request.nextUrl.searchParams.get('url');
  const name = getSafeFileName(request.nextUrl.searchParams.get('name') ?? 'dosya');

  if (!source) {
    return new Response('Missing file URL.', { status: 400 });
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

  if (!upstream.ok || !upstream.body) {
    return new Response('File could not be fetched.', { status: upstream.status || 502 });
  }

  return new Response(upstream.body, {
    headers: {
      'Content-Disposition': `inline; filename="${name.replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      'Content-Type': upstream.headers.get('Content-Type') ?? 'application/octet-stream',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
