import type { HighlighterCore, ThemedToken } from 'shiki/core';

export const THEME = 'github-light';

/**
 * Highlighting is skipped past these thresholds so that typing never stalls on a
 * huge paste. `codeToTokens` runs synchronously on every keystroke (the overlay
 * must never lag behind the caret), so the cap is deliberately conservative.
 */
export const HIGHLIGHT_MAX_BYTES = 300_000;
export const GUTTER_MAX_LINES = 20_000;

/**
 * Explicit grammar map rather than a template-literal dynamic import: it keeps
 * each grammar in its own lazily fetched chunk instead of pulling all ~700
 * shiki languages into the build graph. Every module here also bundles its own
 * embedded grammars, so a language is always self-contained once loaded.
 */
const GRAMMARS: Record<string, () => Promise<{ default: unknown }>> = {
  bash: () => import('shiki/langs/bash.mjs'),
  c: () => import('shiki/langs/c.mjs'),
  cpp: () => import('shiki/langs/cpp.mjs'),
  csharp: () => import('shiki/langs/csharp.mjs'),
  css: () => import('shiki/langs/css.mjs'),
  diff: () => import('shiki/langs/diff.mjs'),
  docker: () => import('shiki/langs/docker.mjs'),
  go: () => import('shiki/langs/go.mjs'),
  graphql: () => import('shiki/langs/graphql.mjs'),
  html: () => import('shiki/langs/html.mjs'),
  ini: () => import('shiki/langs/ini.mjs'),
  java: () => import('shiki/langs/java.mjs'),
  javascript: () => import('shiki/langs/javascript.mjs'),
  json: () => import('shiki/langs/json.mjs'),
  jsonc: () => import('shiki/langs/jsonc.mjs'),
  jsx: () => import('shiki/langs/jsx.mjs'),
  kotlin: () => import('shiki/langs/kotlin.mjs'),
  less: () => import('shiki/langs/less.mjs'),
  lua: () => import('shiki/langs/lua.mjs'),
  make: () => import('shiki/langs/make.mjs'),
  markdown: () => import('shiki/langs/markdown.mjs'),
  php: () => import('shiki/langs/php.mjs'),
  powershell: () => import('shiki/langs/powershell.mjs'),
  python: () => import('shiki/langs/python.mjs'),
  r: () => import('shiki/langs/r.mjs'),
  ruby: () => import('shiki/langs/ruby.mjs'),
  rust: () => import('shiki/langs/rust.mjs'),
  scala: () => import('shiki/langs/scala.mjs'),
  scss: () => import('shiki/langs/scss.mjs'),
  sql: () => import('shiki/langs/sql.mjs'),
  swift: () => import('shiki/langs/swift.mjs'),
  toml: () => import('shiki/langs/toml.mjs'),
  tsx: () => import('shiki/langs/tsx.mjs'),
  typescript: () => import('shiki/langs/typescript.mjs'),
  vue: () => import('shiki/langs/vue.mjs'),
  xml: () => import('shiki/langs/xml.mjs'),
  yaml: () => import('shiki/langs/yaml.mjs'),
};

const EXTENSION_LANGUAGES: Record<string, string> = {
  bash: 'bash', sh: 'bash', zsh: 'bash', fish: 'bash',
  c: 'c', h: 'c',
  cc: 'cpp', cpp: 'cpp', cxx: 'cpp', hpp: 'cpp', hh: 'cpp',
  cs: 'csharp',
  css: 'css',
  diff: 'diff', patch: 'diff',
  go: 'go',
  gql: 'graphql', graphql: 'graphql',
  htm: 'html', html: 'html', svg: 'xml',
  cfg: 'ini', conf: 'ini', env: 'ini', ini: 'ini',
  java: 'java',
  cjs: 'javascript', js: 'javascript', mjs: 'javascript',
  json: 'json',
  jsonc: 'jsonc',
  jsx: 'jsx',
  kt: 'kotlin', kts: 'kotlin',
  less: 'less',
  lua: 'lua',
  mk: 'make',
  markdown: 'markdown', md: 'markdown', mdx: 'markdown',
  php: 'php',
  ps1: 'powershell',
  py: 'python', pyi: 'python',
  r: 'r',
  rb: 'ruby',
  rs: 'rust',
  sc: 'scala', scala: 'scala',
  scss: 'scss',
  sql: 'sql',
  swift: 'swift',
  toml: 'toml',
  tsx: 'tsx',
  mts: 'typescript', ts: 'typescript',
  vue: 'vue',
  plist: 'xml', xml: 'xml', xsl: 'xml',
  yaml: 'yaml', yml: 'yaml',
};

