import { useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { ChevronUp, ChevronDown, X } from "lucide-react";
import FileDropZone from "../components/FileDropZone";
import { imagesToPdf } from "../lib/tauri";

export default function ImagesToPdfTool() {
  const [files, setFiles] = useState([]);
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");

  const addFiles = (paths) => {
    setFiles((prev) => [...prev, ...paths]);
    setStatus("idle");
    setMessage("");
  };

  const removeFile = (index) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const moveFile = (index, direction) => {
    setFiles((prev) => {
      const arr = [...prev];
      const target = index + direction;
      if (target < 0 || target >= arr.length) return arr;
      [arr[index], arr[target]] = [arr[target], arr[index]];
      return arr;
    });
  };

  const handleCreate = async () => {
    if (files.length === 0) return;

    const outputFile = await save({
      filters: [{ name: "PDF", extensions: ["pdf"] }],
      defaultPath: "images.pdf",
    });
    if (!outputFile) return;

    setStatus("running");
    setMessage("");
    try {
      await imagesToPdf(files, outputFile);
      setStatus("done");
      setMessage(`Created PDF with ${files.length} page(s) → ${outputFile}`);
    } catch (err) {
      setStatus("error");
      setMessage(String(err));
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold mb-1">Images to PDF</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Combine multiple images into a single PDF, one image per page.
        </p>
      </div>

      <FileDropZone multiple accept="images" onFiles={addFiles} />

      {files.length > 0 && (
        <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg divide-y divide-zinc-200 dark:divide-zinc-700">
          {files.map((file, i) => (
            <div
              key={i}
              className="flex items-center gap-2 px-4 py-2.5 text-sm"
            >
              <span className="text-zinc-400 w-6 text-right">{i + 1}.</span>
              <span className="flex-1 truncate">{file.split("/").pop()}</span>
              <button
                onClick={() => moveFile(i, -1)}
                disabled={i === 0}
                className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30"
              >
                <ChevronUp size={16} />
              </button>
              <button
                onClick={() => moveFile(i, 1)}
                disabled={i === files.length - 1}
                className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30"
              >
                <ChevronDown size={16} />
              </button>
              <button
                onClick={() => removeFile(i)}
                className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-red-500"
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={handleCreate}
        disabled={files.length === 0 || status === "running"}
        className="px-5 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {status === "running" ? "Creating..." : "Create PDF"}
      </button>

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
