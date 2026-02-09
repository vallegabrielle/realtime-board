import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { anonymous } from "better-auth/plugins";
import { db } from "./db/index.ts";
import * as schema from "./db/schema.ts";

export const auth = betterAuth({
	database: drizzleAdapter(db, { provider: "pg", schema }),
	secret:
		process.env.BETTER_AUTH_SECRET ??
		"development-secret-change-me-before-production",
	baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
	trustedOrigins:
		process.env.NODE_ENV === "production"
			? []
			: ["http://localhost:5173", "http://127.0.0.1:5173"],
	socialProviders: {
		github: {
			clientId: process.env.GITHUB_CLIENT_ID ?? "",
			clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
		},
	},
	plugins: [anonymous()],
});
