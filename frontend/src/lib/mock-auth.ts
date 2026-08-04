import { useEffect, useState } from "react";
import { apiJson } from "./api";

const KEY = "docstruct_token";

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function isAuthed(): boolean {
  // Prefer cookie-based server session; localStorage is fallback for compatibility
  return Boolean(getAuthToken());
}

export function signIn(token = "1") {
  try {
    // Trigger auth refresh by checking server session
    window.dispatchEvent(new Event("docstruct:auth"));
  } catch {
    // ignore
  }
}

export function signOut() {
  try {
    // Call server logout to clear cookies
    try {
      fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
    } catch {}
    window.localStorage.removeItem(KEY);
    window.dispatchEvent(new Event("docstruct:auth"));
  } catch {
    // ignore
  }
}

export function useMockAuth() {
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function checkServer() {
      try {
        const resp = await apiJson('/api/auth/me');
        if (!mounted) return;
        setAuthed(Boolean(resp?.success));
      } catch (err) {
        if (!mounted) return;
        setAuthed(isAuthed());
      }
    }

    checkServer();

    const update = () => setAuthed(isAuthed());
    window.addEventListener("docstruct:auth", update);
    window.addEventListener("storage", update);
    return () => {
      mounted = false;
      window.removeEventListener("docstruct:auth", update);
      window.removeEventListener("storage", update);
    };
  }, []);

  return authed;
}
