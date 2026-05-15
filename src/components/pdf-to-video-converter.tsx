"use client";

import "map.prototype.getorinsertcomputed/auto";
import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Upload, FileText, Film, Loader2, Download, Trash2, Volume2, VolumeX, Globe } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

function detectLanguage(text: string, pdfLang?: string | null): string {
  if (pdfLang && pdfLang.length >= 2) {
    const langMap: Record<string, string> = {
      en: "English", es: "Spanish", fr: "French", de: "German",
      pt: "Portuguese", it: "Italian", ru: "Russian", zh: "Chinese",
      ja: "Japanese", ko: "Korean", ar: "Arabic", hi: "Hindi",
      nl: "Dutch", pl: "Polish", tr: "Turkish", sv: "Swedish",
    };
    const code = pdfLang.substring(0, 2).toLowerCase();
    if (langMap[code]) return langMap[code];
  }

  const counts: Record<string, number> = {};
  for (const char of text) {
    const code = char.charCodeAt(0);
    if (code >= 0x4E00 && code <= 0x9FFF) counts["Chinese"] = (counts["Chinese"] || 0) + 1;
    else if (code >= 0x3040 && code <= 0x309F) counts["Japanese"] = (counts["Japanese"] || 0) + 1;
    else if (code >= 0xAC00 && code <= 0xD7AF) counts["Korean"] = (counts["Korean"] || 0) + 1;
    else if (code >= 0x0600 && code <= 0x06FF) counts["Arabic"] = (counts["Arabic"] || 0) + 1;
    else if (code >= 0x0400 && code <= 0x04FF) counts["Russian"] = (counts["Russian"] || 0) + 1;
    else if (code >= 0x0900 && code <= 0x097F) counts["Hindi"] = (counts["Hindi"] || 0) + 1;
  }

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (sorted.length > 0 && sorted[0][1] > text.length * 0.1) {
    return sorted[0][0];
  }
  return "English";
}

function getLangCode(language: string): string {
  const map: Record<string, string> = {
    English: "en-US", Spanish: "es-ES", French: "fr-FR", German: "de-DE",
    Portuguese: "pt-BR", Italian: "it-IT", Russian: "ru-RU", Chinese: "zh-CN",
    Japanese: "ja-JP", Korean: "ko-KR", Arabic: "ar-SA", Hindi: "hi-IN",
  };
  return map[language] || "en-US";
}

function getShortLangCode(language: string): string {
  const map: Record<string, string> = {
    English: "en", Spanish: "es", French: "fr", German: "de",
    Portuguese: "pt", Italian: "it", Russian: "ru", Chinese: "zh-CN",
    Japanese: "ja", Korean: "ko", Arabic: "ar", Hindi: "hi",
  };
  return map[language] || "en";
}

