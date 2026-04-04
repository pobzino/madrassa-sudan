DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumtypid = 'task_type'::regtype
      AND enumlabel = 'free_response'
  ) THEN
    ALTER TYPE task_type ADD VALUE 'free_response';
  END IF;
END $$;
