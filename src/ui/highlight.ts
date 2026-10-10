const keywords = new Set([
  "import",
  "from",
  "const",
  "let",
  "await",
  "async",
  "for",
  "of",
  "if",
  "return",
  "true",
  "false",
  "new",
  "export",
  "default",
]);

type Token = {
  kind:
    "keyword" | "string" | "comment" | "number" | "function" | "property" | "punctuation" | "plain";
  text: string;
};

const pattern =
  /(\/\/[^\n]*)|('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)|(\b\d+\b)|([A-Za-z_$][\w$]*)(?=\s*\()|([A-Za-z_$][\w$]*)(?=\s*:)|([A-Za-z_$][\w$]*)|([{}()[\];,.:=<>+\-*/!&|?]+)|(\s+)|(.)/g;

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];

  for (const match of source.matchAll(pattern)) {
    const [text, comment, string, number, call, property, word, punctuation] = match;

    if (comment) tokens.push({ kind: "comment", text });
    else if (string) tokens.push({ kind: "string", text });
    else if (number) tokens.push({ kind: "number", text });
    else if (call) tokens.push({ kind: keywords.has(call) ? "keyword" : "function", text });
    else if (property) tokens.push({ kind: "property", text });
    else if (word) tokens.push({ kind: keywords.has(word) ? "keyword" : "plain", text });
    else if (punctuation) tokens.push({ kind: "punctuation", text });
    else tokens.push({ kind: "plain", text });
  }

  return tokens;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function highlight(source: string): string {
  return tokenize(source)
    .map((token) =>
      token.kind === "plain"
        ? escapeHtml(token.text)
        : `<span class="tok-${token.kind}">${escapeHtml(token.text)}</span>`,
    )
    .join("");
}
