import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { comparePdfs } from "../lib/tauri";

export default function CompareTool() {
  const [leftFile, setLeftFile] = useState(null);
  const [rightFile, setRightFile] = useState(null);
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState(null);

  const pickFile = async (side) => {
    const path = await open({
      filters: [{ name: "PDF Files", extensions: ["pdf"] }],
    });
    if (!path) return;
    if (side === "left") setLeftFile(path);
    else setRightFile(path);
    setResult(null);
    setStatus("idle");
    setMessage("");
  };

  const handleCompare = async () => {
    if (!leftFile || !rightFile) {
      setStatus("error");
      setMessage("Select both PDF files to compare.");
      return;
    }

    setStatus("running");
    setMessage("");
    setResult(null);
    try {
      const res = await comparePdfs(leftFile, rightFile);
      setResult(res);
      setStatus("done");
    } catch (err) {
      setStatus("error");
      setMessage(String(err));
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold mb-1">Compare PDFs</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Compare two PDFs side-by-side for basic differences.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={() => pickFile("left")}
          className="border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded-xl p-6 text-center hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors"
        >
          <p className="text-sm font-medium mb-1">PDF A</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
            {leftFile ? leftFile.split("/").pop() : "Click to select"}
          </p>
        </button>
        <button
          onClick={() => pickFile("right")}
          className="border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded-xl p-6 text-center hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors"
        >
          <p className="text-sm font-medium mb-1">PDF B</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
            {rightFile ? rightFile.split("/").pop() : "Click to select"}
          </p>
        </button>
      </div>

      <button
        onClick={handleCompare}
        disabled={!leftFile || !rightFile || status === "running"}
        className="px-5 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {status === "running" ? "Comparing..." : "Compare"}
      </button>

      {message && status === "error" && (
        <p className="text-sm text-red-500">{message}</p>
      )}

      {result && (
        <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg p-5 space-y-3">
          <h3 className="text-sm font-semibold">Comparison Result</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-zinc-500 dark:text-zinc-400">
                PDF A pages:{" "}
              </span>
              <span className="font-medium">{result.left_page_count}</span>
            </div>
            <div>
              <span className="text-zinc-500 dark:text-zinc-400">
                PDF B pages:{" "}
              </span>
              <span className="font-medium">{result.right_page_count}</span>
            </div>
          </div>
          <div className="text-sm space-y-1">
            <div>
              <span className="text-zinc-500 dark:text-zinc-400">
                Same page count:{" "}
              </span>
              <span
                className={
                  result.same_page_count ? "text-emerald-600" : "text-amber-500"
                }
              >
                {result.same_page_count ? "Yes" : "No"}
              </span>
              {!result.same_page_count && (
                <span className="text-zinc-400 ml-1">
                  (diff: {result.page_count_diff > 0 ? "+" : ""}
                  {result.page_count_diff})
                </span>
              )}
            </div>
            <div>
              <span className="text-zinc-500 dark:text-zinc-400">
                Content differs:{" "}
              </span>
              <span
                className={
                  result.simple_difference
                    ? "text-amber-500"
                    : "text-emerald-600"
                }
              >
                {result.simple_difference ? "Yes" : "No"}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
