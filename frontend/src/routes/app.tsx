import { createFileRoute } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  Download,
  Eye,
  FileText,
  FileType2,
  FileUp,
  Loader2,
  RefreshCw,
  Sparkles,
  StickyNote,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AppNavbar } from "@/components/AppNavbar";
import { apiJson, apiUrl } from "@/lib/api";

export const Route = createFileRoute("/app")({
  head: () => ({
    meta: [
      { title: "DocStruct AI — Create your document" },
      {
        name: "description",
        content: "Paste raw text and generate a polished Microsoft Word document with AI.",
      },
    ],
  }),
  component: AppPage,
});

type Stage = "idle" | "processing" | "done";

const DOC_TYPES = [
  "Academic Report",
  "Assignment",
  "Research Paper",
  "Business Report",
  "Meeting Notes",
  "Proposal",
  "General Document",
];

const STYLES = ["Professional", "Academic", "Minimal", "Corporate"];

const STEPS = [
  "Reading content",
  "Understanding structure",
  "Organizing sections",
  "Creating document",
  "Preparing download",
];

const SAMPLE_NOTES_TEMPLATE = `Team Sync - March 15
Attendees: Sarah, Mike, Priya, Leo

Agenda:
- Review Q1 roadmap progress
- Discuss onboarding flow redesign
- Define metrics for the new experiment

Key decisions:
1. Push the redesign launch by one week to allow more QA testing.
2. Use Mixpanel + Amplitude for experiment tracking.
3. Assign design polish to Priya; engineering handoff to Leo.

Next steps:
- Leo to share updated architecture diagram by Friday.
- Sarah to schedule user interviews for next Tuesday.
- Priya to finalize Figma mocks by EOD Thursday.

Action items:
- [ ] Leo: architecture diagram
- [ ] Priya: Figma mocks
- [ ] Sarah: user interviews
- [ ] Mike: experiment spec draft`;

const SAMPLE_ASSIGNMENT_TEMPLATE = `The Water Cycle

Overview
The water cycle is the continuous movement of water on, above, and below Earth's surface. It is driven by energy from the sun and the force of gravity.

Key Processes
- Evaporation: heat from the sun turns liquid water into water vapor.
- Condensation: water vapor rises, cools, and forms tiny droplets that make clouds.
- Precipitation: droplets become heavy and fall back to Earth as rain, snow, sleet, or hail.
- Collection: water gathers in oceans, rivers, lakes, and underground reservoirs.

Why It Matters
Understanding the water cycle helps scientists predict weather patterns, manage freshwater supplies, and prepare for droughts or floods. It also connects every living thing on the planet.

Quick Facts
- A single water droplet spends about 9 days in the atmosphere before falling.
- Roughly 97.5% of Earth's water is salty; only about 2.5% is fresh.
- Glaciers and ice caps store nearly 69% of the world's fresh water.

Summary
The water cycle is one of Earth's most important systems. It moves water continuously and supports life, climate, and weather everywhere.`;

