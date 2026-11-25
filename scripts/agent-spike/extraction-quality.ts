export type ExtractionClass = "good" | "scrambled" | "empty";

/** A term to look for; an array lists alternatives, any of which counts. */
export type ExpectedTerm = string | readonly string[];

export interface ExtractionInput {
  text: string;
  pageCount: number;
  expectedTerms: readonly ExpectedTerm[];
}

export interface ExtractionQuality {
  classe: ExtractionClass;
  charsPerPage: number;
  termsFound: number;
  termsExpected: number;
  inOrder: boolean;
}

const MIN_CHARS_PER_PAGE = 20;
const MIN_TERM_SHARE = 0.8;

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function firstPosition(haystack: string, term: ExpectedTerm): number {
  const alternatives = typeof term === "string" ? [term] : term;
  const positions = alternatives
    .map((alternative) => haystack.indexOf(normalize(alternative)))
    .filter((position) => position >= 0);
  return positions.length === 0 ? -1 : Math.min(...positions);
}

export function classifyExtraction({
  text,
  pageCount,
  expectedTerms,
}: ExtractionInput): ExtractionQuality {
  const charsPerPage = text.replace(/\s/g, "").length / Math.max(pageCount, 1);
  const haystack = normalize(text);
  const positions = expectedTerms
    .map((term) => firstPosition(haystack, term))
    .filter((position) => position >= 0);
  const inOrder = positions.every(
    (position, index) => index === 0 || position > (positions[index - 1] ?? -1),
  );
  const termsFound = positions.length;
  const termsExpected = expectedTerms.length;
  const share = termsExpected === 0 ? 1 : termsFound / termsExpected;

  let classe: ExtractionClass;
  if (charsPerPage < MIN_CHARS_PER_PAGE) classe = "empty";
  else if (share >= MIN_TERM_SHARE && inOrder) classe = "good";
  else classe = "scrambled";

  return { classe, charsPerPage, termsFound, termsExpected, inOrder };
}
