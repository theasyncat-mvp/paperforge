import { useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import FileDropZone from "../components/FileDropZone";
import { extractText } from "../lib/tauri";

export default function ExtractTextTool() {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");

  const handleFile = (paths) => {
    setFile(paths[0]);
    setStatus("idle");
    setMessage("");
  };

  const handleExtract = async () => {
    if (!file) return;

    const stem = file.split("/").pop().replace(/\.pdf$/i, "");
    const outputFile = await save({
      filters: [{ name: "Text File", extensions: ["txt"] }],
      defaultPath: `${stem}.txt`,
    });
    if (!outputFile) return;

    setStatus("running");
    setMessage("");
    try {
      const result = await extractText(file, outputFile);
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
        <h2 className="text-xl font-semibold mb-1">Extract Text</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Extract all readable text from a PDF and save it as a text file.
        </p>
      </div>

      <FileDropZone onFiles={handleFile} />

      {file && (
        <div className="space-y-4">
          <div className="text-sm">
            <span className="text-zinc-500 dark:text-zinc-400">File: </span>
            <span className="font-medium">{file.split("/").pop()}</span>
          </div>

          <button
            onClick={handleExtract}
            disabled={status === "running"}
            className="px-5 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
          >
            {status === "running" ? "Extracting..." : "Extract Text"}
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
