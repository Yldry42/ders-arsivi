'use client';

import { useEffect, useRef, useState } from 'react';

type PptxBrowserPreviewProps = {
  fileName: string;
  previewUrl: string;
};

type PptxViewerInstance = {
  load: (source: ArrayBuffer | string | File) => Promise<void>;
  destroy?: () => void;
};

type PptxViewerConstructor = new (
  container: HTMLElement,
  options?: {
    showControls?: boolean;
    keyboardNavigation?: boolean;
    onError?: (error: Error) => void;
  }
) => PptxViewerInstance;

export default function PptxBrowserPreview({ fileName, previewUrl }: PptxBrowserPreviewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<PptxViewerInstance | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadPresentation() {
      const container = containerRef.current;
      if (!container) return;

      setStatus('loading');
      setErrorMessage('');
      container.innerHTML = '';
      viewerRef.current?.destroy?.();
      viewerRef.current = null;

      try {
        const [{ PPTXViewer }, response] = await Promise.all([
          import('pptx-viewer') as Promise<{ PPTXViewer: PptxViewerConstructor }>,
          fetch(previewUrl),
        ]);

        if (!response.ok) throw new Error(`Dosya alınamadı (${response.status}).`);

        const buffer = await response.arrayBuffer();
        if (cancelled) return;

        const viewer = new PPTXViewer(container, {
          showControls: true,
          keyboardNavigation: true,
          onError: (error) => {
            if (cancelled) return;
            setStatus('error');
            setErrorMessage(error.message || 'PPTX önizleme oluşturulamadı.');
          },
        });

        viewerRef.current = viewer;
        await viewer.load(buffer);

        if (!cancelled) setStatus('ready');
      } catch (error) {
        if (cancelled) return;
        setStatus('error');
        setErrorMessage(error instanceof Error ? error.message : 'PPTX önizleme oluşturulamadı.');
      }
    }

    loadPresentation();

    return () => {
      cancelled = true;
      viewerRef.current?.destroy?.();
      viewerRef.current = null;
    };
  }, [previewUrl]);

  return (
    <div className="relative h-[76vh] overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950">
      {status === 'loading' ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/90 text-sm font-semibold text-slate-500 dark:bg-slate-950/90 dark:text-slate-300">
          {fileName} yükleniyor…
        </div>
      ) : null}

      {status === 'error' ? (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white p-8 text-center dark:bg-slate-950">
          <p className="text-lg font-bold text-slate-900 dark:text-white">PPTX önizlemesi açılamadı.</p>
          <p className="mt-2 max-w-xl text-sm text-slate-600 dark:text-slate-300">{errorMessage}</p>
          <p className="mt-4 max-w-xl text-xs text-slate-500 dark:text-slate-400">
            Bu dosya için en sağlam çözüm LibreOffice ile PDF önizleme üretmek.
          </p>
        </div>
      ) : null}

      <div ref={containerRef} className="h-full w-full overflow-auto bg-slate-100 dark:bg-slate-950" />
    </div>
  );
}
