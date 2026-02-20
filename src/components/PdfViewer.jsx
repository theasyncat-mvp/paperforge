import { useState, useEffect, useRef, useCallback } from "react";
import { readPdfBytes } from "../lib/tauri";
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.mjs",
  import.meta.url
).href;

export default function PdfViewer({
  file,
  currentPage = 1,
  onPageChange,
  overlayItems = [],
  onOverlayClick,
  onPageInfo,
}) {
  const [pdf, setPdf] = useState(null);
  const [totalPages, setTotalPages] = useState(0);
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 });
  const [scale, setScale] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const renderTaskRef = useRef(null);

  // Load PDF document
  useEffect(() => {
    if (!file) return;
    let cancelled = false;

    async function loadPdf() {
      setLoading(true);
      setError("");
      try {
        const bytes = await readPdfBytes(file);
        const doc = await pdfjsLib.getDocument({ data: new Uint8Array(bytes) }).promise;
        if (!cancelled) {
          setPdf(doc);
          setTotalPages(doc.numPages);
        }
      } catch (err) {
        if (!cancelled) setError("Failed to load PDF: " + String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadPdf();

    return () => {
      cancelled = true;
    };
  }, [file]);

  // Render current page
  useEffect(() => {
    if (!pdf || currentPage < 1 || currentPage > totalPages) return;

    async function renderPage() {
      // Cancel previous render
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }

      const page = await pdf.getPage(currentPage);
      const unscaledViewport = page.getViewport({ scale: 1 });

      // Fit to container width
      const container = containerRef.current;
      const containerWidth = container ? container.clientWidth - 4 : 600;
      const fitScale = containerWidth / unscaledViewport.width;
      const effectiveScale = fitScale;
      setScale(effectiveScale);

      const viewport = page.getViewport({ scale: effectiveScale });
      const canvas = canvasRef.current;
      if (!canvas) return;

      canvas.width = viewport.width;
      canvas.height = viewport.height;

      setPageSize({
        width: unscaledViewport.width,
        height: unscaledViewport.height,
      });

      if (onPageInfo) {
        onPageInfo({
          width: unscaledViewport.width,
          height: unscaledViewport.height,
          pageNumber: currentPage,
        });
      }

      const ctx = canvas.getContext("2d");
      const task = page.render({ canvasContext: ctx, viewport });
      renderTaskRef.current = task;
      try {
        await task.promise;
      } catch {
        // render cancelled
      }
    }
    renderPage();
  }, [pdf, currentPage, totalPages, onPageInfo]);

  const handleCanvasClick = useCallback(
    (e) => {
      if (!onOverlayClick || !canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      // Convert to PDF coordinates (bottom-left origin)
      const pdfX = clickX / scale;
      const pdfY = pageSize.height - clickY / scale;
      onOverlayClick(pdfX, pdfY, currentPage);
    },
    [onOverlayClick, scale, pageSize, currentPage]
  );

  const goToPage = (p) => {
    const clamped = Math.max(1, Math.min(totalPages, p));
    if (onPageChange) onPageChange(clamped);
  };

  if (!file) return null;

  return (
    <div className="space-y-3">
      {/* Navigation */}
      {totalPages > 0 && (
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <button
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage <= 1}
              className="px-2.5 py-1.5 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg disabled:opacity-30 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
            >
              Prev
            </button>
            <span className="text-sm text-zinc-500 dark:text-zinc-400 min-w-[80px] text-center">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage >= totalPages}
              className="px-2.5 py-1.5 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg disabled:opacity-30 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Canvas + overlay container */}
      <div
        ref={containerRef}
        className="relative border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden bg-zinc-100 dark:bg-zinc-800"
      >
        {loading && (
          <div className="flex items-center justify-center py-20 text-sm text-zinc-500">
            Loading PDF...
          </div>
        )}
        {error && (
          <div className="flex items-center justify-center py-20 text-sm text-red-500">
            {error}
          </div>
        )}

        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          className={`block mx-auto ${onOverlayClick ? "cursor-crosshair" : ""}`}
          style={{ display: loading || error ? "none" : "block" }}
        />

        {/* Overlay items */}
        {!loading &&
          !error &&
          overlayItems
            .filter((item) => item.pageNumber === currentPage)
            .map((item, i) => {
              // Convert PDF coords to screen coords
              const screenX = item.x * scale;
              const screenY = (pageSize.height - item.y) * scale;
              // Center the canvas container offset
              const canvasWidth = (canvasRef.current?.width) || 0;
              const containerWidth = containerRef.current?.clientWidth || 0;
              const offsetX = Math.max(0, (containerWidth - canvasWidth) / 2);

              return (
                <div
                  key={i}
                  className="absolute pointer-events-none"
                  style={{
                    left: offsetX + screenX,
                    top: screenY - (item.height || 0) * scale,
                    width: (item.width || 0) * scale,
                    height: (item.height || 0) * scale,
                  }}
                >
                  {item.render
                    ? item.render(scale)
                    : item.type === "text" && (
                        <span
                          className="whitespace-pre pointer-events-none"
                          style={{
                            fontSize: (item.fontSize || 14) * scale,
                            color: item.color || "#000",
                            fontFamily: "Helvetica, Arial, sans-serif",
                            lineHeight: 1,
                          }}
                        >
                          {item.content}
                        </span>
                      )}
                </div>
              );
            })}
      </div>
    </div>
  );
}
