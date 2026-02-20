import ThemeToggle from "./ThemeToggle";
import { FileText } from "lucide-react";

export default function TopBar({ currentTool }) {
  return (
    <header className="h-14 flex items-center justify-between px-5 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
      <div className="flex items-center gap-3">
        <FileText size={22} className="text-blue-500 dark:text-blue-400" />
        <h1 className="text-lg font-semibold tracking-tight">Paperforge</h1>
        {currentTool && (
          <span className="text-sm text-zinc-500 dark:text-zinc-400 ml-2">
            / {currentTool}
          </span>
        )}
      </div>
      <ThemeToggle />
    </header>
  );
}
