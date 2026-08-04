import { createFileRoute } from "@tanstack/react-router";
import { Linkedin, Github, Send, MessageCircle, Globe } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact — DocStruct AI" },
      { name: "description", content: "Get in touch with the DocStruct AI team." },
    ],
  }),
  component: ContactPage,
});

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M18.244 2H21.5l-7.5 8.57L23 22h-6.844l-5.36-6.98L4.6 22H1.34l8.02-9.16L1 2h7.02l4.84 6.4L18.244 2zm-2.4 18h1.87L7.24 4H5.24l10.604 16z" />
    </svg>
  );
}

function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M20.317 4.369A19.79 19.79 0 0 0 16.558 3c-.2.36-.44.84-.6 1.23a18.27 18.27 0 0 0-5.916 0C9.881 3.84 9.64 3.36 9.44 3a19.74 19.74 0 0 0-3.76 1.37C2.02 9.9 1.03 15.29 1.52 20.6c2.28 1.68 4.49 2.7 6.66 3.37.53-.73 1-1.51 1.4-2.33-.77-.29-1.5-.65-2.2-1.07.18-.13.36-.27.53-.41a13.79 13.79 0 0 0 12.18 0c.17.14.35.28.53.41-.7.42-1.44.78-2.2 1.07.4.82.87 1.6 1.4 2.33 2.17-.67 4.38-1.69 6.66-3.37.57-6.16-.95-11.5-3.96-16.23zM8.02 16.36c-1.18 0-2.15-1.09-2.15-2.42 0-1.33.95-2.42 2.15-2.42s2.17 1.09 2.15 2.42c0 1.33-.95 2.42-2.15 2.42zm7.96 0c-1.18 0-2.15-1.09-2.15-2.42 0-1.33.95-2.42 2.15-2.42s2.17 1.09 2.15 2.42c0 1.33-.95 2.42-2.15 2.42z" />
    </svg>
  );
}

const contacts = [
  {
    label: "Website",
    handle: "ibitundeolufemi.lovable.app",
    href: "https://ibitundeolufemi.lovable.app",
    Icon: Globe,
    color: "text-primary",
  },
  {
    label: "LinkedIn",
    handle: "Olufemi Ibitunde",
    href: "http://www.linkedin.com/in/olufemi-ibitunde-389aa1255/",
    Icon: Linkedin,
    color: "text-[#0A66C2]",
  },
  {
    label: "X (Twitter)",
    handle: "@Olufemoo_1",
    href: "https://x.com/Olufemoo_1",
    Icon: XIcon,
    color: "text-foreground",
  },
  {
    label: "Telegram",
    handle: "@Olufemoo2",
    href: "https://t.me/Olufemoo2",
    Icon: Send,
    color: "text-[#229ED9]",
  },
  {
    label: "Discord",
    handle: "Olufemi04627",
    href: "https://discord.com/users/Olufemi04627",
    Icon: DiscordIcon,
    color: "text-[#5865F2]",
  },
  {
    label: "GitHub",
    handle: "Olufemooshegs/docstruct",
    href: "https://github.com/Olufemooshegs/docstruct",
    Icon: Github,
    color: "text-foreground",
  },
];

function ContactPage() {
  return (
    <main className="min-h-dvh bg-background">
      <Navbar />
      <section className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-border/70 bg-secondary/60 px-3 py-1 text-xs font-medium text-muted-foreground">
            <MessageCircle className="h-3.5 w-3.5 text-primary" />
            Let's talk
          </div>
          <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-5xl">Get in touch</h1>
          <p className="mt-4 text-muted-foreground">
            Have feedback, an idea, or want to collaborate? Reach out on any of the channels below.
          </p>
        </div>

        <div className="mx-auto mt-12 grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2">
          {contacts.map(({ label, handle, href, Icon, color }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noreferrer"
              className="group flex items-center gap-4 rounded-2xl border border-border/70 bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_1px_0_0_rgba(0,0,0,0.02),0_20px_40px_-20px_rgba(37,99,235,0.25)]"
            >
              <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-secondary ${color}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold">{label}</div>
                <div className="truncate text-sm text-muted-foreground">{handle}</div>
              </div>
              <span className="ml-auto text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                Open →
              </span>
            </a>
          ))}
        </div>
      </section>
      <Footer />
    </main>
  );
}
