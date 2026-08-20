/**
 * Re-export of the change-lifecycle workspace layout, which is infrastructure
 * and now lives in `packages/core/src/infrastructure/ChangeWorkspace`.
 *
 * Kept as a shim so the existing importers under `scripts/` keep one stable
 * import path.
 */
export * from "../../packages/core/src/infrastructure/ChangeWorkspace";
