import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { AddGoodreadsSourcePayload } from '@bookorbit/types';

export class AddGoodreadsSourceDto implements AddGoodreadsSourcePayload {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  url!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;
}

export class RenameGoodreadsSourceDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;
}
