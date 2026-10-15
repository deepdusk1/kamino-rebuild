import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { smartSearch, type SearchKind, type SearchResult } from "@/api/search-v10";
import { Button, Card, Chip, Field, Loading, Screen, Txt } from "@/components/ui";
import { showError } from "@/lib/errors";
import { appHrefFromServerHref } from "@/lib/hrefs";

const KIND_LABEL: Record<SearchKind | "all", string> = { all: "Everything", post: "Posts", community: "Communities", person: "People" };
const RESULT_LABEL: Record<SearchKind, string> = { post: "Post", community: "Community", person: "Person" };

/** Smart-search results: tap a card to open it. */
function Results({ rows }: { rows: SearchResult[] }) {
  return (
    <>
      {rows.map((r) => (
        <Card key={`${r.kind}:${r.id}`} onPress={() => router.push(appHrefFromServerHref(r.href) as never)} accessibilityLabel={`${RESULT_LABEL[r.kind]}: ${r.title}. Open`}>
          <Txt variant="caption" tone="muted">
            {RESULT_LABEL[r.kind]}
          </Txt>
          <Txt variant="heading" numberOfLines={2}>
            {r.title}
          </Txt>
          {r.excerpt ? (
            <Txt tone="muted" numberOfLines={3}>
              {r.excerpt}
            </Txt>
          ) : null}
        </Card>
      ))}
    </>
  );
}

/**
 * Smart search ("search by meaning") and interest-based recommendations. Both send text to the AI provider the app
 * owner configured, so they only run after the person agrees. Regular search (/search) never needs this.
 */
export default function SmartSearch() {
  const queryClient = useQueryClient();
  const status = useQuery({ queryKey: ["semanticStatus"], queryFn: smartSearch.status });
  const configured = status.data?.configured === true;
  const recs = useQuery({ queryKey: ["semanticRecommendations"], queryFn: smartSearch.recommendations, enabled: configured });
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<SearchKind | "all">("all");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState<"search" | "personalize" | null>(null);
  const [results, setResults] = useState<SearchResult[] | null>(null);

  const search = async () => {
    setBusy("search");
    try {
      setResults((await smartSearch.search(query.trim(), kind, consent)).results);
    } catch (error) {
      showError(error);
    } finally {
      setBusy(null);
    }
  };

  const personalize = async () => {
    setBusy("personalize");
    try {
      await smartSearch.personalize(!status.data?.personalized, consent);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["semanticStatus"] }),
        queryClient.invalidateQueries({ queryKey: ["semanticRecommendations"] }),
      ]);
    } catch (error) {
      showError(error);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen>
      <Txt variant="title">Find your people</Txt>
      <Txt tone="muted">Describe an interest or the kind of community you want. Smart search compares meaning, not just words.</Txt>
      {status.isPending ? <Loading /> : null}
      {status.error ? <Txt tone="danger">{status.error.message}</Txt> : null}
      {status.data && !configured ? (
        <Card>
          <Txt variant="heading">{"Smart search isn't set up yet"}</Txt>
          <Txt tone="muted">The app owner needs to connect an AI provider first. Regular search works as usual.</Txt>
          <Button label="Open search" onPress={() => router.push("/search")} />
        </Card>
      ) : null}
      {configured ? (
        <>
          <Card>
            <Field label="What are you looking for?" value={query} onChangeText={setQuery} maxLength={800} multiline placeholder="People who enjoy manga and drawing" />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {(["all", "post", "community", "person"] as const).map((k) => (
                <Chip key={k} label={KIND_LABEL[k]} selected={kind === k} onPress={() => setKind(k)} />
              ))}
            </View>
            <Txt variant="small" tone="muted">
              Smart search sends your search text (and, for recommendations, the interests on your profile) to the AI provider the app uses.
            </Txt>
            <Chip label={consent ? "I agree: AI processing on" : "Tap to agree to AI processing"} selected={consent} onPress={() => setConsent(!consent)} />
            <Button
              label="Search by meaning"
              busy={busy === "search"}
              disabled={!consent || query.trim().length < 2 || busy !== null}
              onPress={() => void search()}
            />
          </Card>
          {results ? (
            <>
              <Txt variant="heading">Results</Txt>
              {results.length ? <Results rows={results} /> : <Txt tone="muted">Nothing similar found yet. Try other words, or regular search.</Txt>}
            </>
          ) : null}
          <Card>
            <Txt variant="heading">Recommendations from your interests</Txt>
            <Txt tone="muted">Matches the interests on your profile. Turning this off deletes what was saved for it.</Txt>
            <Button
              label={status.data?.personalized ? "Turn off recommendations" : "Turn on recommendations"}
              busy={busy === "personalize"}
              disabled={busy !== null || (!status.data?.personalized && !consent)}
              onPress={() => void personalize()}
            />
          </Card>
          {recs.error ? <Txt tone="danger">{recs.error.message}</Txt> : null}
          {recs.data?.enabled ? (
            recs.data.results.length ? <Results rows={recs.data.results} /> : <Txt tone="muted">No recommendations yet. Check back once more posts are indexed.</Txt>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
