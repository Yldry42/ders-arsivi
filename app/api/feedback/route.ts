import { NextResponse } from 'next/server';

const owner = process.env.FEEDBACK_GITHUB_OWNER || 'Yldry42';
const repo = process.env.FEEDBACK_GITHUB_REPO || 'ders-arsivi';
const token = process.env.FEEDBACK_GITHUB_TOKEN;

type FeedbackPayload = {
  type?: string;
  message?: string;
  sender?: string;
  page?: string;
};

const cleanText = (value: unknown, maxLength: number) =>
  typeof value === 'string' ? value.trim().slice(0, maxLength) : '';

export async function POST(request: Request) {
  let payload: FeedbackPayload;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const type = cleanText(payload.type, 80) || 'Geri bildirim';
  const message = cleanText(payload.message, 4000);
  const sender = cleanText(payload.sender, 200) || 'Belirtilmedi';
  const page = cleanText(payload.page, 500) || 'Belirtilmedi';

  if (!message) {
    return NextResponse.json({ error: 'Feedback message is required.' }, { status: 400 });
  }

  if (!token) {
    return NextResponse.json(
      { error: 'Feedback service is not configured. Missing FEEDBACK_GITHUB_TOKEN.' },
      { status: 501 },
    );
  }

  const title = `[Geri Bildirim] ${type}`;
  const body = [
    '## Geri Bildirim',
    '',
    `**Konu:** ${type}`,
    `**Gönderen:** ${sender}`,
    `**Sayfa:** ${page}`,
    '',
    '### Mesaj',
    message,
  ].join('\n');

  const githubResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      title,
      body,
      labels: ['feedback'],
    }),
  });

  if (!githubResponse.ok) {
    const detail = await githubResponse.text();
    return NextResponse.json(
      { error: 'GitHub issue could not be created.', detail: detail.slice(0, 500) },
      { status: 502 },
    );
  }

  const issue = await githubResponse.json();
  return NextResponse.json({ ok: true, url: issue.html_url });
}
