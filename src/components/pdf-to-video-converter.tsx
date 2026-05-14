"use client";

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
import { Upload, FileText, Film, Loader2, Download, Trash2 } from "lucide-react";

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const downloadRef = useRef<HTMLAnchorElement>(null);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFile = e.target.files?.[0];
      if (!selectedFile) return;
      setFile(selectedFile);
      setStatus("idle");
      setProgress(0);
      setDownloadUrl(null);

      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const arrayBuffer = await selectedFile.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        setPageCount(pdf.numPages);
      } catch {
        setStatus("error");
        setStatusText("Failed to read PDF file. Make sure it's a valid PDF.");
      }
    },
    []
  );

  const handleConvert = useCallback(async () => {
    if (!file) return;
    setStatus("rendering");
    setProgress(0);
    setStatusText("Preparing...");
    setDownloadUrl(null);

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

        await page.render({
          canvasContext: ctx,
          canvas,
          viewport: scaledViewport,
        }).promise;

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

      setStatus("encoding");
      setStatusText("Encoding video...");

      const outputName = "output.mp4";
      await ffmpeg.exec([
        "-framerate",
        fps.toString(),
        "-i",
        "frame_%04d.png",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-preset",
        "fast",
        "-y",
        outputName,
      ]);

      const data = await ffmpeg.readFile(outputName);
      const blob = new Blob([data], { type: "video/mp4" });
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      setProgress(100);
      setStatus("done");
      setStatusText("Video ready!");
    } catch (err) {
      setStatus("error");
      setStatusText(
        err instanceof Error ? err.message : "Conversion failed"
      );
    }
  }, [file, fps, resolution, pageDuration]);

  const handleReset = useCallback(() => {
    setFile(null);
    setPageCount(0);
    setStatus("idle");
    setProgress(0);
    setStatusText("");
    setDownloadUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleDownload = useCallback(() => {
    if (downloadUrl && downloadRef.current) {
      downloadRef.current.href = downloadUrl;
      downloadRef.current.click();
    }
  }, [downloadUrl]);

  const isRunning = status === "rendering" || status === "encoding";

  return (
    <div className="max-w-3xl mx-auto space-y-6">
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
          {!file ? (
            <div
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
                  try {
                    const pdfjsLib = await import("pdfjs-dist");
                    pdfjsLib.GlobalWorkerOptions.workerSrc =
                      "/pdf.worker.min.mjs";
                    const arrayBuffer = await droppedFile.arrayBuffer();
                    const pdf = await pdfjsLib
                      .getDocument({ data: arrayBuffer })
                      .promise;
                    setPageCount(pdf.numPages);
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
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <div className="flex items-center gap-3 min-w-0">
                  <FileText className="h-8 w-8 text-primary shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium truncate">{file.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {pageCount} pages &middot;{" "}
                      {(file.size / 1024 / 1024).toFixed(1)} MB
                    </p>
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
                    onValueChange={setResolution}
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
              </div>
            </div>
          )}

          {(isRunning || status === "done") && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>{statusText}</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} />
            </div>
          )}

          {status === "error" && (
            <div className="p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
              {statusText}
            </div>
          )}
        </CardContent>
        {file && (
          <CardFooter className="flex gap-3">
            {status !== "done" ? (
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
            ) : (
              <Button onClick={handleDownload} className="w-full">
                <Download className="mr-2 h-4 w-4" />
                Download Video
              </Button>
            )}
            <a ref={downloadRef} className="hidden" download="output.mp4" />
          </CardFooter>
        )}
      </Card>
    </div>
  );
}
