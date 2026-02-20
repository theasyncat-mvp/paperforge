import {
  Layers,
  Scissors,
  Shrink,
  ArrowUpDown,
  Images,
  FolderOpen,
  GitCompareArrows,
  RotateCw,
  Hash,
  Droplets,
  FileText,
  PenLine,
  Type,
  Lock,
  Unlock,
  Home,
} from "lucide-react";

const toolGroups = [
  {
    label: "Organize",
    tools: [
      { id: "merge", label: "Merge PDFs", icon: Layers, desc: "Combine multiple PDFs into one" },
      { id: "split", label: "Split PDF", icon: Scissors, desc: "Extract page ranges into separate files" },
      { id: "reorder", label: "Reorder Pages", icon: ArrowUpDown, desc: "Rearrange or delete pages" },
      { id: "rotate", label: "Rotate PDF", icon: RotateCw, desc: "Rotate pages by any angle" },
    ],
  },
  {
    label: "Optimize",
    tools: [
      { id: "compress", label: "Compress PDF", icon: Shrink, desc: "Reduce file size" },
      { id: "page-numbers", label: "Page Numbers", icon: Hash, desc: "Add page numbers to every page" },
      { id: "watermark", label: "Watermark", icon: Droplets, desc: "Add text watermark to pages" },
    ],
  },
  {
    label: "Convert",
    tools: [
      { id: "images-to-pdf", label: "Images to PDF", icon: Images, desc: "Create PDF from images" },
      { id: "pdf-to-images", label: "PDF to Images", icon: FolderOpen, desc: "Export pages as images" },
      { id: "extract-text", label: "Extract Text", icon: FileText, desc: "Extract text content to file" },
    ],
  },
  {
    label: "Edit & Sign",
    tools: [
      { id: "add-text", label: "Add Text", icon: Type, desc: "Place text on any page" },
      { id: "sign", label: "Sign PDF", icon: PenLine, desc: "Draw or upload a signature" },
    ],
  },
  {
    label: "Security",
    tools: [
      { id: "protect", label: "Protect PDF", icon: Lock, desc: "Add password protection" },
      { id: "unlock", label: "Unlock PDF", icon: Unlock, desc: "Remove password from PDF" },
    ],
  },
  {
    label: "Analyze",
    tools: [
      { id: "compare", label: "Compare PDFs", icon: GitCompareArrows, desc: "Compare two PDF files" },
      { id: "metadata", label: "Metadata", icon: FileText, desc: "View and edit PDF properties" },
    ],
  },
];

const allTools = toolGroups.flatMap((g) => g.tools);

export default function ToolSidebar({ activeTool, onSelectTool }) {
  return (
    <aside className="w-56 shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-y-auto">
      <nav className="p-3 space-y-1">
        <button
          onClick={() => onSelectTool("home")}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            activeTool === "home"
              ? "bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400"
              : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          }`}
        >
          <Home size={18} />
          All Tools
        </button>

        <div className="h-px bg-zinc-200 dark:bg-zinc-800 my-2" />

        {toolGroups.map((group) => (
          <div key={group.label} className="mb-1">
            <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              {group.label}
            </p>
            {group.tools.map(({ id, label, icon: Icon }) => {
              const active = activeTool === id;
              return (
                <button
                  key={id}
                  onClick={() => onSelectTool(id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    active
                      ? "bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400"
                      : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  }`}
                >
                  <Icon size={16} />
                  {label}
                </button>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}

export { allTools, toolGroups };
