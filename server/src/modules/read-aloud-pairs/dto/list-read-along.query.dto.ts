import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import type { ReadAlongMatchTier, ReadAlongPairStatus } from '@bookorbit/types';

export const READ_ALONG_PAIR_STATUSES = [
  'paired',
  'needs_attention',
  'suggested',
  'ambiguous',
  'flagged',
  'none',
] as const satisfies readonly ReadAlongPairStatus[];
export const READ_ALONG_MATCH_TIERS = ['exact', 'likely', 'maybe'] as const satisfies readonly ReadAlongMatchTier[];

export class ListReadAlongQueryDto {
  @IsOptional()
  @IsIn(READ_ALONG_PAIR_STATUSES)
  status?: ReadAlongPairStatus;

  @IsOptional()
  @IsIn(READ_ALONG_MATCH_TIERS)
  tier?: ReadAlongMatchTier;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  libraryId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize = 50;
}

export class ReadAlongCandidatesQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  showDismissed?: boolean;
}
