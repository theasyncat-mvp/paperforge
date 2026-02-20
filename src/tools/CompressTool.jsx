import { useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import FileDropZone from "../components/FileDropZone";
import { compressPdf } from "../lib/tauri";

const levels = [
  { id: "light", label: "Light", desc: "Minimal quality loss" },
  { id: "balanced", label: "Balanced", desc: "Good balance of size and quality" },
  { id: "strong", label: "Strong", desc: "Maximum compression" },
];

export default function CompressTool() {
  const [file, setFile] = useState(null);
  const [level, setLevel] = useState("balanced");
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");

  const handleFile = (paths) => {
    setFile(paths[0]);
    setStatus("idle");
    setMessage("");
  };

  const handleCompress = async () => {
    if (!file) return;

    const stem = file.split("/").pop().replace(/\.pdf$/i, "");
    const outputFile = await save({
      filters: [{ name: "PDF", extensions: ["pdf"] }],
      defaultPath: `${stem}_compressed.pdf`,
    });
    if (!outputFile) return;

    setStatus("running");
    setMessage("");
    try {
      const result = await compressPdf(file, outputFile, level);
      setStatus("done");
      setMessage(result);
    } catch (err) {
      setStatus("error");
      setMessage(String(err));
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold mb-1">Compress PDF</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Reduce file size by compressing images and cleaning unused objects.
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
            <legend className="text-sm font-medium mb-2">
              Compression level
            </legend>
            <div className="space-y-2">
              {levels.map((l) => (
                <label
                  key={l.id}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-colors ${
                    level === l.id
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
                      : "border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  }`}
                >
                  <input
                    type="radio"
                    name="level"
                    value={l.id}
                    checked={level === l.id}
                    onChange={() => setLevel(l.id)}
                    className="accent-blue-500"
                  />
                  <div>
                    <span className="text-sm font-medium">{l.label}</span>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {l.desc}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </fieldset>

          <button
            onClick={handleCompress}
            disabled={status === "running"}
            className="px-5 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
          >
            {status === "running" ? "Compressing..." : "Compress"}
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
