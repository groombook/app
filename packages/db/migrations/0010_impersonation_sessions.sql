-- Create impersonation_session_status enum and tables
CREATE TYPE "impersonation_session_status" AS ENUM ('active', 'ended', 'expired');

CREATE TABLE "impersonation_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"reason" text,
	"status" "impersonation_session_status" DEFAULT 'active' NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"ended_at" timestamp,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "impersonation_sessions_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE restrict,
	CONSTRAINT "impersonation_sessions_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE restrict
);

CREATE TABLE "impersonation_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"action" text NOT NULL,
	"page_visited" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "impersonation_audit_logs_session_id_impersonation_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "impersonation_sessions"("id") ON DELETE cascade
);
