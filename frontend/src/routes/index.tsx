import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  ArrowRight,
  FileText,
  Sparkles,
  FileDown,
  Zap,
  ClipboardPaste,
  Cpu,
  Download,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

export const Route = createFileRoute("/")({
  component: Landing,
});

import type { Variants } from "framer-motion";

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: i * 0.06, ease: "easeOut" },
  }),
};

function Landing() {
  return (
    <main className="min-h-dvh bg-background">
      <Navbar />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 -top-24 mx-auto h-72 max-w-4xl bg-[radial-gradient(ellipse_at_top,theme(colors.primary/15),transparent_60%)]" />
        <div className="mx-auto max-w-6xl px-4 pb-16 pt-16 sm:px-6 sm:pt-24">
          <motion.div
            initial="hidden"
            animate="show"
            variants={fadeUp}
            className="mx-auto max-w-3xl text-center"
          >
            <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-border/70 bg-secondary/60 px-3 py-1 text-xs font-medium text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              AI-powered document structuring
            </div>
            <motion.h1
              variants={fadeUp}
              custom={1}
              className="mt-6 text-balance text-4xl font-bold tracking-tight sm:text-6xl"
            >
              Turn Raw Text into{" "}
              <span className="text-primary">Professional Documents.</span>
            </motion.h1>
            <motion.p
              variants={fadeUp}
              custom={2}
              className="mx-auto mt-5 max-w-2xl text-balance text-base leading-relaxed text-muted-foreground sm:text-lg"
            >
              Let DocStruct turn your notes, assignments, reports, or research drafts into
              beautifully structured Microsoft Word documents in seconds.
            </motion.p>
            <motion.div
              variants={fadeUp}
              custom={3}
              className="mt-8 flex flex-wrap items-center justify-center gap-3"
            >
              <Link to="/app">
                <Button size="lg" className="h-12 rounded-xl px-6 text-base">
                  Start for Free <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </Link>
              <a href="#example">
                <Button
                  size="lg"
                  variant="outline"
                  className="h-12 rounded-xl px-6 text-base"
                >
                  See Example
                </Button>
              </a>
            </motion.div>
          </motion.div>

          {/* Flow illustration */}
          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-80px" }}
            variants={fadeUp}
            className="mx-auto mt-16 grid max-w-5xl grid-cols-1 items-stretch gap-4 md:grid-cols-[1fr_auto_1fr_auto_1fr]"
          >
            <FlowCard
              title="Raw text"
              subtitle="Notes, drafts, ideas"
              icon={<ClipboardPaste className="h-5 w-5" />}
              preview={
                <div className="space-y-1.5 text-[11px] leading-relaxed text-muted-foreground">
                  <p>project kickoff notes...</p>
                  <p>goals: launch mvp, get feedback</p>
                  <p>risks - timeline, scope creep</p>
                  <p>next: draft plan, assign owners</p>
                </div>
              }
            />
            <Arrow />
            <FlowCard
              accent
              title="AI Processing"
              subtitle="Structure & format"
              icon={<Cpu className="h-5 w-5" />}
              preview={
                <div className="space-y-2">
                  {["Reading", "Structuring", "Formatting"].map((s, i) => (
                    <div key={s} className="flex items-center gap-2 text-[11px]">
                      <span className="grid h-4 w-4 place-items-center rounded-full bg-primary/15 text-primary">
                        <Check className="h-2.5 w-2.5" />
                      </span>
                      <span className="text-muted-foreground">{s}</span>
                      <span className="ml-auto text-primary/70">
                        {(i + 1) * 33}%
                      </span>
                    </div>
                  ))}
                </div>
              }
            />
            <Arrow />
            <FlowCard
              title="Professional DOCX"
              subtitle="Ready to download"
              icon={<FileText className="h-5 w-5" />}
              preview={
                <div className="space-y-1.5">
                  <div className="h-2 w-2/3 rounded bg-foreground/80" />
                  <div className="h-1.5 w-full rounded bg-muted-foreground/30" />
                  <div className="h-1.5 w-11/12 rounded bg-muted-foreground/30" />
                  <div className="mt-2 h-2 w-1/2 rounded bg-foreground/60" />
                  <div className="h-1.5 w-full rounded bg-muted-foreground/30" />
                  <div className="h-1.5 w-4/5 rounded bg-muted-foreground/30" />
                </div>
              }
            />
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-t border-border/60 bg-secondary/30 py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Everything you need to ship polished documents
            </h2>
            <p className="mt-3 text-muted-foreground">
              Built for students, researchers, and professionals who care about how their work
              looks.
            </p>
          </div>
          <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: FileText,
                emoji: "📝",
                title: "Smart Document Structuring",
                desc: "Automatically identifies headings, sections, paragraphs, and hierarchy.",
              },
              {
                icon: Sparkles,
                emoji: "✨",
                title: "AI Formatting",
                desc: "Clean, professional formatting suitable for reports and academic work.",
              },
              {
                icon: FileDown,
                emoji: "📄",
                title: "Word Export",
                desc: "Generate fully editable Microsoft Word documents in one click.",
              },
              {
                icon: Zap,
                emoji: "⚡",
                title: "Fast Processing",
                desc: "Documents generated in seconds — no waiting, no friction.",
              },
            ].map((f, i) => (
              <motion.div
                key={f.title}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, margin: "-60px" }}
                variants={fadeUp}
                custom={i}
                className="group rounded-2xl border border-border/70 bg-card p-6 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_1px_0_0_rgba(0,0,0,0.02),0_20px_40px_-20px_rgba(37,99,235,0.25)]"
              >
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">How it works</h2>
            <p className="mt-3 text-muted-foreground">Three steps. No sign-up required.</p>
          </div>
          <div className="relative mt-14 grid grid-cols-1 gap-6 md:grid-cols-3">
            <div className="pointer-events-none absolute left-0 right-0 top-9 hidden h-px bg-gradient-to-r from-transparent via-border to-transparent md:block" />
            {[
              {
                n: "1",
                title: "Paste your content",
                desc: "Drop in notes, drafts, or any raw text.",
                icon: ClipboardPaste,
              },
              {
                n: "2",
                title: "AI analyzes & structures",
                desc: "Sections, headings, and hierarchy — done automatically.",
                icon: Cpu,
              },
              {
                n: "3",
                title: "Download Word doc",
                desc: "A polished .docx ready to share or edit.",
                icon: Download,
              },
            ].map((s, i) => (
              <motion.div
                key={s.n}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true }}
                variants={fadeUp}
                custom={i}
                className="relative rounded-2xl border border-border/70 bg-card p-6 text-center"
              >
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-full border border-border bg-background text-sm font-semibold text-primary shadow-sm">
                  {s.n}
                </div>
                <s.icon className="mx-auto mt-4 h-5 w-5 text-muted-foreground" />
                <h3 className="mt-3 font-semibold">{s.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{s.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Example */}
      <section id="example" className="border-t border-border/60 bg-secondary/30 py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              From messy notes to a polished document
            </h2>
            <p className="mt-3 text-muted-foreground">See what DocStruct AI produces.</p>
          </div>
          <div className="mt-12 grid gap-4 md:grid-cols-2">
            <motion.div
              initial="hidden"
              whileInView="show"
              viewport={{ once: true }}
              variants={fadeUp}
              className="overflow-hidden rounded-2xl border border-border/70 bg-card"
            >
              <div className="flex items-center justify-between border-b border-border/70 px-4 py-2.5 text-xs text-muted-foreground">
                <span>Raw text</span>
                <span className="rounded-md bg-muted px-2 py-0.5">Before</span>
              </div>
              <pre className="whitespace-pre-wrap p-5 font-mono text-[12.5px] leading-relaxed text-foreground/80">
{`meeting oct 14 - product review
attendees: sam, priya, jordan
notes: users struggling with onboarding, esp step 3
tickets up 22% last week
priya: consider inline hints
jordan: rework flow entirely?
action items - sam owns exp, priya writes copy
deadline: friday`}
              </pre>
            </motion.div>
            <motion.div
              initial="hidden"
              whileInView="show"
              viewport={{ once: true }}
              variants={fadeUp}
              custom={1}
              className="overflow-hidden rounded-2xl border border-border/70 bg-card"
            >
              <div className="flex items-center justify-between border-b border-border/70 px-4 py-2.5 text-xs text-muted-foreground">
                <span>Structured document</span>
                <span className="rounded-md bg-primary/10 px-2 py-0.5 text-primary">After</span>
              </div>
              <div className="space-y-4 p-6">
                <div>
                  <h4 className="text-lg font-bold tracking-tight">Product Review — October 14</h4>
                  <p className="text-xs text-muted-foreground">Meeting Notes</p>
                </div>
                <div>
                  <h5 className="text-sm font-semibold">Attendees</h5>
                  <p className="text-sm text-muted-foreground">Sam, Priya, Jordan</p>
                </div>
                <div>
                  <h5 className="text-sm font-semibold">Discussion</h5>
                  <p className="text-sm text-muted-foreground">
                    Users are struggling with onboarding, particularly step 3. Support tickets
                    rose 22% last week. The team debated inline hints versus reworking the flow
                    entirely.
                  </p>
                </div>
                <div>
                  <h5 className="text-sm font-semibold">Action Items</h5>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                    <li>Sam owns the experiment</li>
                    <li>Priya writes the copy</li>
                    <li>Deadline: Friday</li>
                  </ul>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Ready to structure your first document?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Free to try. No account required.
          </p>
          <div className="mt-8">
            <Link to="/app">
              <Button size="lg" className="h-12 rounded-xl px-7 text-base">
                Start for Free <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}

function FlowCard({
  title,
  subtitle,
  icon,
  preview,
  accent,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  preview: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border bg-card p-4 shadow-sm ${
        accent ? "border-primary/30 ring-1 ring-primary/10" : "border-border/70"
      }`}
    >
      <div className="flex items-center gap-2">
        <div
          className={`grid h-8 w-8 place-items-center rounded-lg ${
            accent ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"
          }`}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{title}</div>
          <div className="truncate text-[11px] text-muted-foreground">{subtitle}</div>
        </div>
      </div>
      <div className="mt-3 rounded-xl border border-border/60 bg-background p-3">{preview}</div>
    </div>
  );
}

function Arrow() {
  return (
    <div className="flex items-center justify-center">
      <div className="hidden h-px w-full bg-gradient-to-r from-border via-border to-border md:block" />
      <ArrowRight className="mx-2 h-4 w-4 shrink-0 text-muted-foreground md:mx-0" />
    </div>
  );
}
