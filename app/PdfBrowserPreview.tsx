'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist';

type Props = {
  fileName: string;
  previewUrl: string;
  fit: boolean;
  zoom: number;
  searchQuery: string;
  onZoomChange: (zoom: number) => void;
  onFitZoomChange: (zoom: number) => void;
};

const CSS_PIXELS_PER_POINT = 96 / 72;
const MIN_ZOOM = 5;
const MAX_ZOOM = 300;

function PdfPage({
  document,
  pageNumber,
  zoom,
  root,
  fallbackSize,
}: {
  document: PDFDocumentProxy;
  pageNumber: number;
  zoom: number;
  root: HTMLDivElement | null;
  fallbackSize: { width: number; height: number };
}) {
  const slotRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const [size, setSize] = useState(fallbackSize);
  const scale = CSS_PIXELS_PER_POINT * zoom / 100;

  useEffect(() => {
    if (!root || !slotRef.current) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) setVisible(true);
    }, { root, rootMargin: '500px' });
    observer.observe(slotRef.current);
    return () => observer.disconnect();
  }, [root]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let renderTask: RenderTask | null = null;

    async function render() {
      let page: PDFPageProxy | undefined;
      try {
        page = await document.getPage(pageNumber);
        if (cancelled) return;
        const base = page.getViewport({ scale: 1 });
        setSize({ width: base.width, height: base.height });
        const viewport = page.getViewport({ scale });
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(16_000_000 / (viewport.width * viewport.height)));
        const renderViewport = page.getViewport({ scale: scale * pixelRatio });
        const buffer = window.document.createElement('canvas');
        buffer.width = Math.ceil(renderViewport.width);
        buffer.height = Math.ceil(renderViewport.height);
        renderTask = page.render({ canvas: buffer, viewport: renderViewport });
        await renderTask.promise;
        if (cancelled || !canvasRef.current) return;
        const canvas = canvasRef.current;
        canvas.width = buffer.width;
        canvas.height = buffer.height;
        canvas.getContext('2d')?.drawImage(buffer, 0, 0);
      } catch (error) {
        if (!cancelled && !(error instanceof Error && error.name === 'RenderingCancelledException')) {
          console.error(`PDF page ${pageNumber} could not be rendered.`, error);
        }
      }
    }

    void render();
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [document, pageNumber, scale, visible]);

  const width = Math.ceil(size.width * scale);
  const height = Math.ceil(size.height * scale);

  return (
    <div ref={slotRef} data-pdf-page={pageNumber} className="relative mb-5 bg-white shadow-md" style={{ width, height }}>
      <canvas ref={canvasRef} aria-label={`${pageNumber}. sayfa`} className="block h-full w-full" />
    </div>
  );
}

export default function PdfBrowserPreview({ fileName, previewUrl, fit, zoom, searchQuery, onZoomChange, onFitZoomChange }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollRoot, setScrollRoot] = useState<HTMLDivElement | null>(null);
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [firstPageSize, setFirstPageSize] = useState({ width: 612, height: 792 });
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [error, setError] = useState('');
  const [searchStatus, setSearchStatus] = useState('');
  const previousZoomRef = useRef<number | null>(null);

  useEffect(() => {
    setScrollRoot(scrollRef.current);
    if (!scrollRef.current) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setContainerSize({ width, height });
    });
    observer.observe(scrollRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let loadingTask: ReturnType<typeof import('pdfjs-dist').getDocument> | null = null;
    setDocument(null);
    setError('');
    setSearchStatus('');

    async function load() {
      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
        if (cancelled) return;
        loadingTask = pdfjs.getDocument({ url: previewUrl });
        const pdf = await loadingTask.promise;
        if (cancelled) return;
        const firstPage = await pdf.getPage(1);
        if (cancelled) return;
        const viewport = firstPage.getViewport({ scale: 1 });
        setFirstPageSize({ width: viewport.width, height: viewport.height });
        setDocument(pdf);
      } catch (cause) {
        if (!cancelled) {
          console.error('PDF could not be loaded.', cause);
          setError('PDF önizlemesi açılamadı. Dosyayı indirerek görüntüleyebilirsiniz.');
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
      void loadingTask?.destroy();
    };
  }, [previewUrl]);

  const fitZoom = containerSize.width && containerSize.height
    ? Math.max(MIN_ZOOM, Math.min(100, Math.floor(100 * Math.min(
      (containerSize.width - 32) / (firstPageSize.width * CSS_PIXELS_PER_POINT),
      (containerSize.height - 32) / (firstPageSize.height * CSS_PIXELS_PER_POINT),
    ))))
    : 100;
  const effectiveZoom = fit ? fitZoom : zoom;

  useLayoutEffect(() => {
    const element = scrollRef.current;
    const previousZoom = previousZoomRef.current;
    if (element && previousZoom && previousZoom !== effectiveZoom) {
      const ratio = effectiveZoom / previousZoom;
      element.scrollTop = (element.scrollTop + element.clientHeight / 2) * ratio - element.clientHeight / 2;
      element.scrollLeft = (element.scrollLeft + element.clientWidth / 2) * ratio - element.clientWidth / 2;
    }
    previousZoomRef.current = effectiveZoom;
  }, [effectiveZoom]);

  useEffect(() => {
    if (fit && document) onFitZoomChange(fitZoom);
  }, [document, fit, fitZoom, onFitZoomChange]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const step = event.deltaY < 0 ? 10 : -10;
      onZoomChange(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, effectiveZoom + step)));
    };
    element.addEventListener('wheel', handleWheel, { passive: false });
    return () => element.removeEventListener('wheel', handleWheel);
  }, [effectiveZoom, onZoomChange]);

  useEffect(() => {
    const query = searchQuery.trim().toLocaleLowerCase('tr');
    if (!document || !query) {
      setSearchStatus('');
      return;
    }
    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        try {
          const page = await document.getPage(pageNumber);
          const content = await page.getTextContent();
          if (cancelled) return;
          const text = content.items.map((item) => 'str' in item ? item.str : '').join(' ').toLocaleLowerCase('tr');
          if (text.includes(query)) {
            scrollRef.current?.querySelector(`[data-pdf-page="${pageNumber}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
            setSearchStatus(`${pageNumber}. sayfada bulundu`);
            return;
          }
        } catch (cause) {
          if (!cancelled) console.error('PDF search failed.', cause);
        }
      }
      if (!cancelled) setSearchStatus('Eşleşme bulunamadı');
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [document, searchQuery]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-200 dark:border-slate-700 dark:bg-slate-800">
      <div
        ref={scrollRef}
        tabIndex={0}
        className="h-full w-full overflow-auto outline-none"
        aria-label={`${fileName} PDF önizlemesi`}
        onKeyDown={(event) => {
          if (!event.ctrlKey && !event.metaKey) return;
          if (event.key === '+' || event.key === '=' || event.key === '-') {
            event.preventDefault();
            const step = event.key === '-' ? -10 : 10;
            onZoomChange(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, effectiveZoom + step)));
          }
        }}
      >
        {document ? (
          <div className="flex w-max min-w-full flex-col items-center px-4 pt-4">
            {Array.from({ length: document.numPages }, (_, index) => (
              <PdfPage key={index + 1} document={document} pageNumber={index + 1} zoom={effectiveZoom} root={scrollRoot} fallbackSize={firstPageSize} />
            ))}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-600 dark:text-slate-300">
            {error || 'PDF yükleniyor…'}
          </div>
        )}
      </div>
      {searchStatus ? <div className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-slate-900/85 px-3 py-1.5 text-xs font-medium text-white">{searchStatus}</div> : null}
    </div>
  );
}
