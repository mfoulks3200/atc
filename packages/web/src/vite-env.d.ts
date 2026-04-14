/// <reference types="vite/client" />

declare const __ATC_VERSION__: string;
declare const __ATC_CHANGELOG__: string;
declare const __ATC_CONTRIBUTORS__: Array<{
  commits: number;
  name: string;
  email: string;
  username: string | null;
}>;
declare const __ATC_GLOSSARY__: Array<{
  term: string;
  definition: string;
}>;
declare const __ATC_RULES__: Array<{
  id: string;
  prefix: string;
  summary: string;
  section: string;
}>;
