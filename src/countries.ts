export type SupportedCountry = "nl" | "de";

export interface CountryContext {
  /** Lowercase 2-letter country code used in most Lidl API paths (e.g. "nl", "de"). */
  country: string;
  /** Uppercase 2-letter ISO country code used in Country headers and /api/app/v1 paths (e.g. "NL", "DE"). */
  isoCountryCode: string;
  /** Lowercase 2-letter language code used in Accept-Language (e.g. "nl", "de"). */
  language: string;
  /** Underscore locale used by shop APIs (e.g. "nl_NL", "de_DE"). */
  locale: string;
  /** IANA timezone (e.g. "Europe/Amsterdam", "Europe/Berlin"). */
  zoneId: string;
  /** Country webshop base URL (e.g. "https://www.lidl.nl", "https://www.lidl.de"). */
  shopBaseUrl: string;
}

const COUNTRY_PRESETS: Record<string, CountryContext> = {
  nl: {
    country: "nl",
    isoCountryCode: "NL",
    language: "nl",
    locale: "nl_NL",
    zoneId: "Europe/Amsterdam",
    shopBaseUrl: "https://www.lidl.nl",
  },
  de: {
    country: "de",
    isoCountryCode: "DE",
    language: "de",
    locale: "de_DE",
    zoneId: "Europe/Berlin",
    shopBaseUrl: "https://www.lidl.de",
  },
};

export function getDefaultCountry(): string {
  return (process.env.LIDL_COUNTRY || "nl").trim().toLowerCase() || "nl";
}

export function getDefaultLanguage(): string | undefined {
  const env = process.env.LIDL_LANGUAGE?.trim();
  return env ? env.toLowerCase() : undefined;
}

/**
 * Resolve a country + optional language into normalized Lidl country/locale metadata.
 * Defaults to LIDL_COUNTRY (or "nl") when omitted.
 */
export function resolveCountry(
  countryInput?: string,
  languageInput?: string
): CountryContext {
  const rawCountry = (countryInput || getDefaultCountry()).trim().toLowerCase();
  const code = rawCountry || "nl";
  const iso = code.toUpperCase();

  const preset = COUNTRY_PRESETS[code];
  const overrideLang = (languageInput || (!countryInput ? getDefaultLanguage() : undefined))
    ?.trim()
    .toLowerCase();

  if (preset) {
    const language = overrideLang || preset.language;
    return {
      ...preset,
      language,
      locale: `${language}_${iso}`,
    };
  }

  const language = overrideLang || code;
  return {
    country: code,
    isoCountryCode: iso,
    language,
    locale: `${language}_${iso}`,
    zoneId: "Europe/Amsterdam",
    shopBaseUrl: `https://www.lidl.${code}`,
  };
}
