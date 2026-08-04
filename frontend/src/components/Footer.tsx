import { Link } from "@tanstack/react-router";
import { FileText } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-border/60 bg-background">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-2">
        <div>
          <div className="flex items-center gap-2 font-semibold">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">
              <FileText className="h-4 w-4" />
            </span>
            DocStruct AI
          </div>
          <p className="mt-3 max-w-sm text-sm text-muted-foreground">
            Turn raw text into professionally structured Microsoft Word documents in seconds.
          </p>
        </div>
        <nav
          className="grid grid-cols-2 gap-6 text-sm sm:grid-cols-3"
          aria-label="Footer"
        >
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Product
            </div>
            <a className="block text-foreground/80 hover:text-foreground" href="/#features">
              Features
            </a>
            <a className="block text-foreground/80 hover:text-foreground" href="/#example">
              Example
            </a>
          </div>
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Company
            </div>
            <a className="block text-foreground/80 hover:text-foreground" href="#">
              About
            </a>
            <Link className="block text-foreground/80 hover:text-foreground" to="/contact">
              Contact
            </Link>
          </div>
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Links
            </div>
            <a
              className="block text-foreground/80 hover:text-foreground"
              href="https://ibitundeolufemi.lovable.app"
              target="_blank"
              rel="noreferrer"
            >
              Website
            </a>
            <a
              className="block text-foreground/80 hover:text-foreground"
              href="http://www.linkedin.com/in/olufemi-ibitunde-389aa1255/"
              target="_blank"
              rel="noreferrer"
            >
              LinkedIn
            </a>
            <a
              className="block text-foreground/80 hover:text-foreground"
              href="https://github.com/Olufemooshegs/docstruct"
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </a>
          </div>
        </nav>
      </div>
      <div className="border-t border-border/60 py-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} DocStruct AI. All rights reserved.
      </div>
    </footer>
  );
}
