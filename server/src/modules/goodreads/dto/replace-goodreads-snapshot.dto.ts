import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';

export class GoodreadsShelfItemDto {
  @IsString()
  @MaxLength(64)
  key!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  goodreadsId?: string | null;

  @IsString()
  @MaxLength(500)
  title!: string;

  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(255, { each: true })
  authors!: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(5)
  rating?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  isbn13?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  coverUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  readAt?: string | null;

  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  shelves!: string[];

  @IsArray()
  @ArrayMaxSize(50)
  @IsInt({ each: true })
  @Min(1, { each: true })
  bookIds!: number[];
}

export class ReplaceGoodreadsSnapshotDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  source?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10000)
  @ValidateNested({ each: true })
  @Type(() => GoodreadsShelfItemDto)
  items?: GoodreadsShelfItemDto[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  error?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  sourceName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(12)
  sourceRef?: string | null;
}
