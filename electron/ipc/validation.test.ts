import { describe, expect, it } from 'vitest';
import {
  isRecord,
  optionalNullableNumber,
  optionalNullableString,
  optionalSortDirection,
  optionalSortField,
  optionalString,
  requireBoolean,
  requireNumber,
  requireString,
} from './validation';

describe('isRecord', () => {
  it('accepts plain objects', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ a: 1 })).toBe(true);
  });

  it('rejects null, arrays are still objects but every non-object primitive is not', () => {
    expect(isRecord(null)).toBe(false);
    expect(isRecord(undefined)).toBe(false);
    expect(isRecord('object')).toBe(false);
    expect(isRecord(42)).toBe(false);
    expect(isRecord([1, 2, 3])).toBe(true); // arrays are typeof 'object' — callers must not rely on isRecord alone to exclude arrays
  });
});

describe('optionalNullableString', () => {
  it('distinguishes undefined (not provided) from null (explicitly cleared)', () => {
    expect(optionalNullableString(undefined, 'color')).toBeUndefined();
    expect(optionalNullableString(null, 'color')).toBeNull();
  });

  it('accepts a valid string', () => {
    expect(optionalNullableString('#2563EB', 'color')).toBe('#2563EB');
  });

  it('rejects anything else', () => {
    expect(() => optionalNullableString(42, 'color')).toThrow(/color/);
  });
});

describe('requireNumber', () => {
  it('accepts an integer', () => {
    expect(requireNumber(42, 'id')).toBe(42);
  });

  it('rejects non-integers and non-numbers', () => {
    expect(() => requireNumber(1.5, 'id')).toThrow(/id/);
    expect(() => requireNumber('42', 'id')).toThrow(/id/);
    expect(() => requireNumber(undefined, 'id')).toThrow(/id/);
    expect(() => requireNumber(null, 'id')).toThrow(/id/);
  });
});

describe('requireString', () => {
  it('accepts a string', () => {
    expect(requireString('hello', 'title')).toBe('hello');
  });

  it('rejects non-strings', () => {
    expect(() => requireString(42, 'title')).toThrow(/title/);
    expect(() => requireString(null, 'title')).toThrow(/title/);
    expect(() => requireString(undefined, 'title')).toThrow(/title/);
  });
});

describe('optionalString', () => {
  it('passes undefined through', () => {
    expect(optionalString(undefined, 'title')).toBeUndefined();
  });

  it('rejects a non-string, non-undefined value', () => {
    expect(() => optionalString(42, 'title')).toThrow(/title/);
  });
});

describe('optionalNullableNumber', () => {
  it('distinguishes undefined (not provided) from null (explicitly cleared)', () => {
    expect(optionalNullableNumber(undefined, 'labelId')).toBeUndefined();
    expect(optionalNullableNumber(null, 'labelId')).toBeNull();
  });

  it('accepts a valid integer', () => {
    expect(optionalNullableNumber(7, 'labelId')).toBe(7);
  });

  it('rejects anything else', () => {
    expect(() => optionalNullableNumber('7', 'labelId')).toThrow(/labelId/);
  });
});

describe('requireBoolean', () => {
  it('accepts true/false', () => {
    expect(requireBoolean(true, 'isPinned')).toBe(true);
    expect(requireBoolean(false, 'isPinned')).toBe(false);
  });

  it('rejects truthy/falsy non-booleans', () => {
    expect(() => requireBoolean(1, 'isPinned')).toThrow(/isPinned/);
    expect(() => requireBoolean('true', 'isPinned')).toThrow(/isPinned/);
  });
});

describe('optionalSortField', () => {
  it('accepts each valid sort field', () => {
    expect(optionalSortField('created_at')).toBe('created_at');
    expect(optionalSortField('updated_at')).toBe('updated_at');
    expect(optionalSortField('title')).toBe('title');
    expect(optionalSortField('label')).toBe('label');
  });

  it('passes undefined through', () => {
    expect(optionalSortField(undefined)).toBeUndefined();
  });

  it('rejects an unrecognized value instead of letting it reach SQL', () => {
    expect(() => optionalSortField('id; DROP TABLE notes')).toThrow(/sortBy/);
  });
});

describe('optionalSortDirection', () => {
  it('accepts asc/desc', () => {
    expect(optionalSortDirection('asc')).toBe('asc');
    expect(optionalSortDirection('desc')).toBe('desc');
  });

  it('rejects an unrecognized value', () => {
    expect(() => optionalSortDirection('ASCENDING')).toThrow(/sortDirection/);
  });
});
