/**
 * Re-export of the spec/delta parser, which is pure domain and now lives in
 * `packages/core/src/domain/SpecParser`.
 *
 * Kept as a shim so the existing importers under `scripts/` keep one stable
 * import path; new code inside `packages/core` must import the domain module
 * directly, never through here.
 */
export * from "../../packages/core/src/domain/SpecParser";
