-- Legacy task_type values that still exist in production data (and in
-- src/lib/tasks.types.ts LegacyTaskType) but were never added by a migration.
ALTER TYPE task_type ADD VALUE IF NOT EXISTS 'matching_pairs';
ALTER TYPE task_type ADD VALUE IF NOT EXISTS 'sorting_order';
