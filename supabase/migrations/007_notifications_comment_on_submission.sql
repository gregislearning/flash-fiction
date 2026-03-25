-- Notifications: comment on your submission
-- - In-app notifications stored in `public.notifications`
-- - Unread notifications are deduped: at most one unread notification per (user_id, submission_id)
-- - When a new comment arrives, the unread notification (if any) is replaced/updated

-- Notifications table
CREATE TABLE notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  comment_id UUID NOT NULL REFERENCES submission_comments(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  comment_preview TEXT NOT NULL,
  unread BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  read_at TIMESTAMPTZ
);

-- Common query patterns
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_user_unread_created_at ON notifications(user_id, unread, created_at DESC);
CREATE INDEX idx_notifications_submission_id ON notifications(submission_id);

-- RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Users can view their notifications
CREATE POLICY "Users can view notifications"
  ON notifications FOR SELECT
  USING (user_id = auth.uid());

-- Users can mark notifications as read
CREATE POLICY "Users can mark notifications as read"
  ON notifications FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND unread = false);

-- Allow insert of notifications when the authenticated user owns the source comment,
-- and the notification user_id matches the author of that submission.
CREATE POLICY "Insert notification from your comment"
  ON notifications FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL AND
    user_id = (SELECT s.user_id FROM submissions s WHERE s.id = submission_id) AND
    EXISTS (
      SELECT 1 FROM submission_comments sc
      WHERE sc.id = comment_id AND sc.user_id = auth.uid()
    )
  );

-- Allow replacing the unread notification while it is still unread,
-- again based on the authenticated user's authored comment on that submission.
CREATE POLICY "Replace unread notification from your comment"
  ON notifications FOR UPDATE
  USING (
    auth.uid() IS NOT NULL AND
    unread = true AND
    user_id = (SELECT s.user_id FROM submissions s WHERE s.id = submission_id) AND
    EXISTS (
      SELECT 1 FROM submission_comments sc
      WHERE sc.submission_id = notifications.submission_id AND sc.user_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() IS NOT NULL AND
    unread = true AND
    user_id = (SELECT s.user_id FROM submissions s WHERE s.id = submission_id) AND
    EXISTS (
      SELECT 1 FROM submission_comments sc
      WHERE sc.id = comment_id AND sc.user_id = auth.uid()
    )
  );

-- Enforce: only one unread notification per submission per user.
CREATE UNIQUE INDEX idx_notifications_unread_unique
  ON notifications(user_id, submission_id)
  WHERE unread = true;

-- Trigger function: on comment insert, notify submission author
CREATE OR REPLACE FUNCTION public.notify_submission_comment_received()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  submission_owner UUID;
  preview TEXT;
  notification_message TEXT;
BEGIN
  -- Find the submission author (the notification recipient)
  SELECT s.user_id INTO submission_owner
  FROM submissions s
  WHERE s.id = NEW.submission_id;

  IF submission_owner IS NULL THEN
    RETURN NEW;
  END IF;

  -- Do not notify the commenter about their own comment
  IF submission_owner = NEW.user_id THEN
    RETURN NEW;
  END IF;

  preview := LEFT(NEW.content, 200);
  notification_message := 'New comment on your submission';

  -- Replace unread notification (if present)
  UPDATE notifications n
  SET
    comment_id = NEW.id,
    comment_preview = preview,
    message = notification_message,
    unread = true,
    created_at = NOW(),
    read_at = NULL
  WHERE n.user_id = submission_owner
    AND n.submission_id = NEW.submission_id
    AND n.unread = true;

  IF FOUND THEN
    RETURN NEW;
  END IF;

  -- If there is no unread notification yet, insert one.
  -- Under concurrent inserts, unique index may raise; recover by updating.
  BEGIN
    INSERT INTO notifications (
      user_id,
      submission_id,
      comment_id,
      message,
      comment_preview,
      unread,
      created_at,
      read_at
    ) VALUES (
      submission_owner,
      NEW.submission_id,
      NEW.id,
      notification_message,
      preview,
      true,
      NOW(),
      NULL
    );
  EXCEPTION
    WHEN unique_violation THEN
      UPDATE notifications n
      SET
        comment_id = NEW.id,
        comment_preview = preview,
        message = notification_message,
        unread = true,
        created_at = NOW(),
        read_at = NULL
      WHERE n.user_id = submission_owner
        AND n.submission_id = NEW.submission_id
        AND n.unread = true;
  END;

  RETURN NEW;
END;
$$;

-- Trigger wiring
DROP TRIGGER IF EXISTS trg_notify_submission_comment_received ON submission_comments;
CREATE TRIGGER trg_notify_submission_comment_received
AFTER INSERT ON submission_comments
FOR EACH ROW
EXECUTE FUNCTION public.notify_submission_comment_received();

