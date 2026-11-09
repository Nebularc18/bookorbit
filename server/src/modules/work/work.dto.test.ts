import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { EditionSearchQueryDto, GroupWorkDto, WorkCatalogQueryDto } from './dto/work.dto';

describe('WorkCatalogQueryDto', () => {
  it('enables automatic grouping by default and supports an explicit opt-out', async () => {
    const defaults = plainToInstance(WorkCatalogQueryDto, { libraryId: '7' });
    const disabled = plainToInstance(WorkCatalogQueryDto, { libraryId: '7', autoGroup: 'false' });
    expect(defaults.autoGroup).toBe(true);
    expect(disabled.autoGroup).toBe(false);
    expect(await validate(disabled)).toEqual([]);
  });

  it('accepts automatic group cursors and rejects invalid query input', async () => {
    expect(await validate(plainToInstance(WorkCatalogQueryDto, { libraryId: '7', after: `a:${'a'.repeat(32)}` }))).toEqual([]);
    for (const input of [{ autoGroup: 'maybe' }, { after: 'a:invalid' }, { limit: '100000' }, { search: 'a'.repeat(201) }]) {
      expect(await validate(plainToInstance(WorkCatalogQueryDto, { libraryId: '7', ...input }))).not.toEqual([]);
    }
  });
});

describe('edition linking DTOs', () => {
  it('accepts title searches and keyset cursors, rejecting invalid bounds and extra fields', async () => {
    expect(await validate(plainToInstance(EditionSearchQueryDto, { search: 'Dollar', after: '23' }))).toEqual([]);
    for (const input of [{ search: 'a' }, { search: 'a'.repeat(201) }, { search: 'ab', after: '-1' }, { search: 'ab', extra: true }]) {
      expect(await validate(plainToInstance(EditionSearchQueryDto, input), { whitelist: true, forbidNonWhitelisted: true })).not.toEqual([]);
    }
  });
  it('requires distinct positive edition IDs and a bounded group', async () => {
    for (const bookIds of [[1], [1, 1], [1, 0], Array.from({ length: 101 }, (_, i) => i + 1)]) {
      expect(await validate(plainToInstance(GroupWorkDto, { title: 'Sample', bookIds }))).not.toEqual([]);
    }
  });
});
