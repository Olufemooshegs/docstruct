import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { apiJson } from "@/lib/api";
import { signIn } from "@/lib/mock-auth";

import { z } from "zod";
import { FileText, Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp";

const searchSchema = z.object({
  email: z.string().email().optional().catch(undefined),
});

export const Route = createFileRoute("/verify")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Verify your email — DocStruct AI" },
      { name: "description", content: "Enter the 6-digit code sent to your email." },
    ],
  }),
  component: VerifyPage,
});

const RESEND_SECONDS = 30;

function VerifyPage() {
  const navigate = useNavigate();
  const { email } = Route.useSearch();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(RESEND_SECONDS);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    if (seconds <= 0) return;
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds]);

  async function handleVerify(value: string) {
    setError(null);
    setLoading(true);
    try {
      await apiJson("/api/auth/verify-otp", {
        method: "POST",
        body: JSON.stringify({ email, otp: value }),
      });
      signIn(`verified:${email ?? "user"}`);
      navigate({ to: "/app" });
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : "Invalid code. Please try again.");
      setCode("");
    } finally {
      setLoading(false);
    }
  }

  function handleResend() {
    if (seconds > 0) return;
    setResent(true);
    setSeconds(RESEND_SECONDS);
    setTimeout(() => setResent(false), 2500);
  }

  return (
    <main className="min-h-dvh bg-background">
      <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-12 sm:px-6">
        <Link to="/" className="mx-auto mb-8 flex items-center gap-2 font-semibold">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground">
            <FileText className="h-4 w-4" />
          </span>
          DocStruct AI
        </Link>

        <div className="rounded-2xl border border-border/70 bg-card p-6 shadow-sm sm:p-8">
          <div className="text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
              <MailCheck className="h-6 w-6" />
            </div>
            <h1 className="mt-4 text-2xl font-bold tracking-tight">Verify your email</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              We sent a 6-digit code to{" "}
              <span className="font-medium text-foreground">
                {email ?? "your email"}
              </span>
              . Enter it below to activate your account.
            </p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (code.length === 6) handleVerify(code);
            }}
            className="mt-8 flex flex-col items-center gap-5"
          >
            <InputOTP
              maxLength={6}
              value={code}
              onChange={(v) => {
                setCode(v);
                setError(null);
                if (v.length === 6) handleVerify(v);
              }}
              disabled={loading}
            >
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
              </InputOTPGroup>
              <InputOTPSeparator />
              <InputOTPGroup>
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>

            {error && (
              <p className="w-full rounded-lg bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">
                {error}
              </p>
            )}

            <Button
              type="submit"
              disabled={loading || code.length !== 6}
              className="h-11 w-full rounded-xl text-base"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify & continue"}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-muted-foreground">
            Didn't receive a code?{" "}
            <button
              type="button"
              onClick={handleResend}
              disabled={seconds > 0}
              className="font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
            >
              {seconds > 0 ? `Resend in ${seconds}s` : "Resend code"}
            </button>
            {resent && (
              <span className="ml-2 text-emerald-600">Code sent.</span>
            )}
          </div>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Wrong email?{" "}
            <Link to="/signup" className="font-medium text-foreground hover:underline">
              Go back
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
