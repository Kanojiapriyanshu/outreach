-- What Google actually consented to, so the app can state whether two-way inbox sync is available
-- instead of failing silently on accounts connected before gmail.modify was requested.
ALTER TABLE "EmailAccount" ADD COLUMN "grantedScopes" TEXT;
