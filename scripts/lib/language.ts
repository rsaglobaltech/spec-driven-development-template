/**
 * The language of generated prose, as `scripts/` reaches it.
 *
 * The phrase tables are domain (`core/domain/Language`) and reading a
 * project's chosen language off its config is infrastructure
 * (`DiskLanguageRepository`). Both are re-exported here so the generators keep
 * one import site.
 */

export {
  KEYWORDS,
  PHRASES,
  DEFAULT,
  Phrases,
  phrasesFor,
  languageFor,
} from "../../packages/core/src/domain/Language";

export {
  readConfigured,
  resolveLanguage,
  phrases,
} from "../../packages/core/src/infrastructure/DiskLanguageRepository";
