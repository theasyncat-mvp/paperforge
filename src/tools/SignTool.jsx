import { useState, useRef, useCallback } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import FileDropZone from "../components/FileDropZone";
import PdfViewer from "../components/PdfViewer";
import { signPdf } from "../lib/tauri";

export default function SignTool() {
  const [file, setFile] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState({ width: 612, height: 792 });
  const [signatureMode, setSignatureMode] = useState("draw");
  const [typedName, setTypedName] = useState("");
  const [signatureData, setSignatureData] = useState(null);
  const [sigWidth, setSigWidth] = useState(150);
  const [sigHeight, setSigHeight] = useState(50);
  const [placement, setPlacement] = useState(null); // { x, y, pageNumber }
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");

  const canvasRef = useRef(null);
  const isDrawing = useRef(false);

  const handleFile = (paths) => {
    setFile(paths[0]);
    setPlacement(null);
    setStatus("idle");
    setMessage("");
  };

  const startDrawing = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
    isDrawing.current = true;
  };

  const draw = (e) => {
    if (!isDrawing.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.stroke();
  };

  const stopDrawing = () => {
    isDrawing.current = false;
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSignatureData(null);
  };

  const getCanvasImageData = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (!blob) return resolve(null);
        const reader = new FileReader();
        reader.onload = () => resolve(new Uint8Array(reader.result));
        reader.readAsArrayBuffer(blob);
      }, "image/png");
    });
  }, []);

  const getTypedSignatureData = useCallback(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 400;
    canvas.height = 100;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, 400, 100);
    ctx.fillStyle = "#000";
    ctx.font = "italic 36px Georgia, serif";
    ctx.fillText(typedName, 20, 60);
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (!blob) return resolve(null);
        const reader = new FileReader();
        reader.onload = () => resolve(new Uint8Array(reader.result));
        reader.readAsArrayBuffer(blob);
      }, "image/png");
    });
  }, [typedName]);

  const handleUploadSignature = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setSignatureData(new Uint8Array(reader.result));
    reader.readAsArrayBuffer(f);
  };

  const handlePageClick = useCallback(
    (pdfX, pdfY, pageNumber) => {
      setPlacement({ x: pdfX, y: pdfY, pageNumber });
      setMessage("");
    },
    []
  );

  const handlePageInfo = useCallback((info) => {
    setPageSize({ width: info.width, height: info.height });
  }, []);

  const overlayItems = placement
    ? [
        {
          pageNumber: placement.pageNumber,
          x: placement.x,
          y: placement.y,
          width: sigWidth,
          height: sigHeight,
          render: (scale) => (
            <div
              className="border-2 border-dashed border-blue-500 bg-blue-50/30 rounded flex items-center justify-center"
              style={{ width: "100%", height: "100%" }}
            >
              <span
                className="text-blue-500 text-center"
                style={{ fontSize: Math.max(10, 12 * scale) }}
              >
                Signature
              </span>
            </div>
          ),
        },
      ]
    : [];

  const handleSign = async () => {
    if (!file || !placement) return;

    let imageData;
    if (signatureMode === "draw") {
      imageData = await getCanvasImageData();
    } else if (signatureMode === "type") {
      if (!typedName.trim()) {
        setMessage("Please enter your name.");
        setStatus("error");
        return;
      }
      imageData = await getTypedSignatureData();
    } else {
      imageData = signatureData;
    }

    if (!imageData) {
      setMessage("No signature provided.");
      setStatus("error");
      return;
    }

    const stem = file.split("/").pop().replace(/\.pdf$/i, "");
    const outputFile = await save({
      filters: [{ name: "PDF", extensions: ["pdf"] }],
      defaultPath: `${stem}_signed.pdf`,
    });
    if (!outputFile) return;

    setStatus("running");
    setMessage("");
    try {
      await signPdf(
        file,
        outputFile,
        Array.from(imageData),
        placement.pageNumber,
        placement.x,
        placement.y,
        sigWidth,
        sigHeight
      );
      setStatus("done");
      setMessage("PDF signed successfully.");
    } catch (err) {
      setStatus("error");
      setMessage(String(err));
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold mb-1">Sign PDF</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Draw, type, or upload a signature and click on the PDF to place it.
        </p>
      </div>

      <FileDropZone onFiles={handleFile} />

      {file && (
        <div className="space-y-4">
          {/* Signature creation panel */}
          <div className="flex border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden">
            {[
              { id: "draw", label: "Draw" },
              { id: "type", label: "Type" },
              { id: "upload", label: "Upload" },
            ].map((mode) => (
              <button
                key={mode.id}
                onClick={() => setSignatureMode(mode.id)}
                className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
                  signatureMode === mode.id
                    ? "bg-blue-500 text-white"
                    : "bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>

          {signatureMode === "draw" && (
            <div>
              <canvas
                ref={canvasRef}
                width={400}
                height={120}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                className="w-full border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white cursor-crosshair"
                style={{ touchAction: "none" }}
              />
              <button
                onClick={clearCanvas}
                className="mt-2 text-xs text-zinc-500 hover:text-red-500 transition-colors"
              >
                Clear
              </button>
            </div>
          )}

          {signatureMode === "type" && (
            <div>
              <input
                type="text"
                value={typedName}
                onChange={(e) => setTypedName(e.target.value)}
                placeholder="Type your name"
                className="w-full px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900"
              />
              {typedName && (
                <div className="mt-2 p-4 border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900">
                  <p className="text-2xl italic font-serif text-zinc-800 dark:text-zinc-200">
                    {typedName}
                  </p>
                </div>
              )}
            </div>
          )}

          {signatureMode === "upload" && (
            <div>
              <input
                type="file"
                accept="image/*"
                onChange={handleUploadSignature}
                className="text-sm"
              />
              {signatureData && (
                <p className="text-xs text-emerald-600 mt-1">
                  Image loaded ({signatureData.length} bytes)
                </p>
              )}
            </div>
          )}

          {/* Signature size */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium block mb-1">Signature width (pt)</label>
              <input
                type="number"
                min={20}
                value={sigWidth}
                onChange={(e) => setSigWidth(Math.max(20, parseInt(e.target.value) || 150))}
                className="w-full px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900"
              />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Signature height (pt)</label>
              <input
                type="number"
                min={10}
                value={sigHeight}
                onChange={(e) => setSigHeight(Math.max(10, parseInt(e.target.value) || 50))}
                className="w-full px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900"
              />
            </div>
          </div>

          {/* PDF Viewer - click to place */}
          <div>
            <p className="text-sm font-medium mb-2">
              Click on the page to place your signature:
            </p>
            <PdfViewer
              file={file}
              currentPage={currentPage}
              onPageChange={setCurrentPage}
              overlayItems={overlayItems}
              onOverlayClick={handlePageClick}
              onPageInfo={handlePageInfo}
            />
          </div>

          {placement && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Placed at page {placement.pageNumber}, position ({Math.round(placement.x)},{" "}
              {Math.round(placement.y)}) pt
            </p>
          )}

          <button
            onClick={handleSign}
            disabled={status === "running" || !placement}
            className="px-5 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
          >
            {status === "running" ? "Signing..." : "Sign PDF"}
          </button>
        </div>
      )}

      {message && (
        <p
          className={`text-sm ${
            status === "error"
              ? "text-red-500"
              : "text-emerald-600 dark:text-emerald-400"
          }`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
