/*
  # Allow admins to delete quote requests

  1. Security
    - Adds a DELETE policy on `quote_requests` for users present in the
      `admins` table, so the admin dashboard "Supprimer" button works.
    - Does not affect existing SELECT/INSERT/UPDATE policies or the
      existing "Clients can delete their own non-accepted quote requests"
      policy.
*/

DROP POLICY IF EXISTS "Admins can delete quote requests" ON quote_requests;

CREATE POLICY "Admins can delete quote requests"
  ON quote_requests
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admins WHERE admins.user_id = auth.uid()
    )
  );
