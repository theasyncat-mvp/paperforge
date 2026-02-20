import { toolGroups } from "./ToolSidebar";

export default function HomePage({ onSelectTool }) {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold mb-1">Welcome to Paperforge</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Your local-first PDF toolkit. All processing happens on your device — nothing leaves your machine.
        </p>
      </div>

      {toolGroups.map((group) => (
        <div key={group.label}>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-3">
            {group.label}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {group.tools.map(({ id, label, icon: Icon, desc }) => (
              <button
                key={id}
                onClick={() => onSelectTool(id)}
                className="flex items-start gap-3 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-blue-300 dark:hover:border-blue-700 hover:bg-blue-50/50 dark:hover:bg-blue-950/30 transition-all text-left group"
              >
                <div className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 group-hover:bg-blue-100 dark:group-hover:bg-blue-900 transition-colors">
                  <Icon size={18} className="text-zinc-500 dark:text-zinc-400 group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors" />
                </div>
                <div>
                  <p className="text-sm font-semibold">{label}</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{desc}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
