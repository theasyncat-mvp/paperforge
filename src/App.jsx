import { useState, useEffect } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import TopBar from "./components/TopBar";
import ToolSidebar, { allTools } from "./components/ToolSidebar";
import HomePage from "./components/HomePage";
import MergeTool from "./tools/MergeTool";
import SplitTool from "./tools/SplitTool";
import CompressTool from "./tools/CompressTool";
import ReorderTool from "./tools/ReorderTool";
import ImagesToPdfTool from "./tools/ImagesToPdfTool";
import PdfToImagesTool from "./tools/PdfToImagesTool";
import CompareTool from "./tools/CompareTool";
import RotateTool from "./tools/RotateTool";
import PageNumbersTool from "./tools/PageNumbersTool";
import WatermarkTool from "./tools/WatermarkTool";
import MetadataTool from "./tools/MetadataTool";
import ExtractTextTool from "./tools/ExtractTextTool";
import AddTextTool from "./tools/AddTextTool";
import SignTool from "./tools/SignTool";
import ProtectTool from "./tools/ProtectTool";
import UnlockTool from "./tools/UnlockTool";
import "./App.css";

const toolComponents = {
  merge: MergeTool,
  split: SplitTool,
  compress: CompressTool,
  reorder: ReorderTool,
  "images-to-pdf": ImagesToPdfTool,
  "pdf-to-images": PdfToImagesTool,
  compare: CompareTool,
  rotate: RotateTool,
  "page-numbers": PageNumbersTool,
  watermark: WatermarkTool,
  metadata: MetadataTool,
  "extract-text": ExtractTextTool,
  "add-text": AddTextTool,
  sign: SignTool,
  protect: ProtectTool,
  unlock: UnlockTool,
};

export default function App() {
  const [activeTool, setActiveTool] = useState("home");

  // Check for updates silently on startup
  useEffect(() => {
    const checkForUpdates = async () => {
      try {
        const update = await check();
        if (!update) return;
        const confirmed = window.confirm(
          `Update available: v${update.version}\nInstall now?`
        );
        if (confirmed) {
          await update.downloadAndInstall();
          await relaunch();
        }
      } catch {
        // silently ignore
      }
    };
    checkForUpdates();
  }, []);

  const ActiveComponent = toolComponents[activeTool];
  const activeLabel = allTools.find((t) => t.id === activeTool)?.label;

  return (
    <div className="h-screen flex flex-col bg-zinc-100 dark:bg-zinc-950">
      <TopBar currentTool={activeTool === "home" ? null : activeLabel} />
      <div className="flex flex-1 overflow-hidden">
        <ToolSidebar activeTool={activeTool} onSelectTool={setActiveTool} />
        <main className="flex-1 overflow-y-auto p-6">
          <div className={activeTool === "home" ? "max-w-3xl mx-auto" : "max-w-2xl mx-auto"}>
            {activeTool === "home" ? (
              <HomePage onSelectTool={setActiveTool} />
            ) : (
              ActiveComponent && <ActiveComponent key={activeTool} />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
