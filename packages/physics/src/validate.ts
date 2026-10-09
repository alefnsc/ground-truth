/**
 * Argument checks shared by the modules. Internal: not re-exported from index.ts.
 * Every failure is a RangeError whose message names the offending argument.
 */

export function requireFinite(name: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be a finite number, got ${value}`);
  }
}

export function requireNonNegative(name: string, value: number): void {
  requireFinite(name, value);
  if (value < 0) {
    throw new RangeError(`${name} must be >= 0, got ${value}`);
  }
}
