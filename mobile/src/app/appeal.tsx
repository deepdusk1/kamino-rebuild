import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Screen, Card, Txt, Button, Field, Loading } from "@/components/ui";
import { operations } from "@/api/operations-v10";
export default function Appeal() {
  const params = useLocalSearchParams<{ proof?: string }>(),
    [proof, setProof] = useState(params.proof ?? ""),
    [link, setLink] = useState(""),
    [caseId, setCaseId] = useState(""),
    [email, setEmail] = useState(""),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    client = useQueryClient();
  const q = useQuery({
    queryKey: ["caseAppeal", proof],
    queryFn: () => operations.verified(proof),
    enabled: !!proof,
    retry: false,
  });
  const run = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setError("");
    try {
      await work();
      setNotice(done);
      await client.invalidateQueries({ queryKey: ["caseAppeal"] });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to complete the request.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen>
      <Txt variant="title">Review a decision</Txt>
      <Txt tone="muted">
        Verify your email to review and appeal a case, even when your account is
        suspended or banned. Links expire within one hour.
      </Txt>
      {notice ? <Txt>{notice}</Txt> : null}
      {error || q.error ? (
        <Txt tone="danger">{error || q.error?.message}</Txt>
      ) : null}
      {proof ? (
        q.isPending ? (
          <Loading />
        ) : q.data ? (
          <Card style={{ gap: 12 }}>
            <Txt variant="heading">Case #{q.data.case.id}</Txt>
            <Txt>
              {String(q.data.case.status)} · {String(q.data.case.decision)}
            </Txt>
            <Txt>
              {String(q.data.case.public_reason) ||
                "This case is under review."}
            </Txt>
            {q.data.events.map((event, index) => (
              <Txt variant="small" key={index}>
                {String(event.kind)}: {String(event.note)}
              </Txt>
            ))}
            {q.data.appeals.length ? (
              q.data.appeals.map((a) => (
                <Card key={Number(a.id)}>
                  <Txt>Appeal: {String(a.status)}</Txt>
                  <Txt>{String(a.message)}</Txt>
                  <Txt>{String(a.decision_note)}</Txt>
                </Card>
              ))
            ) : ["decided", "closed"].includes(String(q.data.case.status)) &&
              q.data.case.decision !== "no_action" ? (
              <>
                <Field
                  label="Why should the decision change?"
                  value={message}
                  onChangeText={setMessage}
                  multiline
                  maxLength={3000}
                />
                <Button
                  label="Submit appeal"
                  busy={busy}
                  disabled={message.trim().length < 20}
                  onPress={() =>
                    void run(
                      () => operations.verifiedAppeal(proof, message),
                      "Your appeal was submitted for another administrator to review.",
                    )
                  }
                />
              </>
            ) : null}
          </Card>
        ) : null
      ) : (
        <>
          <Card style={{ gap: 12 }}>
            <Field
              label="Case number (optional)"
              value={caseId}
              onChangeText={setCaseId}
              keyboardType="number-pad"
            />
            <Field
              label="Verified email address"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              maxLength={254}
            />
            <Button
              label="Email my appeal link"
              busy={busy}
              disabled={!email || (!!caseId && !/^\d+$/.test(caseId))}
              onPress={() =>
                void run(
                  () =>
                    operations.requestLink(
                      email,
                      caseId ? Number(caseId) : undefined,
                    ),
                  "If the verified email matches a case, an appeal link has been sent.",
                )
              }
            />
          </Card>
          <Card style={{ gap: 12 }}>
            <Field
              label="Paste the emailed appeal link"
              value={link}
              onChangeText={setLink}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Button
              variant="secondary"
              label="Open verified case"
              disabled={!link}
              onPress={() => {
                try {
                  const value = new URL(link).hash.replace(/^#/, "");
                  const token = new URLSearchParams(value).get("proof");
                  if (!token)
                    throw new Error(
                      "Paste the complete appeal link from your email.",
                    );
                  setProof(token);
                  setLink("");
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : "Invalid appeal link.",
                  );
                }
              }}
            />
          </Card>
        </>
      )}
    </Screen>
  );
}
