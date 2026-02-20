import { useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import FileDropZone from "../components/FileDropZone";
import { splitPdf, getPdfPageCount } from "../lib/tauri";

export default function SplitTool() {
  const [file, setFile] = useState(null);
  const [pageCount, setPageCount] = useState(0);
  const [rangeInput, setRangeInput] = useState("");
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");

  const handleFile = async (paths) => {
    const f = paths[0];
    setFile(f);
    setStatus("idle");
    setMessage("");
    try {
      const count = await getPdfPageCount(f);
      setPageCount(count);
      setRangeInput(`1-${count}`);
    } catch (err) {
      setMessage(String(err));
      setStatus("error");
    }
  };

  const parseRanges = (input) => {
    return input
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((part) => {
        const match = part.match(/^(\d+)\s*-\s*(\d+)$/);
        if (match) return [parseInt(match[1]), parseInt(match[2])];
        const single = parseInt(part);
        if (!isNaN(single)) return [single, single];
        return null;
      })
      .filter(Boolean);
  };

  const handleSplit = async () => {
    if (!file) return;

    const ranges = parseRanges(rangeInput);
    if (ranges.length === 0) {
      setStatus("error");
      setMessage("Enter valid page ranges (e.g. 1-3, 4-5).");
      return;
    }

    const stem = file.split("/").pop().replace(/\.pdf$/i, "");
    const dir = await save({
      filters: [{ name: "PDF", extensions: ["pdf"] }],
      defaultPath: `${stem}_part1.pdf`,
    });
    if (!dir) return;

    const baseDir = dir.substring(0, dir.lastIndexOf("/"));
    const outputFiles = ranges.map(
      (_, i) => `${baseDir}/${stem}_part${i + 1}.pdf`
    );

    setStatus("running");
    setMessage("");
    try {
      await splitPdf(file, ranges, outputFiles);
      setStatus("done");
      setMessage(`Split into ${ranges.length} file(s) in ${baseDir}`);
    } catch (err) {
      setStatus("error");
      setMessage(String(err));
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold mb-1">Split PDF</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Extract page ranges into separate PDF files.
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
            <label className="block text-sm font-medium mb-1.5">
              Page ranges
            </label>
            <input
              type="text"
              value={rangeInput}
              onChange={(e) => setRangeInput(e.target.value)}
              placeholder="e.g. 1-3, 4-4, 5-10"
              className="w-full px-3 py-2 text-sm border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-zinc-400 mt-1">
              Each range becomes a separate file. Use commas to separate.
            </p>
          </div>

          <button
            onClick={handleSplit}
            disabled={status === "running"}
            className="px-5 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
          >
            {status === "running" ? "Splitting..." : "Split"}
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
    </div>
  );
}
