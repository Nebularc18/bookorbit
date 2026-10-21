import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  Matches,
} from 'class-validator';

export class WorkCatalogQueryDto {
  @Type(() => Number) @IsInt() @Min(1) libraryId!: number;
  @IsOptional() @IsString() @MaxLength(100) language?: string;
  @IsOptional() @IsString() @MaxLength(20) format?: string;
  @IsOptional() @IsString() @MaxLength(32) @Matches(/^[bw]:[1-9][0-9]*$/) after?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(10000) offset = 0;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit = 25;
}
export class GroupWorkDto {
  @IsString() @MinLength(1) @MaxLength(1000) title!: string;
  @IsArray() @ArrayMinSize(2) @ArrayMaxSize(100) @ArrayUnique() @IsInt({ each: true }) @Min(1, { each: true }) bookIds!: number[];
}
