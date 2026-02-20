import { useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import FileDropZone from "../components/FileDropZone";
import { getMetadata, editMetadata } from "../lib/tauri";

const fields = [
  { key: "title", label: "Title" },
  { key: "author", label: "Author" },
  { key: "subject", label: "Subject" },
  { key: "keywords", label: "Keywords" },
  { key: "creator", label: "Creator" },
];

export default function MetadataTool() {
  const [file, setFile] = useState(null);
  const [meta, setMeta] = useState(null);
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");

  const handleFile = async (paths) => {
    setFile(paths[0]);
    setStatus("idle");
    setMessage("");
    try {
      const data = await getMetadata(paths[0]);
      setMeta(data);
    } catch (err) {
      setStatus("error");
      setMessage(String(err));
    }
  };

  const updateField = (key, value) => {
    setMeta((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!file || !meta) return;

    const stem = file.split("/").pop().replace(/\.pdf$/i, "");
    const outputFile = await save({
      filters: [{ name: "PDF", extensions: ["pdf"] }],
      defaultPath: `${stem}_meta.pdf`,
    });
    if (!outputFile) return;

    setStatus("running");
    setMessage("");
    try {
      await editMetadata(file, outputFile, meta);
      setStatus("done");
      setMessage("Metadata updated successfully.");
    } catch (err) {
      setStatus("error");
      setMessage(String(err));
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold mb-1">PDF Metadata</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          View and edit title, author, subject, and other PDF properties.
        </p>
      </div>

      <FileDropZone onFiles={handleFile} />

      {meta && (
        <div className="space-y-4">
          <div className="text-sm">
            <span className="text-zinc-500 dark:text-zinc-400">File: </span>
            <span className="font-medium">{file.split("/").pop()}</span>
          </div>

          <div className="space-y-3">
            {fields.map((f) => (
              <div key={f.key}>
                <label className="text-sm font-medium block mb-1">{f.label}</label>
                <input
                  type="text"
                  value={meta[f.key] || ""}
                  onChange={(e) => updateField(f.key, e.target.value)}
                  placeholder={`Enter ${f.label.toLowerCase()}`}
                  className="w-full px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900"
                />
              </div>
            ))}
          </div>

          <button
            onClick={handleSave}
            disabled={status === "running"}
            className="px-5 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
          >
            {status === "running" ? "Saving..." : "Save Metadata"}
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
