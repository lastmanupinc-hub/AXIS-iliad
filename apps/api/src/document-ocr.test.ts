import { describe, it, expect } from "vitest";
import { isImageMime, ocrImageWith, type Recognizer } from "./document-ocr.js";

describe("isImageMime", () => {
  it("recognizes raster image mimes, rejects others", () => {
    expect(isImageMime("image/png")).toBe(true);
    expect(isImageMime("image/jpeg")).toBe(true);
    expect(isImageMime("image/tiff")).toBe(true);
    expect(isImageMime("IMAGE/PNG")).toBe(true);
    expect(isImageMime("application/pdf")).toBe(false);
    expect(isImageMime("text/plain")).toBe(false);
    expect(isImageMime(undefined)).toBe(false);
  });
});

describe("ocrImageWith", () => {
  const img = Buffer.from("fake-image-bytes");

  it("returns the recognized + trimmed text", async () => {
    const recognize: Recognizer = async () => "  Hello OCR \n";
    expect(await ocrImageWith(img, recognize)).toEqual({ available: true, text: "Hello OCR" });
  });

  it("passes the language through", async () => {
    let seenLang = "";
    const recognize: Recognizer = async (_b, lang) => {
      seenLang = lang;
      return "x";
    };
    await ocrImageWith(img, recognize, "deu");
    expect(seenLang).toBe("deu");
  });

  it("returns unavailable on empty / oversized buffers (no recognizer call)", async () => {
    let called = false;
    const recognize: Recognizer = async () => {
      called = true;
      return "x";
    };
    expect(await ocrImageWith(Buffer.alloc(0), recognize)).toEqual({ available: false, text: "" });
    expect(await ocrImageWith(Buffer.alloc(11 * 1024 * 1024), recognize)).toEqual({ available: false, text: "" });
    expect(called).toBe(false);
  });

  it("turns a recognizer failure into available:false (never throws)", async () => {
    const recognize: Recognizer = async () => {
      throw new Error("tesseract unavailable");
    };
    expect(await ocrImageWith(img, recognize)).toEqual({ available: false, text: "" });
  });
});
