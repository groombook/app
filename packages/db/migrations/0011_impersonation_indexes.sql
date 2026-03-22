-- Add indexes on impersonation tables to prevent full table scans
-- Ref: GitHub #95

CREATE INDEX "impersonation_sessions_staff_id_status_idx" ON "impersonation_sessions" USING btree ("staff_id","status");--> statement-breakpoint
CREATE INDEX "impersonation_sessions_client_id_idx" ON "impersonation_sessions" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "impersonation_audit_logs_session_id_idx" ON "impersonation_audit_logs" USING btree ("session_id");
