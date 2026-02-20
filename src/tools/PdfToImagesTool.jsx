import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import FileDropZone from "../components/FileDropZone";
import { pdfToImages, getPdfPageCount } from "../lib/tauri";

export default function PdfToImagesTool() {
  const [file, setFile] = useState(null);
  const [pageCount, setPageCount] = useState(0);
  const [format, setFormat] = useState("png");
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const [outputPaths, setOutputPaths] = useState([]);

  const handleFile = async (paths) => {
    const f = paths[0];
    setFile(f);
    setOutputPaths([]);
    setStatus("idle");
    setMessage("");
    try {
      const count = await getPdfPageCount(f);
      setPageCount(count);
    } catch (err) {
      setMessage(String(err));
      setStatus("error");
    }
  };

  const handleExport = async () => {
    if (!file) return;

    const outputDir = await open({ directory: true });
    if (!outputDir) return;

    setStatus("running");
    setMessage("");
    setOutputPaths([]);
    try {
      const paths = await pdfToImages(file, outputDir, format);
      setOutputPaths(paths);
      setStatus("done");
      setMessage(`Exported ${paths.length} image(s) to ${outputDir}`);
    } catch (err) {
      setStatus("error");
      setMessage(String(err));
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold mb-1">PDF to Images</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Export each page of a PDF as an image file.
        </p>
      </div>

      <FileDropZone onFiles={handleFile} />

      {file && (
        <div className="space-y-4">
          <div className="text-sm">
            <span className="text-zinc-500 dark:text-zinc-400">File: </span>
            <span className="font-medium">{file.split("/").pop()}</span>
            <span className="text-zinc-400 ml-2">({pageCount} pages)</span>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">Format</label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              className="px-3 py-2 text-sm border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="png">PNG</option>
              <option value="jpg">JPG</option>
            </select>
          </div>

          <button
            onClick={handleExport}
            disabled={status === "running"}
            className="px-5 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
          >
            {status === "running" ? "Exporting..." : "Export"}
          </button>
        </div>
      )}

      {message && (
        <p
          className={`text-sm ${status === "error" ? "text-red-500" : "text-emerald-600 dark:text-emerald-400"}`}
        >
          {message}
        </p>
      )}

      {outputPaths.length > 0 && (
        <div className="text-xs text-zinc-400 space-y-0.5">
          {outputPaths.map((p, i) => (
            <div key={i}>{p}</div>
          ))}
        </div>
      )}
    </div>
  );
}
