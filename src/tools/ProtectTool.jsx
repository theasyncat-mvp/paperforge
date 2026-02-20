import { useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import FileDropZone from "../components/FileDropZone";
import { protectPdf } from "../lib/tauri";
import { Eye, EyeOff } from "lucide-react";

export default function ProtectTool() {
  const [file, setFile] = useState(null);
  const [userPassword, setUserPassword] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [showUser, setShowUser] = useState(false);
  const [showOwner, setShowOwner] = useState(false);
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");

  const handleFile = (paths) => {
    setFile(paths[0]);
    setStatus("idle");
    setMessage("");
  };

  const handleProtect = async () => {
    if (!file) return;
    if (!userPassword && !ownerPassword) {
      setMessage("Enter at least one password.");
      setStatus("error");
      return;
    }

    const stem = file.split("/").pop().replace(/\.pdf$/i, "");
    const outputFile = await save({
      filters: [{ name: "PDF", extensions: ["pdf"] }],
      defaultPath: `${stem}_protected.pdf`,
    });
    if (!outputFile) return;

    setStatus("running");
    setMessage("");
    try {
      await protectPdf(file, outputFile, userPassword, ownerPassword);
      setStatus("done");
      setMessage("PDF protected with password successfully.");
    } catch (err) {
      setStatus("error");
      setMessage(String(err));
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold mb-1">Protect PDF</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Add password protection to your PDF file.
        </p>
      </div>

      <FileDropZone onFiles={handleFile} />

      {file && (
        <div className="space-y-4">
          <div className="text-sm">
            <span className="text-zinc-500 dark:text-zinc-400">File: </span>
            <span className="font-medium">{file.split("/").pop()}</span>
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">
              User password
              <span className="text-zinc-400 font-normal ml-1">(required to open)</span>
            </label>
            <div className="relative">
              <input
                type={showUser ? "text" : "password"}
                value={userPassword}
                onChange={(e) => setUserPassword(e.target.value)}
                placeholder="Enter password"
                className="w-full px-3 py-2 pr-10 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900"
              />
              <button
                onClick={() => setShowUser(!showUser)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
              >
                {showUser ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">
              Owner password
              <span className="text-zinc-400 font-normal ml-1">(optional, for editing permissions)</span>
            </label>
            <div className="relative">
              <input
                type={showOwner ? "text" : "password"}
                value={ownerPassword}
                onChange={(e) => setOwnerPassword(e.target.value)}
                placeholder="Enter owner password"
                className="w-full px-3 py-2 pr-10 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900"
              />
              <button
                onClick={() => setShowOwner(!showOwner)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
              >
                {showOwner ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button
            onClick={handleProtect}
            disabled={status === "running" || (!userPassword && !ownerPassword)}
            className="px-5 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
          >
            {status === "running" ? "Protecting..." : "Protect PDF"}
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
