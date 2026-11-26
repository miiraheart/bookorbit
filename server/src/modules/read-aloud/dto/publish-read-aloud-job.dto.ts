import { IsBoolean, IsOptional } from 'class-validator';
import type { PublishReadAloudJobRequest } from '@bookorbit/types';

export class PublishReadAloudJobDto implements PublishReadAloudJobRequest {
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}
