import { invoke } from "@tauri-apps/api/core";

export async function mergePdfs(inputFiles, outputFile) {
  return invoke("merge_pdfs", { inputFiles, outputFile });
}

export async function splitPdf(inputFile, ranges, outputFiles) {
  return invoke("split_pdf", { inputFile, ranges, outputFiles });
}

export async function compressPdf(inputFile, outputFile, level) {
  return invoke("compress_pdf", { inputFile, outputFile, level });
}

export async function reorderPages(inputFile, outputFile, newOrder, pagesToDelete) {
  return invoke("reorder_pages", { inputFile, outputFile, newOrder, pagesToDelete });
}

export async function imagesToPdf(images, outputFile) {
  return invoke("images_to_pdf", { images, outputFile });
}

export async function pdfToImages(inputFile, outputDir, format) {
  return invoke("pdf_to_images", { inputFile, outputDir, format });
}

export async function comparePdfs(leftFile, rightFile) {
  return invoke("compare_pdfs", { leftFile, rightFile });
}

export async function getPdfPageCount(inputFile) {
  return invoke("get_pdf_page_count", { inputFile });
}

export async function rotatePdf(inputFile, outputFile, angle, pages) {
  return invoke("rotate_pdf", { inputFile, outputFile, angle, pages });
}

export async function addPageNumbers(inputFile, outputFile, position, startNumber, fontSize, formatStr) {
  return invoke("add_page_numbers", { inputFile, outputFile, position, startNumber, fontSize, formatStr });
}

export async function addWatermark(inputFile, outputFile, text, fontSize, opacity, color, position) {
  return invoke("add_watermark", { inputFile, outputFile, text, fontSize, opacity, color, position });
}

export async function getMetadata(inputFile) {
  return invoke("get_metadata", { inputFile });
}

export async function editMetadata(inputFile, outputFile, metadata) {
  return invoke("edit_metadata", { inputFile, outputFile, metadata });
}

export async function extractText(inputFile, outputFile) {
  return invoke("extract_text", { inputFile, outputFile });
}

export async function signPdf(inputFile, outputFile, imageData, pageNumber, x, y, width, height) {
  return invoke("sign_pdf", { inputFile, outputFile, imageData, pageNumber, x, y, width, height });
}

export async function addTextToPdf(inputFile, outputFile, text, pageNumber, x, y, fontSize, color) {
  return invoke("add_text_to_pdf", { inputFile, outputFile, text, pageNumber, x, y, fontSize, color });
}

export async function readPdfBytes(inputFile) {
  return invoke("read_pdf_bytes", { inputFile });
}

export async function protectPdf(inputFile, outputFile, userPassword, ownerPassword) {
  return invoke("protect_pdf", { inputFile, outputFile, userPassword, ownerPassword });
}

export async function unlockPdf(inputFile, outputFile, password) {
  return invoke("unlock_pdf", { inputFile, outputFile, password });
}
