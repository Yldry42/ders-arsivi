import { createHash, createHmac } from 'crypto';
import { NextResponse } from 'next/server';

type R2Object = {
  key: string;
  size: number;
};

const atlanacakDosyalar = new Set(['desktop.ini', 'thumbs.db', '.ds_store']);

const encodeArchivePath = (path: string) =>
  path
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');

const getFileName = (key: string) => key.split('/').filter(Boolean).pop() ?? key;

const getReadableSize = (byteCount: number) => {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = byteCount;

  for (const unit of units) {
    if (size < 1024 || unit === units[units.length - 1]) {
      return unit === 'B' ? `${Math.round(size)} ${unit}` : `${size.toFixed(1)} ${unit}`;
    }

    size /= 1024;
  }

  return `${byteCount} B`;
};

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const getXmlTag = (source: string, tag: string) => {
  const match = source.match(new RegExp(`<${escapeRegex(tag)}>([\\s\\S]*?)<\\/${escapeRegex(tag)}>`, 'i'));
  return match?.[1] ?? '';
};

const decodeXml = (value: string) =>
  value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

const sha256Hex = (value: string) => createHash('sha256').update(value).digest('hex');
const hmac = (key: Buffer | string, value: string) => createHmac('sha256', key).update(value).digest();
const hmacHex = (key: Buffer, value: string) => createHmac('sha256', key).update(value).digest('hex');

const getSignatureKey = (secretKey: string, dateStamp: string) => {
  const kDate = hmac(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmac(kDate, 'auto');
  const kService = hmac(kRegion, 's3');
  return hmac(kService, 'aws4_request');
};

const getSignedHeaders = (url: URL, accessKeyId: string, secretAccessKey: string) => {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex('');
  const canonicalQuery = Array.from(url.searchParams.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  const canonicalHeaders = `host:${url.host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = ['GET', url.pathname, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, sha256Hex(canonicalRequest)].join('\n');
  const signature = hmacHex(getSignatureKey(secretAccessKey, dateStamp), stringToSign);

  return {
    Authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
};

const listR2Objects = async () => {
  const accountId = process.env.R2_ACCOUNT_ID;
  const bucketName = process.env.R2_BUCKET_NAME;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !bucketName || !accessKeyId || !secretAccessKey) {
    throw new Error('R2 environment variables are missing.');
  }

  const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
  const objects: R2Object[] = [];
  let continuationToken: string | null = null;

  do {
    const url = new URL(`/${bucketName}`, endpoint);
    url.searchParams.set('list-type', '2');
    url.searchParams.set('max-keys', '1000');

    if (continuationToken) {
      url.searchParams.set('continuation-token', continuationToken);
    }

    const response = await fetch(url, {
      headers: getSignedHeaders(url, accessKeyId, secretAccessKey),
    });

    if (!response.ok) {
      throw new Error(`R2 list request failed with status ${response.status}.`);
    }

    const xml = await response.text();
    const contents = xml.match(/<Contents>[\s\S]*?<\/Contents>/g) ?? [];

    for (const content of contents) {
      const key = decodeXml(getXmlTag(content, 'Key'));
      const size = Number(getXmlTag(content, 'Size')) || 0;

      if (key) {
        objects.push({ key, size });
      }
    }

    const nextToken = decodeXml(getXmlTag(xml, 'NextContinuationToken'));
    continuationToken = nextToken || null;
  } while (continuationToken);

  return objects;
};

export async function GET() {
  try {
    const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL?.replace(/\/$/, '') ?? '';
    const objects = await listR2Objects();

    const archiveItems = objects
      .filter(({ key }) => {
        const fileName = getFileName(key);
        const lowerFileName = fileName.toLowerCase();

        return key && !key.endsWith('/') && !atlanacakDosyalar.has(lowerFileName) && !fileName.startsWith('~$');
      })
      .map(({ key, size }) => ({
        yil: key.split('/')[0] ?? '',
        dosya_adi: getFileName(key),
        yerel_yol: key,
        url: publicBaseUrl ? `${publicBaseUrl}/${encodeArchivePath(key)}` : undefined,
        boyut_byte: size,
        boyut: getReadableSize(size),
      }));

    return NextResponse.json(archiveItems, {
      headers: {
        'Cache-Control': 's-maxage=300, stale-while-revalidate=3600',
      },
    });
  } catch (error) {
    console.error('[Ders Arşivi] R2 archive listing failed:', error);
    return NextResponse.json({ error: 'Archive could not be listed.' }, { status: 500 });
  }
}