/** Files identified by name rather than extension. */
const FILENAME_LANGUAGES: Record<string, string> = {
  '.bashrc': 'bash',
  '.env': 'ini',
  '.gitignore': 'ini',
  '.zshrc': 'bash',
  dockerfile: 'docker',
  gemfile: 'ruby',
  makefile: 'make',
  rakefile: 'ruby',
};

/** Resolves a display language id from a file path, or null when unsupported. */
export function resolveLanguage(filePath: string): string | null {
  const baseName = (filePath.split('/').pop() || '').toLowerCase();
  if (!baseName) return null;

  const byName = FILENAME_LANGUAGES[baseName];
  if (byName) return byName;

  // "Dockerfile.prod" and friends.
  const stem = baseName.split('.')[0];
  if (stem && FILENAME_LANGUAGES[stem] && baseName.startsWith(`${stem}.`)) {
    return FILENAME_LANGUAGES[stem];
  }

  const dotIndex = baseName.lastIndexOf('.');
  if (dotIndex <= 0) return null;

  const language = EXTENSION_LANGUAGES[baseName.slice(dotIndex + 1)];
  return language && GRAMMARS[language] ? language : null;
}

let highlighterPromise: Promise<HighlighterCore> | null = null;
const loadedLanguages = new Set<string>();

async function getHighlighter(): Promise<HighlighterCore> {
  if (!highlighterPromise) {
    highlighterPromise = (async () => {
      // The JavaScript regex engine avoids shipping the ~500 KB Oniguruma WASM
      // binary; `forgiving` skips the handful of grammar patterns it cannot
      // translate instead of throwing.
      const [core, engine, theme] = await Promise.all([
        import('shiki/core'),
        import('shiki/engine/javascript'),
        import('shiki/themes/github-light.mjs'),
      ]);

      return core.createHighlighterCore({
        themes: [theme.default],
        langs: [],
        engine: engine.createJavaScriptRegexEngine({ forgiving: true }),
      });
    })().catch((error) => {
      highlighterPromise = null;
      throw error;
    });
  }

  return highlighterPromise;
}

/**
 * Loads the grammar for `language` and returns a highlighter ready to tokenize
 * synchronously. Returns null for unsupported languages or load failures so the
 * caller can fall back to plain text.
 */
export async function loadHighlighter(language: string): Promise<HighlighterCore | null> {
  const loadGrammar = GRAMMARS[language];
  if (!loadGrammar) return null;

  try {
    const highlighter = await getHighlighter();

    if (!loadedLanguages.has(language)) {
      const grammar = await loadGrammar();
      await highlighter.loadLanguage(grammar.default as Parameters<HighlighterCore['loadLanguage']>[0]);
      loadedLanguages.add(language);
    }

    return highlighter;
  } catch (error) {
    console.error(`Failed to load syntax highlighting for "${language}":`, error);
    return null;
  }
}

/** Synchronously tokenizes into per-line token arrays; null on any failure. */
export function tokenizeLines(
  highlighter: HighlighterCore,
  code: string,
  language: string,
): ThemedToken[][] | null {
  try {
    return highlighter.codeToTokens(code, { lang: language, theme: THEME }).tokens;
  } catch (error) {
    console.error('Tokenization failed:', error);
    return null;
  }
}

/** Maps shiki's FontStyle bitmask onto inline CSS. */
export function tokenFontStyle(fontStyle: number | undefined): React.CSSProperties {
  if (!fontStyle) return {};

  const style: React.CSSProperties = {};
  if (fontStyle & 1) style.fontStyle = 'italic';
  if (fontStyle & 2) style.fontWeight = 'bold';
  if (fontStyle & 4) style.textDecoration = 'underline';
  return style;
}
