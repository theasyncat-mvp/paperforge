import { useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import FileDropZone from "../components/FileDropZone";
import { addPageNumbers } from "../lib/tauri";

const positions = [
  { id: "bottom-center", label: "Bottom Center" },
  { id: "bottom-left", label: "Bottom Left" },
  { id: "bottom-right", label: "Bottom Right" },
  { id: "top-center", label: "Top Center" },
  { id: "top-left", label: "Top Left" },
  { id: "top-right", label: "Top Right" },
];

const formats = [
  { id: "{n}", label: "1, 2, 3..." },
  { id: "Page {n}", label: "Page 1, Page 2..." },
  { id: "{n} / {total}", label: "1 / 10, 2 / 10..." },
  { id: "Page {n} of {total}", label: "Page 1 of 10..." },
];

export default function PageNumbersTool() {
  const [file, setFile] = useState(null);
  const [position, setPosition] = useState("bottom-center");
  const [startNumber, setStartNumber] = useState(1);
  const [fontSize, setFontSize] = useState(12);
  const [format, setFormat] = useState("{n}");
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");

  const handleFile = (paths) => {
    setFile(paths[0]);
    setStatus("idle");
    setMessage("");
  };

  const handleApply = async () => {
    if (!file) return;

    const stem = file.split("/").pop().replace(/\.pdf$/i, "");
    const outputFile = await save({
      filters: [{ name: "PDF", extensions: ["pdf"] }],
      defaultPath: `${stem}_numbered.pdf`,
    });
    if (!outputFile) return;

    setStatus("running");
    setMessage("");
    try {
      await addPageNumbers(file, outputFile, position, startNumber, fontSize, format);
      setStatus("done");
      setMessage(`Page numbers added successfully.`);
    } catch (err) {
      setStatus("error");
      setMessage(String(err));
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold mb-1">Add Page Numbers</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Add page numbers to every page of your PDF.
        </p>
      </div>

      <FileDropZone onFiles={handleFile} />

      {file && (
        <div className="space-y-4">
          <div className="text-sm">
            <span className="text-zinc-500 dark:text-zinc-400">File: </span>
            <span className="font-medium">{file.split("/").pop()}</span>
          </div>

          <fieldset>
            <legend className="text-sm font-medium mb-2">Position</legend>
            <div className="grid grid-cols-3 gap-2">
              {positions.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPosition(p.id)}
                  className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
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

          <fieldset>
            <legend className="text-sm font-medium mb-2">Format</legend>
            <div className="space-y-2">
              {formats.map((f) => (
                <label
                  key={f.id}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border cursor-pointer transition-colors ${
                    format === f.id
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
                      : "border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  }`}
                >
                  <input
                    type="radio"
                    name="format"
                    value={f.id}
                    checked={format === f.id}
                    onChange={() => setFormat(f.id)}
                    className="accent-blue-500"
                  />
                  <span className="text-sm">{f.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex gap-4">
            <div>
              <label className="text-sm font-medium block mb-1">Start from</label>
              <input
                type="number"
                min={1}
                value={startNumber}
                onChange={(e) => setStartNumber(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-24 px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900"
              />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Font size</label>
              <input
                type="number"
                min={6}
                max={36}
                value={fontSize}
                onChange={(e) => setFontSize(Math.max(6, parseInt(e.target.value) || 12))}
                className="w-24 px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900"
              />
            </div>
          </div>

          <button
            onClick={handleApply}
            disabled={status === "running"}
            className="px-5 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
          >
            {status === "running" ? "Adding..." : "Add Page Numbers"}
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
