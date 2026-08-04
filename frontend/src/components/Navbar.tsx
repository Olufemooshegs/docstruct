import { Link, useNavigate } from "@tanstack/react-router";
import { FileText, Github, Moon, Sun, Menu, X, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { signOut, useMockAuth } from "@/lib/mock-auth";


export function Navbar() {
  const [dark, setDark] = useState(false);
  const [open, setOpen] = useState(false);
  const authed = useMockAuth();
  const navigate = useNavigate();

  function handleLogout() {
    signOut();
    setOpen(false);
    navigate({ to: "/" });
  }


  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <nav
        className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6"
        aria-label="Main"
      >
        <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">
            <FileText className="h-4 w-4" />
          </span>
          <span>DocStruct AI</span>
        </Link>

        <div className="hidden items-center gap-1 md:flex">
          <Link
            to="/"
            className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Home
          </Link>
          <a
            href="/#features"
            className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Features
          </a>
          <Link
            to="/contact"
            className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Contact
          </Link>
          <a
            href="https://github.com/Olufemooshegs/docstruct"
            target="_blank"
            rel="noreferrer"
            className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Github className="h-4 w-4" />
          </a>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Toggle theme"
            onClick={() => setDark((d) => !d)}
            className="ml-1"
          >
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          {authed ? (
            <>
              <Link to="/app" className="ml-2">
                <Button variant="ghost" className="rounded-xl">Open app</Button>
              </Link>
              <Button className="rounded-xl" variant="outline" onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" /> Log out
              </Button>
            </>
          ) : (
            <>
              <Link to="/login" className="ml-2">
                <Button variant="ghost" className="rounded-xl">Log in</Button>
              </Link>
              <Link to="/signup">
                <Button className="rounded-xl">Sign up</Button>
              </Link>
            </>
          )}

        </div>

        <div className="flex items-center gap-1 md:hidden">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Toggle theme"
            onClick={() => setDark((d) => !d)}
          >
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Open menu"
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </nav>

      {open && (
        <div className="border-t border-border/60 bg-background md:hidden">
          <div className="mx-auto flex max-w-6xl flex-col p-3">
            <Link
              to="/"
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2 text-sm hover:bg-accent"
            >
              Home
            </Link>
            <a
              href="/#features"
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2 text-sm hover:bg-accent"
            >
              Features
            </a>
            <Link
              to="/contact"
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2 text-sm hover:bg-accent"
            >
              Contact
            </Link>
            <a
              href="https://github.com/Olufemooshegs/docstruct"
              target="_blank"
              rel="noreferrer"
              className="rounded-lg px-3 py-2 text-sm hover:bg-accent"
            >
              <span className="inline-flex items-center gap-2">
                <Github className="h-4 w-4" /> GitHub
              </span>
            </a>
            {authed ? (
              <>
                <Link to="/app" onClick={() => setOpen(false)} className="mt-2">
                  <Button variant="outline" className="w-full rounded-xl">Open app</Button>
                </Link>
                <Button
                  className="mt-2 w-full rounded-xl"
                  onClick={handleLogout}
                >
                  <LogOut className="mr-2 h-4 w-4" /> Log out
                </Button>
              </>
            ) : (
              <>
                <Link to="/login" onClick={() => setOpen(false)} className="mt-2">
                  <Button variant="outline" className="w-full rounded-xl">Log in</Button>
                </Link>
                <Link to="/signup" onClick={() => setOpen(false)} className="mt-2">
                  <Button className="w-full rounded-xl">Sign up</Button>
                </Link>
              </>
            )}

          </div>
        </div>
      )}
    </header>
  );
}
