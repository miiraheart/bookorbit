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
  /** Paired with an ebook this user cannot open; `pair` is then null. */
  pairHidden?: boolean;
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

export type ReadAlongCandidatesResponse = {
  pair: ReadAlongPair | null;
  /** Paired with an ebook this user cannot open; `pair` is then null. */
  pairHidden?: boolean;
  pairState: "ok" | "needs_attention" | null;
  candidates: ReadAlongCandidate[];
  /** Ebook records dismissed for this audiobook. Their candidates are listed only when asked for. */
  dismissedEbookBookIds: number[];
  dismissed: ReadAlongCandidate[];
};

export type PairEbookResponse = {
  pair: ReadAlongPair;
  /** A read-along in the audiobook record was made from another ebook than the one now paired. */
  readAlongStale: boolean;
};

export type ReadAlongFromPair = { fileId: number; filename: string };

export type UnpairEbookResponse = {
  removed: ReadAlongPair | null;
  /** Read-alongs in the audiobook record made from the unpaired EPUB. Nothing is deleted here. */
  readAlongs: ReadAlongFromPair[];
  canDeleteReadAlong: boolean;
};

export type DismissCandidateRequest = { ebookBookId: number };

export type ReadAlongDismissalsResponse = { dismissedEbookBookIds: number[] };

/** `dryRun` counts the pairs it would make and writes nothing. */
export type AcceptExactRequest = { libraryId?: number; dryRun?: boolean };

export type AcceptExactResponse = { paired: number; skipped: number };

/** An audiobook paired with an ebook, seen from the ebook's record. */
export type ReadAlongPairedAudiobook = { bookId: number; title: string; readAlongFileId: number | null };

export type ReadAlongPairedAudiobooksResponse = { audiobooks: ReadAlongPairedAudiobook[] };
