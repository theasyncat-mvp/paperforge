import { useState, useCallback } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import FileDropZone from "../components/FileDropZone";
import PdfViewer from "../components/PdfViewer";
import { addTextToPdf } from "../lib/tauri";

export default function AddTextTool() {
  const [file, setFile] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [text, setText] = useState("");
  const [fontSize, setFontSize] = useState(14);
  const [color, setColor] = useState("#000000");
  const [placement, setPlacement] = useState(null); // { x, y, pageNumber }
  const [pageSize, setPageSize] = useState({ width: 612, height: 792 });
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");

  const handleFile = (paths) => {
    setFile(paths[0]);
    setPlacement(null);
    setStatus("idle");
    setMessage("");
  };

  const handlePageClick = useCallback((pdfX, pdfY, pageNumber) => {
    setPlacement({ x: pdfX, y: pdfY, pageNumber });
    setMessage("");
  }, []);

  const handlePageInfo = useCallback((info) => {
    setPageSize({ width: info.width, height: info.height });
  }, []);

  const overlayItems =
    placement && text.trim()
      ? [
          {
            type: "text",
            pageNumber: placement.pageNumber,
            x: placement.x,
            y: placement.y,
            width: Math.max(text.length * fontSize * 0.6, 50),
            height: fontSize * 1.4,
            fontSize,
            color,
            content: text,
          },
        ]
      : [];

  const handleApply = async () => {
    if (!file || !text.trim() || !placement) return;

    const stem = file.split("/").pop().replace(/\.pdf$/i, "");
    const outputFile = await save({
      filters: [{ name: "PDF", extensions: ["pdf"] }],
      defaultPath: `${stem}_text.pdf`,
    });
    if (!outputFile) return;

    setStatus("running");
    setMessage("");
    try {
      await addTextToPdf(
        file,
        outputFile,
        text,
        placement.pageNumber,
        placement.x,
        placement.y,
        fontSize,
        color
      );
      setStatus("done");
      setMessage("Text added successfully.");
    } catch (err) {
      setStatus("error");
      setMessage(String(err));
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold mb-1">Add Text to PDF</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Type your text, then click on the PDF page to place it.
        </p>
      </div>

      <FileDropZone onFiles={handleFile} />

      {file && (
        <div className="space-y-4">
          {/* Text input */}
          <div>
            <label className="text-sm font-medium block mb-1">Text</label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Enter text to add"
              rows={2}
              className="w-full px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 resize-none"
            />
          </div>

          {/* Options row */}
          <div className="flex gap-4 items-end flex-wrap">
            <div>
              <label className="text-sm font-medium block mb-1">Font size</label>
              <input
                type="number"
                min={6}
                max={72}
                value={fontSize}
                onChange={(e) => setFontSize(Math.max(6, parseInt(e.target.value) || 14))}
                className="w-24 px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900"
              />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Color</label>
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-10 h-10 rounded border border-zinc-200 dark:border-zinc-700 cursor-pointer"
              />
            </div>
          </div>

          {/* PDF Viewer - click to place */}
          <div>
            <p className="text-sm font-medium mb-2">
              Click on the page to place your text:
            </p>
            <PdfViewer
              file={file}
              currentPage={currentPage}
              onPageChange={setCurrentPage}
              overlayItems={overlayItems}
              onOverlayClick={handlePageClick}
              onPageInfo={handlePageInfo}
            />
          </div>

          {placement && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Placed at page {placement.pageNumber}, position ({Math.round(placement.x)},{" "}
              {Math.round(placement.y)}) pt
            </p>
          )}

          <button
            onClick={handleApply}
            disabled={status === "running" || !text.trim() || !placement}
            className="px-5 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
          >
            {status === "running" ? "Adding..." : "Add Text"}
          </button>
        </div>
      )}

      {message && (
        <p
          className={`text-sm ${
            status === "error"
              ? "text-red-500"
              : "text-emerald-600 dark:text-emerald-400"
          }`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
