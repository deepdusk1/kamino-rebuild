import assert from "node:assert/strict";
import { test } from "node:test";
import { en } from "./en.ts";
import { es } from "./es.ts";
import { DEFAULT_LOCALE, availableLocales, format, isRtl, isSupportedLocale, readLocaleCookie, translate } from "./core.ts";

test("every catalog defines exactly the English keys — drift fails the build", () => {
  const englishKeys = Object.keys(en).sort();
  for (const [locale, catalog] of Object.entries({ es })) {
    assert.deepEqual(
      Object.keys(catalog).sort(),
      englishKeys,
      `${locale} is missing or has extra keys: ${Object.keys(catalog).filter((k) => !(k in en)).join(", ")}`,
    );
  }
});

test("catalog values are non-empty strings and placeholders match the English ones", () => {
  const placeholders = (value: string) => [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
  for (const [key, value] of Object.entries(en)) {
    assert.equal(typeof value, "string", `${key} must be a string`);
    assert.ok(value.length > 0, `${key} must not be empty`);
  }
  for (const [key, value] of Object.entries(es)) {
    assert.equal(placeholders(value), placeholders(en[key as keyof typeof en]!), `${key} placeholders drifted`);
  }
});

test("translate falls back to English for uncovered locales and unknown keys stay loud", () => {
  assert.equal(translate("es", "nav.home"), "Inicio");
  assert.equal(translate("fr", "nav.home"), "Home");
  assert.equal(translate(DEFAULT_LOCALE, "nav.chats"), "Chats");
});

test("format fills known placeholders and keeps unknown ones visible", () => {
  assert.equal(format("Continue with {provider}", { provider: "Google" }), "Continue with Google");
  assert.equal(format("© {year} Kamino", { year: 2026 }), "© 2026 Kamino");
  assert.equal(format("Hi {name}, bye {missing}", { name: "Ana" }), "Hi Ana, bye {missing}");
});

test("locale support, RTL flag and cookie round-trip behave", () => {
  assert.ok(isSupportedLocale("es"));
  assert.ok(!isSupportedLocale("xx"));
  assert.ok(!isSupportedLocale("Spanish"));
  // RTL metadata exists for Arabic, but direction only switches once a catalog lands.
  assert.ok(!isRtl("ar"));
  assert.ok(!isRtl("en"));
  assert.equal(readLocaleCookie(`${"kamino.locale"}=es; other=1`), "es");
  assert.equal(readLocaleCookie("nothing=here"), DEFAULT_LOCALE);
  assert.equal(readLocaleCookie("kamino.locale=zz"), DEFAULT_LOCALE);
});

test("available locales are exactly the ones with catalogs", () => {
  assert.deepEqual(availableLocales().sort(), ["en", "es"]);
});
