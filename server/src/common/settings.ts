import { Flavor } from "./flavor.js";

export interface EOPlusSettings {
  trace: TraceSettings;
  language: LanguageSettings;
  diagnostics: DiagnosticsSettings;
}

export interface TraceSettings {
  server: "off" | "messages" | "verbose";
}

export interface LanguageSettings {
  flavor: Flavor;
}

export interface DiagnosticsSettings {
  alternateKeywordCasings: Array<string>;
}
