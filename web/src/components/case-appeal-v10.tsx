import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "./ui/button";
import {
  requestCaseAppealLink,
  getVerifiedCaseAppeal,
  submitVerifiedCaseAppeal,
} from "@/lib/kamino/operations-v10";
const input =
  "w-full rounded-xl border border-border bg-surface p-3 text-fg focus:outline-2 focus:outline-accent";
export function CaseAppealPage() {
  const [proof, setProof] = useState(""),
    [caseId, setCaseId] = useState(""),
    [email, setEmail] = useState(""),
    [message, setMessage] = useState(""),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    client = useQueryClient();
  useEffect(() => {
    setProof(new URLSearchParams(window.location.hash.slice(1)).get("proof") ?? "");
  }, []);
  const q = useQuery({
    queryKey: ["caseAppeal", proof],
    queryFn: () => getVerifiedCaseAppeal({ data: proof }),
    enabled: !!proof,
    retry: false,
  });
  const run = async (work: () => Promise<unknown>, text: string) => {
    setBusy(true);
    setError("");
    try {
      await work();
      setNotice(text);
      await client.invalidateQueries({ queryKey: ["caseAppeal"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not complete the request.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="mx-auto min-h-dvh max-w-xl space-y-5 p-5 text-fg">
      <a href="/" className="font-display text-2xl font-bold text-accent">
        Kamino
      </a>
      <h1 className="text-3xl font-bold">Review a decision</h1>
      <p className="text-sm text-muted">
        Appeals remain available when an account is suspended or banned. Verify the email address
        linked to your case to read its decision and submit an appeal. Links expire within one hour.
      </p>
      {notice ? (
        <p role="status" className="rounded-xl bg-elevated p-3">
          {notice}
        </p>
      ) : null}
      {error || q.error ? (
        <p role="alert" className="rounded-xl bg-danger/10 p-3 text-danger">
          {error || q.error?.message}
        </p>
      ) : null}
      {proof ? (
        q.isPending ? (
          <p role="status">Checking your appeal link…</p>
        ) : q.data ? (
          <section className="space-y-4 rounded-2xl border border-border bg-surface p-4">
            <h2 className="text-xl font-bold">Case #{q.data.case.id}</h2>
            <p>
              {String(q.data.case.status)} · {String(q.data.case.decision)}
            </p>
            <p>{String(q.data.case.public_reason) || "This case is still under review."}</p>
            {q.data.events.map((event, index) => (
              <p className="text-sm" key={index}>
                {String(event.kind)}: {String(event.note)}
              </p>
            ))}
            {q.data.appeals.length ? (
              q.data.appeals.map((appeal) => (
                <div className="rounded-xl bg-elevated p-3" key={Number(appeal.id)}>
                  <p>Your appeal: {String(appeal.status)}</p>
                  <p>{String(appeal.message)}</p>
                  <p>{String(appeal.decision_note)}</p>
                </div>
              ))
            ) : ["decided", "closed"].includes(String(q.data.case.status)) &&
              q.data.case.decision !== "no_action" ? (
              <>
                <label className="block space-y-1">
                  <span>Explain why the decision should change</span>
                  <textarea
                    className={input}
                    rows={5}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    maxLength={3000}
                  />
                </label>
                <Button
                  disabled={busy || message.trim().length < 20}
                  onClick={() =>
                    void run(
                      () => submitVerifiedCaseAppeal({ data: { proof, message } }),
                      "Your appeal was submitted for another administrator to review.",
                    )
                  }
                >
                  Submit appeal
                </Button>
              </>
            ) : null}
          </section>
        ) : null
      ) : (
        <section className="space-y-4 rounded-2xl border border-border bg-surface p-4">
          <label className="block space-y-1">
            <span>Case number (optional)</span>
            <input
              className={input}
              inputMode="numeric"
              value={caseId}
              onChange={(e) => setCaseId(e.target.value)}
            />
          </label>
          <label className="block space-y-1">
            <span>Verified email address</span>
            <input
              className={input}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={254}
            />
          </label>
          <Button
            disabled={busy || !email || (!!caseId && !/^\d+$/.test(caseId))}
            onClick={() =>
              void run(
                () =>
                  requestCaseAppealLink({
                    data: { ...(caseId ? { caseId: Number(caseId) } : {}), email },
                  }),
                "If the verified email matches this case, an appeal link has been sent.",
              )
            }
          >
            Email my appeal link
          </Button>
          <p className="text-xs text-muted">
            Your case number appears in your account’s decision notice. Contact support if you
            cannot find it.
          </p>
        </section>
      )}
    </main>
  );
}