function AppPage() {
  const [text, setText] = useState("");
  const [docType, setDocType] = useState(DOC_TYPES[0]);
  const [style, setStyle] = useState(STYLES[0]);
  const [stage, setStage] = useState<Stage>("idle");
  const [stepIndex, setStepIndex] = useState(0);
  const [usedFree, setUsedFree] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState("docstruct-document.docx");
  const [generateError, setGenerateError] = useState<string | null>(null);

  const chars = text.length;
  const canGenerate = text.trim().length > 20 && stage === "idle";

  useEffect(() => {
    if (stage !== "processing") return;
    setStepIndex(0);
    const id = setInterval(() => {
      setStepIndex((i) => {
        if (i >= STEPS.length - 1) {
          clearInterval(id);
          return i;
        }
        return i + 1;
      });
    }, 650);
    return () => clearInterval(id);
  }, [stage]);

  const preview = useMemo(() => buildPreview(text, docType), [text, docType]);

  async function handleGenerate() {
    if (!canGenerate) return;
    setStage("processing");
    setGenerateError(null);
    try {
      const response = await apiJson<{
        success: boolean;
        document: { buffer: string; filename: string; type: string };
      }>("/api/process-text", {
        method: "POST",
        body: JSON.stringify({ text, type: docType, style }),
      });

      const binary = atob(response.document.buffer);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }

      const blob = new Blob([bytes], { type: response.document.type });
      const url = URL.createObjectURL(blob);
      setDownloadUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return url;
      });
      setDownloadName(response.document.filename);
      setStage("done");
      setUsedFree(true);
      setShowBanner(true);
    } catch (error) {
      setStage("idle");
      setGenerateError(error instanceof Error ? error.message : "Failed to generate document.");
    }
  }

  function handleClear() {
    setText("");
  }

  function handleReset() {
    setStage("idle");
    setStepIndex(0);
    setGenerateError(null);
  }

  function handleLoadExample(type: "notes" | "assignment") {
    setText(type === "notes" ? SAMPLE_NOTES_TEMPLATE : SAMPLE_ASSIGNMENT_TEMPLATE);
  }

  function handleDownload() {
    if (!downloadUrl) return;
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = downloadName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  useEffect(() => {
    return () => {
      if (downloadUrl) {
        URL.revokeObjectURL(downloadUrl);
      }
    };
  }, [downloadUrl]);

  return (
    <main className="flex min-h-dvh flex-col bg-secondary/30">
      <AppNavbar />

      <section className="flex-1">
        <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
          <div className="mb-6 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background px-3 py-1 text-xs text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" /> AI document builder
            </div>
            <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
              Create Your Document
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Paste raw content, choose a style, and download a polished Word document.
            </p>
          </div>

          <motion.div
            layout
            className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm"
          >
            <AnimatePresence mode="wait">
              {stage === "idle" && (
                <motion.div
                  key="idle"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="p-5 sm:p-8"
                >
                  <div className="relative">
                    <Label htmlFor="content" className="sr-only">
                      Content
                    </Label>
                    <Textarea
                      id="content"
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      placeholder="Paste your raw content here..."
                      className="min-h-[400px] resize-y rounded-xl border-border/70 bg-background p-5 text-[15px] leading-relaxed shadow-none focus-visible:ring-primary/40"
                    />
                    <div className="pointer-events-none absolute bottom-3 right-4 rounded-md bg-muted/80 px-2 py-1 text-[11px] font-medium text-muted-foreground">
                      {chars.toLocaleString()} characters
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="doc-type" className="text-xs font-medium">
                        Document type
                      </Label>
                      <Select value={docType} onValueChange={setDocType}>
                        <SelectTrigger id="doc-type" className="h-11 rounded-xl">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DOC_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>
                              {t}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="style" className="text-xs font-medium">
                        Formatting style
                      </Label>
                      <Select value={style} onValueChange={setStyle}>
                        <SelectTrigger id="style" className="h-11 rounded-xl">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STYLES.map((t) => (
                            <SelectItem key={t} value={t}>
                              {t}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="mt-6 flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="outline"
                            disabled={stage !== "idle"}
                            className="rounded-xl"
                          >
                            <StickyNote className="mr-1.5 h-4 w-4" /> Try Example
                            <ChevronDown className="ml-1.5 h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          <DropdownMenuItem onClick={() => handleLoadExample("notes")}>
                            Meeting Notes
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleLoadExample("assignment")}>
                            Assignment Draft
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <Button
                        variant="ghost"
                        onClick={handleClear}
                        disabled={!text}
                        className="rounded-xl text-muted-foreground hover:text-foreground"
                      >
                        <Trash2 className="mr-1.5 h-4 w-4" /> Clear
                      </Button>
                    </div>
                    <Button
                      onClick={handleGenerate}
                      disabled={!canGenerate}
                      size="lg"
                      className="h-12 rounded-xl px-6 text-base"
                    >
                      <Sparkles className="mr-1.5 h-4 w-4" />
                      Generate Document
                    </Button>
                  </div>
                  {generateError && (
                    <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                      {generateError}
                    </p>
                  )}
                  {!canGenerate && text.trim().length > 0 && text.trim().length <= 20 && (
                    <p className="mt-2 text-right text-xs text-muted-foreground">
                      Add a bit more content to generate.
                    </p>
                  )}
                </motion.div>
              )}

              {stage === "processing" && (
                <motion.div
                  key="processing"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="p-8 sm:p-12"
                >
                  <div className="mx-auto flex max-w-md flex-col items-center text-center">
                    <div className="relative grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
                      <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                    <h3 className="mt-5 text-lg font-semibold">Generating your document</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      This usually takes just a few seconds.
                    </p>

                    <ul className="mt-8 w-full space-y-2.5">
                      {STEPS.map((s, i) => {
                        const done = i < stepIndex;
                        const active = i === stepIndex;
                        return (
                          <motion.li
                            key={s}
                            initial={{ opacity: 0, x: -6 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.05 }}
                            className={`flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left text-sm transition-colors ${
                              done
                                ? "border-primary/20 bg-primary/5 text-foreground"
                                : active
                                  ? "border-primary/30 bg-background text-foreground"
                                  : "border-border/60 bg-background text-muted-foreground"
                            }`}
                          >
                            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-border bg-background">
                              {done ? (
                                <CheckCircle2 className="h-4 w-4 text-primary" />
                              ) : active ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                              ) : (
                                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
                              )}
                            </span>
                            <span className="truncate">{s}</span>
                          </motion.li>
                        );
                      })}
                    </ul>
                  </div>
                </motion.div>
              )}

              {stage === "done" && (
                <motion.div
                  key="done"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="p-8 sm:p-12 text-center"
                >
                  <motion.div
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 200, damping: 15 }}
                    className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[color:var(--success)]/15 text-[color:var(--success)]"
                  >
                    <CheckCircle2 className="h-9 w-9" />
                  </motion.div>
                  <h3 className="mt-5 text-2xl font-bold tracking-tight">
                    Your document is ready!
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Formatted as{" "}
                    <span className="font-medium text-foreground">{docType}</span> in a{" "}
                    <span className="font-medium text-foreground">{style}</span> style.
                  </p>

                  <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                    <Button
                      size="lg"
                      onClick={handleDownload}
                      className="h-12 rounded-xl px-6 text-base"
                    >
                      <Download className="mr-1.5 h-4 w-4" /> Download DOCX
                    </Button>
                    <Button
                      size="lg"
                      variant="outline"
                      onClick={() => setShowPreview(true)}
                      className="h-12 rounded-xl px-5"
                    >
                      <Eye className="mr-1.5 h-4 w-4" /> Preview Document
                    </Button>
                    <Button
                      size="lg"
                      variant="ghost"
                      onClick={handleReset}
                      className="h-12 rounded-xl px-5"
                    >
                      <RefreshCw className="mr-1.5 h-4 w-4" /> Generate Another
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          <AnimatePresence>
            {showBanner && usedFree && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="mt-6 flex flex-col items-start justify-between gap-4 rounded-2xl border border-primary/20 bg-primary/5 p-5 sm:flex-row sm:items-center"
              >
                <div className="flex items-start gap-3">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold">
                      You've used your free generation.
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Create a free account to continue generating unlimited professional
                      documents.
                    </p>
                  </div>
                </div>
                <div className="flex w-full items-center gap-2 sm:w-auto">
                  <Button
                    variant="ghost"
                    className="rounded-xl"
                    onClick={() => setShowBanner(false)}
                  >
                    Continue Free
                  </Button>
                  <Button className="rounded-xl">Sign Up</Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Dismiss"
                    onClick={() => setShowBanner(false)}
                    className="rounded-xl"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <ConverterSection />
        </div>
      </section>


      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-h-[85dvh] max-w-2xl overflow-hidden p-0">
          <DialogHeader className="border-b border-border/70 px-6 py-4">
            <DialogTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4 text-primary" /> {preview.title}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[70dvh] overflow-y-auto px-8 py-8">
            <article className="prose-doc">
              <h1 className="text-2xl font-bold tracking-tight">{preview.title}</h1>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                {docType} · {style}
              </p>
              <div className="mt-6 space-y-6">
                {preview.sections.map((sec, i) => (
                  <section key={i}>
                    <h2 className="text-base font-semibold">{sec.heading}</h2>
                    <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-foreground/85">
                      {sec.body}
                    </p>
                  </section>
                ))}
              </div>
            </article>
          </div>
        </DialogContent>
      </Dialog>

      
    </main>
  );
}

function buildPreview(text: string, docType: string) {
  const trimmed = text.trim();
  const paragraphs = trimmed
    .split(/\n{2,}|\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const first = paragraphs[0] || "Untitled Document";
  const title =
    first.length > 70
      ? `${docType}: ${first.slice(0, 60).replace(/[.,;:]\s*$/, "")}…`
      : first.replace(/[.,;:]\s*$/, "");

  const chunks: { heading: string; body: string }[] = [];
  const rest = paragraphs.slice(1);
  const groups: string[][] = [];
  const size = Math.max(1, Math.ceil(rest.length / 4));
  for (let i = 0; i < rest.length; i += size) groups.push(rest.slice(i, i + size));

  const headings = [
    "Overview",
    "Key Points",
    "Discussion",
    "Analysis",
    "Findings",
    "Conclusion",
  ];
  groups.forEach((g, i) => {
    chunks.push({
      heading: headings[i] ?? `Section ${i + 1}`,
      body: g.join("\n\n"),
    });
  });

  if (chunks.length === 0) {
    chunks.push({ heading: "Overview", body: trimmed || "No content provided." });
  }

  return { title, sections: chunks };
}

type ConvertKind = "pdf-to-docx" | "docx-to-pdf";
type ConvertStage = "idle" | "converting" | "done";

function ConverterSection() {
  return (
    <div className="mt-10">
      <div className="mb-4 flex items-center gap-2">
        <div className="h-px flex-1 bg-border/70" />
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Quick converters
        </span>
        <div className="h-px flex-1 bg-border/70" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ConverterCard
          kind="pdf-to-docx"
          title="PDF to DOCX"
          description="Upload a PDF and get an editable Word document."
          accept="application/pdf"
          fromLabel="PDF"
          toLabel="DOCX"
          icon={<FileType2 className="h-5 w-5" />}
        />
        <ConverterCard
          kind="docx-to-pdf"
          title="DOCX to PDF"
          description="Upload a Word document and get a polished PDF."
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          fromLabel="DOCX"
          toLabel="PDF"
          icon={<FileText className="h-5 w-5" />}
        />
      </div>
    </div>
  );
}

function ConverterCard({
  kind,
  title,
  description,
  accept,
  fromLabel,
  toLabel,
  icon,
}: {
  kind: ConvertKind;
  title: string;
  description: string;
  accept: string;
  fromLabel: string;
  toLabel: string;
  icon: React.ReactNode;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<ConvertStage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const inputId = `file-${kind}`;

  function onSelect(f: File | null) {
    setFile(f);
    setStage("idle");
    setError(null);
    setDownloadUrl(null);
  }

  async function onConvert() {
    if (!file) return;
    setStage("converting");
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(apiUrl(`/api/convert/${kind}`), {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Conversion failed.");
      }
      setDownloadUrl(data.downloadUrl);
      setStage("done");
    } catch (convertError) {
      setStage("idle");
      setError(convertError instanceof Error ? convertError.message : "Conversion failed.");
    }
  }

  function onDownload() {
    if (!downloadUrl) return;
    window.open(downloadUrl, "_blank", "noopener,noreferrer");
  }

  function onReset() {
    setFile(null);
    setStage("idle");
  }

  return (
    <div className="flex flex-col rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          {icon}
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
      </div>

      <label
        htmlFor={inputId}
        className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-background px-4 py-6 text-center transition-colors hover:border-primary/50 hover:bg-primary/5"
      >
        <Upload className="h-5 w-5 text-muted-foreground" />
        <span className="mt-2 text-sm font-medium">
          {file ? file.name : `Click to upload a ${fromLabel} file`}
        </span>
        <span className="mt-0.5 text-[11px] text-muted-foreground">
          {file
            ? `${(file.size / 1024).toFixed(1)} KB`
            : `Only ${fromLabel} files are accepted`}
        </span>
        <input
          id={inputId}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => onSelect(e.target.files?.[0] ?? null)}
        />
      </label>

      <div className="mt-4 flex items-center gap-2">
        {stage !== "done" ? (
          <>
            <Button
              onClick={onConvert}
              disabled={!file || stage === "converting"}
              className="h-10 flex-1 rounded-xl"
            >
              {stage === "converting" ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Converting…
                </>
              ) : (
                <>
                  <FileUp className="mr-1.5 h-4 w-4" /> Convert to {toLabel}
                </>
              )}
            </Button>
            {file && (
              <Button
                variant="ghost"
                onClick={onReset}
                className="h-10 rounded-xl text-muted-foreground"
                aria-label="Clear file"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </>
        ) : (
          <>
            <Button onClick={onDownload} className="h-10 flex-1 rounded-xl">
              <Download className="mr-1.5 h-4 w-4" /> Download {toLabel}
            </Button>
            <Button
              variant="outline"
              onClick={onReset}
              className="h-10 rounded-xl"
            >
              <RefreshCw className="mr-1.5 h-4 w-4" /> New
            </Button>
          </>
        )}
      </div>
      {error && (
        <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
