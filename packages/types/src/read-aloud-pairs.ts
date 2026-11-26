export type ReadAlongMatchTier = "exact" | "likely" | "maybe";

export const READ_ALONG_MATCH_FLAGS = ["abridged", "summary", "omnibus_audio", "omnibus_epub", "part_of", "dramatized", "language_conflict"] as const;

/** A reason the text and the narration may not line up. Any flag caps the tier at `maybe`. */
export type ReadAlongMatchFlag = (typeof READ_ALONG_MATCH_FLAGS)[number];

export type ReadAlongMatchReason =
  "isbn" | "work_id" | "title_exact" | "title_head" | "title_close" | "author" | "series" | "language" | "language_prior";

/** How the two sides' languages compare: `prior` when one side is only known from its library name. */
export type ReadAlongLanguageMatch = "equal" | "prior" | "unknown" | "conflict";

export type ReadAlongCopy = {
  ebookBookId: number;
  ebookFileId: number;
  libraryName: string | null;
};

export type ReadAlongCandidate = {
  ebookBookId: number;
  ebookFileId: number;
  title: string;
  authors: string[];
  libraryId: number;
  libraryName: string | null;
  language: string | null;
  languageMatch: ReadAlongLanguageMatch;
  score: number;
  tier: ReadAlongMatchTier;
  reasons: ReadAlongMatchReason[];
  flags: ReadAlongMatchFlag[];
  otherCopies: ReadAlongCopy[];
};

export type ReadAlongPairSource = "manual" | "accepted";

export type ReadAlongPair = {
  audiobookBookId: number;
  ebookBookId: number;
  ebookFileId: number;
  fileHash: string | null;
  source: ReadAlongPairSource;
  language: string | null;
  pairedAt: string;
  pairedBy: number | null;
};

export type ReadAlongPairStatus = "paired" | "needs_attention" | "suggested" | "ambiguous" | "flagged" | "none";

export type ReadAlongRow = {
  audiobook: {
    bookId: number;
    title: string;
    authors: string[];
    libraryName: string | null;
    durationSeconds: number | null;
    language: string | null;
    coverUrl?: string | null;
  };
  status: ReadAlongPairStatus;
  pair: ReadAlongPair | null;
  best: ReadAlongCandidate | null;
  candidateCount: number;
  readAlong: { fileId: number; stale: boolean } | null;
  activeJobId: string | null;
};

export type ReadAlongListSummary = Record<ReadAlongPairStatus, number> & { readAlongReady: number };

export type ReadAlongListResponse = {
  items: ReadAlongRow[];
  total: number;
  summary: ReadAlongListSummary;
};

export type PairEbookRequest = {
  ebookBookId: number;
  ebookFileId: number;
  dismissPrevious?: boolean;
  language?: string;
};
