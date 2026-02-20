import { useState, useCallback } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen } from "lucide-react";

export default function FileDropZone({ multiple = false, accept = "pdf", onFiles }) {
  const [dragging, setDragging] = useState(false);

  const filters =
    accept === "pdf"
      ? [{ name: "PDF Files", extensions: ["pdf"] }]
      : accept === "images"
        ? [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "bmp"] }]
        : [];

  const handleChoose = useCallback(async () => {
    const result = await open({
      multiple,
      filters,
    });
    if (!result) return;
    const paths = Array.isArray(result) ? result : [result];
    if (paths.length > 0) onFiles(paths);
  }, [multiple, filters, onFiles]);

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = () => setDragging(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      onFiles(files.map((f) => f.path || f.name));
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
        dragging
          ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
          : "border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-600"
      }`}
      onClick={handleChoose}
    >
      <FolderOpen
        size={32}
        className="mx-auto mb-3 text-zinc-400 dark:text-zinc-500"
      />
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Drag & drop {accept === "images" ? "images" : "PDF files"} here, or{" "}
        <span className="text-blue-500 dark:text-blue-400 font-medium">
          browse
        </span>
      </p>
    </div>
  );
}
