import { useState, useCallback } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import FileDropZone from "../components/FileDropZone";
import PdfViewer from "../components/PdfViewer";
import { addWatermark } from "../lib/tauri";

const positionOptions = [
  { id: "diagonal", label: "Diagonal" },
  { id: "center", label: "Center" },
  { id: "top", label: "Top" },
  { id: "bottom", label: "Bottom" },
];

export default function WatermarkTool() {
  const [file, setFile] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState({ width: 612, height: 792 });
  const [text, setText] = useState("CONFIDENTIAL");
  const [fontSize, setFontSize] = useState(48);
  const [opacity, setOpacity] = useState(0.3);
  const [color, setColor] = useState("#888888");
  const [position, setPosition] = useState("diagonal");
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");

  const handleFile = (paths) => {
    setFile(paths[0]);
    setStatus("idle");
    setMessage("");
  };

  const handlePageInfo = useCallback((info) => {
    setPageSize({ width: info.width, height: info.height });
  }, []);

  // Build watermark overlay preview
  const overlayItems = text.trim()
    ? [
        {
          pageNumber: currentPage,
          x: 0,
          y: 0,
          width: pageSize.width,
          height: pageSize.height,
          render: (scale) => {
            const style = {
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: color,
              opacity: opacity,
              fontSize: fontSize * scale,
              fontWeight: "bold",
              fontFamily: "Helvetica, Arial, sans-serif",
              pointerEvents: "none",
              overflow: "hidden",
            };

            if (position === "diagonal") {
              style.transform = "rotate(-45deg)";
            } else if (position === "top") {
              style.alignItems = "flex-start";
              style.paddingTop = 50 * scale;
            } else if (position === "bottom") {
              style.alignItems = "flex-end";
              style.paddingBottom = 40 * scale;
            }

            return <div style={style}>{text}</div>;
          },
        },
      ]
    : [];

  const handleApply = async () => {
    if (!file || !text.trim()) return;

    const stem = file.split("/").pop().replace(/\.pdf$/i, "");
    const outputFile = await save({
      filters: [{ name: "PDF", extensions: ["pdf"] }],
      defaultPath: `${stem}_watermarked.pdf`,
    });
    if (!outputFile) return;

    setStatus("running");
    setMessage("");
    try {
      await addWatermark(file, outputFile, text, fontSize, opacity, color, position);
      setStatus("done");
      setMessage("Watermark added successfully.");
    } catch (err) {
      setStatus("error");
      setMessage(String(err));
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold mb-1">Add Watermark</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Overlay text watermark on all pages of your PDF. Preview shown below.
        </p>
      </div>

      <FileDropZone onFiles={handleFile} />

      {file && (
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium block mb-1">Watermark text</label>
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Enter watermark text"
              className="w-full px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900"
            />
          </div>

          <fieldset>
            <legend className="text-sm font-medium mb-2">Position</legend>
            <div className="flex gap-2">
              {positionOptions.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPosition(p.id)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    position === p.id
                      ? "border-blue-500 bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400"
                      : "border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="flex gap-4 flex-wrap">
            <div>
              <label className="text-sm font-medium block mb-1">Font size</label>
              <input
                type="number"
                min={12}
                max={120}
                value={fontSize}
                onChange={(e) => setFontSize(Math.max(12, parseInt(e.target.value) || 48))}
                className="w-24 px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900"
              />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Opacity</label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0.05}
                  max={1}
                  step={0.05}
                  value={opacity}
                  onChange={(e) => setOpacity(parseFloat(e.target.value))}
                  className="w-32 accent-blue-500"
                />
                <span className="text-sm text-zinc-500 w-10">
                  {Math.round(opacity * 100)}%
                </span>
              </div>
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

          {/* PDF Preview with watermark overlay */}
          <div>
            <p className="text-sm font-medium mb-2">Preview:</p>
            <PdfViewer
              file={file}
              currentPage={currentPage}
              onPageChange={setCurrentPage}
              overlayItems={overlayItems}
              onPageInfo={handlePageInfo}
            />
          </div>

          <button
            onClick={handleApply}
            disabled={status === "running" || !text.trim()}
            className="px-5 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
          >
            {status === "running" ? "Applying..." : "Add Watermark"}
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
