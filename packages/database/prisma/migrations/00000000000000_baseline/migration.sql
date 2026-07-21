-- Baseline migration.
--
-- The foundation slice ships no product models. This migration exists so the migration
-- pipeline is exercised end to end (applied, and recorded in _prisma_migrations) before
-- any real schema depends on it. Product models arrive with their feature slices.
SELECT 1;
