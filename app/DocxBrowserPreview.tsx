'use client';

import { useEffect, useRef, useState } from 'react';

type DocxScrollViewerInstance = {
  load: (source: string | ArrayBuffer) => Promise<void>;
  destroy: () => void;
  setScale: (scale: number) => void;
  getScale: () => number;
  fitWidth: () => void;
  relayout?: () => void;
  findText: (query: string) => Promise<unknown[]>;
  clearFind: () => void;
  pageCount: number;
};

type DocxScrollViewerConstructor = new (
  container: HTMLElement,
  options?: {
    width?: number;
    gap?: number;
    paddingTop?: number;
    paddingBottom?: number;
    paddingLeft?: number;
    paddingRight?: number;
    background?: string;
    pageShadow?: string | false;
    dpr?: number;
    useGoogleFonts?: boolean;
    mode?: 'main' | 'worker';
    onVisiblePageChange?: (topIndex: number, total: number) => void;
    onScaleChange?: (scale: number) => void;
    onError?: (error: Error) => void;
  },
) => DocxScrollViewerInstance;

type DocxBrowserPreviewProps = {
  fileName: string;
  fileUrl: string;
  previewUrl: string;
  zoom: number;
  searchQuery: string;
};

const productionPreviewOrigin = 'https://ders-arsivi.vercel.app';

const getProductionPreviewUrl = (previewUrl: string) =>
  previewUrl.startsWith('/api/') ? `${productionPreviewOrigin}${previewUrl}` : previewUrl;

export default function DocxBrowserPreview({ fileName, fileUrl, previewUrl, zoom, searchQuery }: DocxBrowserPreviewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<DocxScrollViewerInstance | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [pageInfo, setPageInfo] = useState({ current: 1, total: 0 });

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;

    setStatus('loading');
    setMessage('');
    setPageInfo({ current: 1, total: 0 });
    viewerRef.current?.destroy();
    viewerRef.current = null;
    container.replaceChildren();

    (async () => {
      try {
        const { DocxScrollViewer } = await import('@silurus/ooxml/docx') as { DocxScrollViewer: DocxScrollViewerConstructor };
        const proxyResponse = await fetch(previewUrl).catch(() => null);
        const directResponse = proxyResponse?.ok ? null : await fetch(fileUrl).catch(() => null);
        const productionProxyResponse =
          proxyResponse?.ok || directResponse?.ok ? null : await fetch(getProductionPreviewUrl(previewUrl)).catch(() => null);
        const response = proxyResponse?.ok ? proxyResponse : directResponse?.ok ? directResponse : productionProxyResponse;

        if (!response?.ok) {
          throw new Error(
            proxyResponse
              ? `DOCX dosyası alınamadı (${proxyResponse.status}${directResponse ? ` / ${directResponse.status}` : ''}${productionProxyResponse ? ` / ${productionProxyResponse.status}` : ''})`
              : 'DOCX dosyası alınamadı. Local ortam R2 dosyasına erişemiyor olabilir.',
          );
        }

        const buffer = await response.arrayBuffer();
        if (cancelled) return;

        const viewer = new DocxScrollViewer(container, {
          width: Math.max(720, Math.min(container.clientWidth - 32, 980)),
          background: 'transparent',
          gap: 18,
          paddingTop: 18,
          paddingBottom: 22,
          paddingLeft: 12,
          paddingRight: 12,
          dpr: Math.min(window.devicePixelRatio || 1, 2),
          useGoogleFonts: true,
          pageShadow: '0 14px 34px rgba(15, 23, 42, 0.14)',
          mode: 'main',
          onVisiblePageChange: (topIndex, total) => {
            if (!cancelled) setPageInfo({ current: topIndex + 1, total });
          },
          onError: () => undefined,
        });

        viewerRef.current = viewer;
        await viewer.load(buffer);
        if (document.fonts?.ready) {
          await document.fonts.ready.catch(() => undefined);
          viewer.relayout?.();
        }
        viewer.fitWidth();

        if (cancelled) {
          viewer.destroy();
          return;
        }

        setPageInfo({ current: 1, total: viewer.pageCount });
        setStatus('ready');
      } catch (error) {
        if (cancelled) return;
        setStatus('error');
        setMessage(error instanceof Error ? error.message : 'DOCX önizleme yüklenemedi.');
      }
    })();

    return () => {
      cancelled = true;
      viewerRef.current?.destroy();
      viewerRef.current = null;
      container.replaceChildren();
    };
  }, [fileName, fileUrl, previewUrl]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || status !== 'ready') return;

    const scale = Math.max(0.35, Math.min(2.5, zoom / 100));
    viewer.setScale(scale);
  }, [status, zoom]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || status !== 'ready') return;

    const query = searchQuery.trim();
    if (!query) {
      viewer.clearFind();
      return;
    }

    let cancelled = false;
    viewer.findText(query).catch((error) => {
      if (!cancelled) console.error('[Ders Arşivi] DOCX arama hatası:', error);
    });

    return () => {
      cancelled = true;
    };
  }, [status, searchQuery]);

  return (
    <div className="relative h-[76vh] overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-950">
      {status !== 'ready' ? (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-slate-50/95 px-6 text-center dark:bg-slate-950/95">
          {status === 'loading' ? (
            <>
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-slate-900 dark:border-slate-700 dark:border-t-white" />
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                {fileName} hazırlanıyor...
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">DOCX önizleme açılamadı.</p>
              <p className="max-w-md text-xs leading-5 text-slate-500 dark:text-slate-400">{message}</p>
            </>
          )}
        </div>
      ) : null}

      {status === 'ready' && pageInfo.total > 0 ? (
        <div className="pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full bg-slate-950/85 px-4 py-2 text-xs font-bold tracking-[0.18em] text-white shadow-lg">
          {pageInfo.current} / {pageInfo.total}
        </div>
      ) : null}

      <div ref={containerRef} className="h-full w-full overflow-auto bg-slate-100 dark:bg-slate-950" />
    </div>
  );
}
