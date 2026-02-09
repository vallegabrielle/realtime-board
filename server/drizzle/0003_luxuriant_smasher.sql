CREATE TABLE "board_invites" (
	"token" text PRIMARY KEY NOT NULL,
	"board_id" text NOT NULL,
	"role" text DEFAULT 'viewer' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "board_members" (
	"id" text PRIMARY KEY NOT NULL,
	"board_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'viewer' NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "board_invites" ADD CONSTRAINT "board_invites_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_members" ADD CONSTRAINT "board_members_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_members" ADD CONSTRAINT "board_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "board_invites_board_id_idx" ON "board_invites" USING btree ("board_id");--> statement-breakpoint
CREATE INDEX "board_members_board_id_idx" ON "board_members" USING btree ("board_id");--> statement-breakpoint
CREATE INDEX "board_members_user_id_idx" ON "board_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "board_members_board_user_idx" ON "board_members" USING btree ("board_id","user_id");