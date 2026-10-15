import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Keyboard, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { api } from "@/api/endpoints";
import { FilterSheet, RecentSearches, SearchResults } from "@/components/community/ExploreSearch";
import { DEFAULT_FILTERS, activeFilterCount, searchReady, type SearchFilters } from "@/components/community/helpers";
import { AppHeader } from "@/components/k";
import { PressableScale, useTabBarSpace } from "@/components/ui";
import { useDebounced } from "@/lib/useDebounced";
import { radius, shadow, useTheme } from "@/theme";

/**
 * Search (/search?q=…): one box for people, communities, posts, tags, rooms and events.
 * Empty box → recent searches and trending tags. Typing two or more letters (or setting a filter) → results in
 * six tabs. Opened with `q` (a community name or a #tag) the search starts straight away.
 */
export default function Search() {
  const theme = useTheme();
  const tabSpace = useTabBarSpace();
  const params = useLocalSearchParams<{ q?: string }>();
  const [query, setQuery] = useState(typeof params.q === "string" ? params.q : "");
  const [filters, setFilters] = useState<SearchFilters>(DEFAULT_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const trending = useQuery({ queryKey: ["exploreOverview", "forYou"], queryFn: () => api.exploreOverview(undefined) });
  const term = useDebounced(query.trim(), 300);
  const filterCount = activeFilterCount(filters);
  const showResults = searchReady(term, filterCount);

  const pick = (q: string) => {
    setQuery(q);
    Keyboard.dismiss();
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <AppHeader back actions={[]} />
      <View style={styles.row}>
        <View style={[styles.box, { backgroundColor: theme.surface, borderColor: theme.border }, shadow.card]}>
          <Ionicons name="search-outline" size={19} color={theme.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            autoFocus={!params.q}
            placeholder="Search people, communities, posts, #tags, @names"
            placeholderTextColor={theme.subtle}
            returnKeyType="search"
            onSubmitEditing={() => Keyboard.dismiss()}
            maxLength={60}
            autoCorrect={false}
            autoCapitalize="none"
            selectionColor={theme.accent}
            accessibilityLabel="Search"
            style={[styles.input, { color: theme.ink }]}
          />
          {query ? (
            <PressableScale onPress={() => setQuery("")} accessibilityLabel="Clear search" hitSlop={8} scaleTo={0.88}>
              <Ionicons name="close-circle" size={19} color={theme.subtle} />
            </PressableScale>
          ) : null}
        </View>
        <PressableScale
          onPress={() => setFiltersOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={filterCount > 0 ? `Filters, ${filterCount} on` : "Filters"}
          scaleTo={0.92}
          style={[styles.filter, { backgroundColor: theme.surface, borderColor: filterCount > 0 ? theme.accent : theme.border }, shadow.card]}
        >
          <Ionicons name="options-outline" size={20} color={filterCount > 0 ? theme.accent : theme.ink} />
        </PressableScale>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: 12, paddingBottom: tabSpace + 24 }}>
        {showResults ? (
          <SearchResults term={term} filters={filters} onPickQuery={pick} />
        ) : (
          <RecentSearches tags={trending.data?.trendingTags ?? []} onPick={pick} />
        )}
      </ScrollView>

      <FilterSheet visible={filtersOpen} value={filters} onApply={setFilters} onClose={() => setFiltersOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16 },
  box: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, height: 46, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1 },
  input: { flex: 1, fontSize: 15, height: 44 },
  filter: { width: 46, height: 46, borderRadius: 23, borderWidth: 1, alignItems: "center", justifyContent: "center" },
});
