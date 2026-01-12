import { BadRequestException } from '@nestjs/common';
import { ZodType, ZodError } from 'zod';

export interface ValidationError {
  path: string;
  message: string;
}

export interface ParseOptions {
  message?: string;
}

/**
 * Parses input against a Zod schema, throwing BadRequestException on failure.
 * Returns the parsed value on success.
 */
export function parseOrThrow<T>(
  schema: ZodType<T>,
  input: unknown,
  options?: ParseOptions,
): T {
  const result = schema.safeParse(input);

  if (result.success) {
    return result.data;
  }

  const errors = formatZodErrors(result.error);
  throw new BadRequestException({
    message: options?.message ?? 'Invalid request',
    errors,
  });
}

/**
 * Formats Zod errors into a stable, deterministic array of field errors.
 */
function formatZodErrors(error: ZodError): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const issue of error.issues) {
    const path = issue.path.length > 0 ? issue.path.join('.') : issue.code;
    errors.push({
      path,
      message: issue.message,
    });
  }

  // Sort by path for deterministic output
  errors.sort((a, b) => {
    if (a.path !== b.path) {
      return a.path.localeCompare(b.path);
    }
    return a.message.localeCompare(b.message);
  });

  return errors;
}
