import { useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import FileDropZone from "../components/FileDropZone";
import { rotatePdf, getPdfPageCount } from "../lib/tauri";

const angles = [
  { value: 90, label: "90° Clockwise" },
  { value: 180, label: "180°" },
  { value: 270, label: "90° Counter-clockwise" },
];

export default function RotateTool() {
  const [file, setFile] = useState(null);
  const [angle, setAngle] = useState(90);
  const [pageCount, setPageCount] = useState(0);
  const [pageSelection, setPageSelection] = useState("all");
  const [customPages, setCustomPages] = useState("");
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");

  const handleFile = async (paths) => {
    setFile(paths[0]);
    setStatus("idle");
    setMessage("");
    try {
      const count = await getPdfPageCount(paths[0]);
      setPageCount(count);
    } catch {
      setPageCount(0);
    }
  };

  const parsePages = () => {
    if (pageSelection === "all") return [];
    return customPages
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n) && n >= 1 && n <= pageCount);
  };

  const handleRotate = async () => {
    if (!file) return;

    const stem = file.split("/").pop().replace(/\.pdf$/i, "");
    const outputFile = await save({
      filters: [{ name: "PDF", extensions: ["pdf"] }],
      defaultPath: `${stem}_rotated.pdf`,
    });
    if (!outputFile) return;

    setStatus("running");
    setMessage("");
    try {
      await rotatePdf(file, outputFile, angle, parsePages());
      setStatus("done");
      setMessage(`Rotated ${pageSelection === "all" ? "all pages" : "selected pages"} by ${angle}°`);
    } catch (err) {
      setStatus("error");
      setMessage(String(err));
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold mb-1">Rotate PDF</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Rotate all or specific pages by 90°, 180°, or 270°.
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

          <fieldset>
            <legend className="text-sm font-medium mb-2">Rotation angle</legend>
            <div className="flex gap-2">
              {angles.map((a) => (
                <button
                  key={a.value}
                  onClick={() => setAngle(a.value)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    angle === a.value
                      ? "border-blue-500 bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400"
                      : "border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  }`}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-medium mb-2">Pages</legend>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="pages"
                  checked={pageSelection === "all"}
                  onChange={() => setPageSelection("all")}
                  className="accent-blue-500"
                />
                All pages
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="pages"
                  checked={pageSelection === "custom"}
                  onChange={() => setPageSelection("custom")}
                  className="accent-blue-500"
                />
                Specific pages
              </label>
              {pageSelection === "custom" && (
                <input
                  type="text"
                  value={customPages}
                  onChange={(e) => setCustomPages(e.target.value)}
                  placeholder="e.g. 1, 3, 5"
                  className="w-full px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900"
                />
              )}
            </div>
          </fieldset>

          <button
            onClick={handleRotate}
            disabled={status === "running"}
            className="px-5 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
          >
            {status === "running" ? "Rotating..." : "Rotate"}
          </button>
        </div>
      )}

      {message && (
        <p className={`text-sm ${status === "error" ? "text-red-500" : "text-emerald-600 dark:text-emerald-400"}`}>
          {message}
        </p>
      )}
    </div>
  );
}
