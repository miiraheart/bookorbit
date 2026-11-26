import { IsBoolean, IsInt, IsOptional, IsPositive, Matches } from 'class-validator';
import type { AcceptExactRequest, DismissCandidateRequest, PairEbookRequest } from '@bookorbit/types';

export class PairEbookDto implements PairEbookRequest {
  @IsInt()
  @IsPositive()
  ebookBookId!: number;

  @IsInt()
  @IsPositive()
  ebookFileId!: number;

  @IsOptional()
  @IsBoolean()
  dismissPrevious?: boolean;

  @IsOptional()
  @Matches(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/)
  language?: string;
}

export class DismissCandidateDto implements DismissCandidateRequest {
  @IsInt()
  @IsPositive()
  ebookBookId!: number;
}

export class AcceptExactDto implements AcceptExactRequest {
  @IsOptional()
  @IsInt()
  @IsPositive()
  libraryId?: number;

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}
