import { useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { ChevronUp, ChevronDown, Trash2 } from "lucide-react";
import FileDropZone from "../components/FileDropZone";
import { reorderPages, getPdfPageCount } from "../lib/tauri";

export default function ReorderTool() {
  const [file, setFile] = useState(null);
  const [pages, setPages] = useState([]);
  const [deleted, setDeleted] = useState(new Set());
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");

  const handleFile = async (paths) => {
    const f = paths[0];
    setFile(f);
    setDeleted(new Set());
    setStatus("idle");
    setMessage("");
    try {
      const count = await getPdfPageCount(f);
      setPages(Array.from({ length: count }, (_, i) => i + 1));
    } catch (err) {
      setMessage(String(err));
      setStatus("error");
    }
  };

  const movePage = (index, direction) => {
    setPages((prev) => {
      const arr = [...prev];
      const target = index + direction;
      if (target < 0 || target >= arr.length) return arr;
      [arr[index], arr[target]] = [arr[target], arr[index]];
      return arr;
    });
  };

  const toggleDelete = (pageNum) => {
    setDeleted((prev) => {
      const next = new Set(prev);
      if (next.has(pageNum)) next.delete(pageNum);
      else next.add(pageNum);
      return next;
    });
  };

  const handleApply = async () => {
    if (!file) return;

    const remaining = pages.filter((p) => !deleted.has(p));
    if (remaining.length === 0) {
      setStatus("error");
      setMessage("Cannot delete all pages.");
      return;
    }

    const stem = file.split("/").pop().replace(/\.pdf$/i, "");
    const outputFile = await save({
      filters: [{ name: "PDF", extensions: ["pdf"] }],
      defaultPath: `${stem}_reordered.pdf`,
    });
    if (!outputFile) return;

    setStatus("running");
    setMessage("");
    try {
      await reorderPages(file, outputFile, pages, [...deleted]);
      setStatus("done");
      setMessage(`Saved reordered PDF → ${outputFile}`);
    } catch (err) {
      setStatus("error");
      setMessage(String(err));
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold mb-1">Reorder / Delete Pages</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Rearrange or remove pages from a PDF.
        </p>
      </div>

      <FileDropZone onFiles={handleFile} />

      {pages.length > 0 && (
        <div className="space-y-4">
          <div className="text-sm text-zinc-500 dark:text-zinc-400">
            {pages.length} pages total, {deleted.size} marked for deletion
          </div>

          <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg divide-y divide-zinc-200 dark:divide-zinc-700 max-h-80 overflow-y-auto">
            {pages.map((pageNum, i) => (
              <div
                key={pageNum}
                className={`flex items-center gap-2 px-4 py-2 text-sm ${
                  deleted.has(pageNum) ? "opacity-40 line-through" : ""
                }`}
              >
                <span className="text-zinc-400 w-8 text-right">
                  Page {pageNum}
                </span>
                <span className="flex-1" />
                <button
                  onClick={() => movePage(i, -1)}
                  disabled={i === 0}
                  className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30"
                >
                  <ChevronUp size={16} />
                </button>
                <button
                  onClick={() => movePage(i, 1)}
                  disabled={i === pages.length - 1}
                  className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30"
                >
                  <ChevronDown size={16} />
                </button>
                <button
                  onClick={() => toggleDelete(pageNum)}
                  className={`p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                    deleted.has(pageNum)
                      ? "text-red-500"
                      : "text-zinc-400 hover:text-red-500"
                  }`}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={handleApply}
            disabled={status === "running"}
            className="px-5 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
          >
            {status === "running" ? "Applying..." : "Apply Reorder"}
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
