'use client';

import { useEffect, useState } from 'react';
import { PowerPointViewer } from 'pptx-react-viewer';

type PptxArchivePreviewProps = {
  fileName: string;
  previewUrl: string;
};

export default function PptxArchivePreview({ fileName, previewUrl }: PptxArchivePreviewProps) {
  const [content, setContent] = useState<Uint8Array | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    setContent(null);
    setError(null);

    fetch(previewUrl, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Sunum dosyası alınamadı (${response.status}).`);
        return response.arrayBuffer();
      })
      .then((buffer) => setContent(new Uint8Array(buffer)))
      .catch((caughtError: unknown) => {
        if (controller.signal.aborted) return;
        setError(caughtError instanceof Error ? caughtError.message : 'Sunum önizlemesi açılamadı.');
      });

    return () => controller.abort();
  }, [previewUrl]);

  if (error) {
    return (
      <div className="flex h-full min-h-[76vh] flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
        <p className="text-lg font-bold text-slate-900 dark:text-white">Sunum önizlemesi açılamadı.</p>
        <p className="mt-2 max-w-xl text-sm">{error}</p>
      </div>
    );
  }

  if (!content) {
    return (
      <div className="flex h-full min-h-[76vh] items-center justify-center rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
        Sunum yükleniyor…
      </div>
    );
  }

  return (
    <div className="h-[76vh] overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950">
      <PowerPointViewer
        content={content}
        fileName={fileName}
        canEdit={false}
        hiddenActions={['share', 'broadcast', 'record', 'insert', 'draw', 'design', 'transitions', 'animations', 'review', 'help']}
      />
    </div>
  );
}