async function fetchTtsAudio(text: string, lang: string): Promise<ArrayBuffer | null> {
  const maxLen = 200;
  const chunks: string[] = [];
  const sentences = text.replace(/\n/g, " ").split(/(?<=[.!?])\s+/);
  let current = "";
  for (const s of sentences) {
    if ((current + " " + s).length > maxLen && current) {
      chunks.push(current.trim());
      current = s;
    } else {
      current = current ? current + " " + s : s;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  const allParts: ArrayBuffer[] = [];
  for (const chunk of chunks) {
    const encoded = encodeURIComponent(chunk);
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${lang}&client=tw-ob&q=${encoded}`;
    try {
      const resp = await fetch(url);
      if (resp.ok) {
        const buf = await resp.arrayBuffer();
        if (buf.byteLength > 0) allParts.push(buf);
      }
    } catch {
      // skip failed chunk
    }
  }
  if (allParts.length === 0) return null;
  const totalLen = allParts.reduce((sum, b) => sum + b.byteLength, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const part of allParts) {
    result.set(new Uint8Array(part), offset);
    offset += part.byteLength;
  }
  return result.buffer;
}

export function PdfToVideoConverter() {
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [fps, setFps] = useState(1);
  const [resolution, setResolution] = useState("1080p");
  const [pageDuration, setPageDuration] = useState(3);
  const [status, setStatus] = useState<
    "idle" | "rendering" | "encoding" | "done" | "error"
  >("idle");
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [detectedLanguage, setDetectedLanguage] = useState<string | null>(null);
  const [enableNarration, setEnableNarration] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const narrationRef = useRef(false);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFile = e.target.files?.[0];
      if (!selectedFile) return;
      setFile(selectedFile);
      setStatus("idle");
      setProgress(0);
      setDownloadUrl(null);
      setDetectedLanguage(null);

      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const arrayBuffer = await selectedFile.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        setPageCount(pdf.numPages);

        const firstPage = await pdf.getPage(1);
        const textContent = await firstPage.getTextContent();
        const text = textContent.items
          .filter((item) => "str" in item)
          .map((item) => (item as { str: string }).str)
          .join(" ");
        setDetectedLanguage(detectLanguage(text, textContent.lang));
      } catch {
        setStatus("error");
        setStatusText("Failed to read PDF file. Make sure it's a valid PDF.");
      }
    },
    []
  );

  const speakPage = useCallback((text: string, lang: string) => {
    if (!text.trim()) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = getLangCode(lang);
    utterance.rate = 0.9;
    const voices = window.speechSynthesis.getVoices();
    const matchingVoice = voices.find((v) => v.lang.startsWith(getLangCode(lang).substring(0, 2)));
    if (matchingVoice) utterance.voice = matchingVoice;
    window.speechSynthesis.speak(utterance);
  }, []);

  const handleConvert = useCallback(async () => {
    if (!file) return;
    setStatus("rendering");
    setProgress(0);
    setStatusText("Preparing...");
    setDownloadUrl(null);
    narrationRef.current = enableNarration;

    try {
      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

      const { FFmpeg } = await import("@ffmpeg/ffmpeg");
      const { fetchFile, toBlobURL } = await import("@ffmpeg/util");

      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const totalPages = pdf.numPages;

      const [width, height] =
        resolution === "1080p" ? [1920, 1080] : [1280, 720];

      const ffmpeg = new FFmpeg();

      ffmpeg.on("progress", ({ progress: p }: { progress: number }) => {
        setProgress(Math.min(50 + p * 50, 99));
      });

      const baseURL = "/ffmpeg";
      await ffmpeg.load({
        coreURL: await toBlobURL(
          `${baseURL}/ffmpeg-core.js`,
          "text/javascript"
        ),
        wasmURL: await toBlobURL(
          `${baseURL}/ffmpeg-core.wasm`,
          "application/wasm"
        ),
      });

      setStatusText("Rendering PDF pages...");
      let frameIndex = 0;
      const totalFrames = totalPages * fps * pageDuration;
      const pageTexts: string[] = [];

      for (let i = 1; i <= totalPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1 });

        const scale = Math.max(
          width / viewport.width,
          height / viewport.height
        );
        const scaledViewport = page.getViewport({ scale });

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d")!;

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);

        const offsetX = (width - scaledViewport.width) / 2;
        const offsetY = (height - scaledViewport.height) / 2;
        ctx.translate(offsetX, offsetY);

        const [, textContent] = await Promise.all([
          page.render({
            canvasContext: ctx,
            canvas,
            viewport: scaledViewport,
          }).promise,
          page.getTextContent(),
        ]);

        const pageText = textContent.items
          .filter((item) => "str" in item)
          .map((item) => (item as { str: string }).str)
          .join(" ");
        pageTexts.push(pageText);

        ctx.setTransform(1, 0, 0, 1, 0, 0);

        const framesPerPage = fps * pageDuration;

        for (let f = 0; f < framesPerPage; f++) {
          const blob = await new Promise<Blob>((resolve) => {
            canvas.toBlob((b) => resolve(b!), "image/png");
          });
          const fileName = `frame_${String(frameIndex).padStart(4, "0")}.png`;
          await ffmpeg.writeFile(fileName, await fetchFile(blob));
          frameIndex++;

          const frameProgress = (frameIndex / totalFrames) * 50;
          setProgress(Math.min(frameProgress, 50));
        }

        setStatusText(`Rendered page ${i}/${totalPages}`);
      }

      let lang = detectedLanguage;
      if (!lang && pageTexts.length > 0) {
        const allText = pageTexts.join(" ");
        lang = detectLanguage(allText);
        setDetectedLanguage(lang);
      }

      const hasText = pageTexts.some((t) => t.trim());
      const narrateLang = lang || "English";
      let hasAudio = false;

      if (narrationRef.current && hasText) {
        setStatusText("Generating narration audio...");
        const ttsLang = getShortLangCode(narrateLang);
        const pageAudioBuffers: ArrayBuffer[] = [];

        for (let i = 0; i < pageTexts.length; i++) {
          const text = pageTexts[i];
          if (text.trim()) {
            setStatusText(`Generating audio for page ${i + 1}/${pageTexts.length}...`);
            const audio = await fetchTtsAudio(text, ttsLang);
            if (audio) pageAudioBuffers.push(audio);
          }
        }

        if (pageAudioBuffers.length > 0) {
          const totalLen = pageAudioBuffers.reduce((s, b) => s + b.byteLength, 0);
          const merged = new Uint8Array(totalLen);
          let offset = 0;
          for (const buf of pageAudioBuffers) {
            merged.set(new Uint8Array(buf), offset);
            offset += buf.byteLength;
          }
          await ffmpeg.writeFile("narration.mp3", merged);
          hasAudio = true;
        }
      }

      setStatus("encoding");
      setStatusText("Encoding video...");

      const outputName = "output.mp4";
      const ffmpegArgs = [
        "-framerate",
        fps.toString(),
        "-i",
        "frame_%04d.png",
      ];

      if (hasAudio) {
        ffmpegArgs.push("-i", "narration.mp3");
        ffmpegArgs.push(
          "-c:v", "libx264",
          "-pix_fmt", "yuv420p",
          "-preset", "fast",
          "-c:a", "aac",
          "-b:a", "128k",
          "-shortest",
          "-y",
          outputName
        );
      } else {
        ffmpegArgs.push(
          "-c:v", "libx264",
          "-pix_fmt", "yuv420p",
          "-preset", "fast",
          "-y",
          outputName
        );
      }

      await ffmpeg.exec(ffmpegArgs);

      const data = await ffmpeg.readFile(outputName);
      const videoData = typeof data === "string" ? data : new Uint8Array(data);
      const blob = new Blob([videoData], { type: "video/mp4" });
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      setProgress(100);
      setStatus("done");
      setStatusText(hasAudio ? "Video with narration ready!" : "Video ready!");
    } catch (err) {
      setStatus("error");
      setStatusText(
        err instanceof Error ? err.message : "Conversion failed"
      );
    }
  }, [file, fps, resolution, pageDuration, enableNarration, detectedLanguage, speakPage]);

  const handleReset = useCallback(() => {
    window.speechSynthesis.cancel();
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setFile(null);
    setPageCount(0);
    setStatus("idle");
    setProgress(0);
    setStatusText("");
    setDownloadUrl(null);
    setDetectedLanguage(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [downloadUrl]);

  const handleDownload = useCallback(() => {
    if (!downloadUrl) return;
    try {
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = "output.mp4";
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      setTimeout(() => document.body.removeChild(a), 100);
    } catch {
      window.open(downloadUrl, "_blank");
    }
  }, [downloadUrl]);

  const isRunning = status === "rendering" || status === "encoding";

  return (
    <motion.div
      className="max-w-3xl mx-auto space-y-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Film className="h-6 w-6" />
            PDF to Video Converter
          </CardTitle>
          <CardDescription>
            Upload a PDF document and convert it to a video presentation
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <AnimatePresence mode="wait">
          {!file ? (
            <motion.div
              key="upload"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3 }}
              className="border-2 border-dashed rounded-lg p-12 text-center cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={async (e) => {
                e.preventDefault();
                const droppedFile = e.dataTransfer.files[0];
                if (droppedFile?.type === "application/pdf") {
                  const dt = new DataTransfer();
                  dt.items.add(droppedFile);
                  fileInputRef.current!.files = dt.files;
                  setFile(droppedFile);
                  setStatus("idle");
                  setProgress(0);
                  setDownloadUrl(null);
                  setDetectedLanguage(null);
                  try {
                    const pdfjsLib = await import("pdfjs-dist");
                    pdfjsLib.GlobalWorkerOptions.workerSrc =
                      "/pdf.worker.min.mjs";
                    const arrayBuffer = await droppedFile.arrayBuffer();
                    const pdf = await pdfjsLib
                      .getDocument({ data: arrayBuffer })
                      .promise;
                    setPageCount(pdf.numPages);
                    const firstPage = await pdf.getPage(1);
                    const textContent = await firstPage.getTextContent();
                    const text = textContent.items
                      .filter((item) => "str" in item)
                      .map((item) => (item as { str: string }).str)
                      .join(" ");
                    setDetectedLanguage(detectLanguage(text, textContent.lang));
                  } catch {
                    setStatus("error");
                    setStatusText(
                      "Failed to read PDF file. Make sure it's a valid PDF."
                    );
                  }
                }
              }}
            >
              <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-lg font-medium">
                Drop your PDF here or click to browse
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Supports any PDF document
              </p>
              <Input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={handleFileChange}
              />
            </motion.div>
          ) : (
            <motion.div
              key="settings"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              className="space-y-4"
            >
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <div className="flex items-center gap-3 min-w-0">
                  <FileText className="h-8 w-8 text-primary shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium truncate">{file.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {pageCount} pages &middot;{" "}
                      {(file.size / 1024 / 1024).toFixed(1)} MB
                    </p>
                    {detectedLanguage && (
                      <p className="text-sm text-primary flex items-center gap-1">
                        <Globe className="h-3 w-3" />
                        {detectedLanguage}
                      </p>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleReset}
                  disabled={isRunning}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Frames per second</Label>
                  <Slider
                    value={[fps]}
                    onValueChange={(v) => setFps(Array.isArray(v) ? v[0] : v)}
                    min={1}
                    max={30}
                    step={1}
                  />
                  <p className="text-sm text-muted-foreground">{fps} FPS</p>
                </div>
                <div className="space-y-2">
                  <Label>Resolution</Label>
                  <Select
                    value={resolution}
                    onValueChange={(v) => v && setResolution(v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="720p">720p (1280x720)</SelectItem>
                      <SelectItem value="1080p">1080p (1920x1080)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Seconds per page</Label>
                  <Slider
                    value={[pageDuration]}
                    onValueChange={(v) => setPageDuration(Array.isArray(v) ? v[0] : v)}
                    min={1}
                    max={30}
                    step={1}
                  />
                  <p className="text-sm text-muted-foreground">
                    {pageDuration}s per page
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Total duration</Label>
                  <p className="text-sm font-medium pt-2">
                    ~{pageCount * pageDuration}s
                  </p>
                </div>
                <div className="space-y-2 col-span-2">
                  <Label>Audio narration</Label>
                  <Button
                    variant={enableNarration ? "default" : "outline"}
                    size="sm"
                    className="w-full"
                    onClick={() => setEnableNarration(!enableNarration)}
                  >
                    {enableNarration ? (
                      <>
                        <Volume2 className="mr-2 h-4 w-4" />
                        Narration enabled
                      </>
                    ) : (
                      <>
                        <VolumeX className="mr-2 h-4 w-4" />
                        Narration disabled
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
          </AnimatePresence>

          <AnimatePresence>
          {(isRunning || status === "done") && (
            <motion.div
              key="progress"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              className="space-y-2 overflow-hidden"
            >
              <div className="flex justify-between text-sm">
                <span>{statusText}</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} />
            </motion.div>
          )}
          </AnimatePresence>

          <AnimatePresence>
          {status === "error" && (
            <motion.div
              key="error"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.3 }}
              className="p-3 bg-destructive/10 text-destructive rounded-lg text-sm"
            >
              {statusText}
            </motion.div>
          )}
          </AnimatePresence>
        </CardContent>
        {file && (
          <CardFooter className="flex gap-3">
            <AnimatePresence mode="wait">
            {status !== "done" ? (
              <motion.div
                key="convert"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="w-full"
              >
                <Button
                  onClick={handleConvert}
                  disabled={isRunning}
                  className="w-full"
                >
                  {isRunning ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {status === "rendering"
                        ? "Rendering pages..."
                        : "Encoding video..."}
                    </>
                  ) : (
                    <>
                      <Film className="mr-2 h-4 w-4" />
                      Convert to Video
                    </>
                  )}
                </Button>
              </motion.div>
            ) : (
              <motion.div
                key="download"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className="w-full"
              >
                <Button onClick={handleDownload} className="w-full">
                  <Download className="mr-2 h-4 w-4" />
                  Download Video
                </Button>
              </motion.div>
            )}
            </AnimatePresence>
          </CardFooter>
        )}
      </Card>
    </motion.div>
  );
}
