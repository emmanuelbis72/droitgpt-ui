import DOMPurify from "dompurify";

const ALLOWED_TAGS = [
  "a",
  "br",
  "code",
  "div",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "hr",
  "li",
  "ol",
  "p",
  "pre",
  "span",
  "strong",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
];

const ALLOWED_ATTR = ["class", "href", "rel", "target"];

export function sanitizeHtml(html) {
  return DOMPurify.sanitize(String(html || ""), {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    FORBID_TAGS: ["iframe", "object", "embed", "script", "style"],
    FORBID_ATTR: ["style", "onerror", "onclick", "onload", "onmouseover"],
  });
}
