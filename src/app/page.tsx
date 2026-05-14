import { PdfToVideoConverter } from "@/components/pdf-to-video-converter";

export default function Home() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center p-8">
      <main className="w-full max-w-4xl">
        <PdfToVideoConverter />
      </main>
    </div>
  );
}
