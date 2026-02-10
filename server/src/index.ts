import { existsSync } from "node:fs";
import { join } from "node:path";
import { Hocuspocus, type WebSocketLike } from "@hocuspocus/server";
import { serve, upgradeWebSocket } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { and, desc, eq, gt, or } from "drizzle-orm";
import { Hono } from "hono";
import { WebSocketServer } from "ws";
import { applyUpdate, encodeStateAsUpdate } from "yjs";
import { auth } from "./auth.ts";
import { db } from "./db/index.ts";
import { boardInvites, boardMembers, boards, user } from "./db/schema.ts";

export const app = new Hono();
const apiRequests = new Map<string, { count: number; resetAt: number }>();
app.use("/api/*", async (c, next) => {
	const contentLength = Number(c.req.header("content-length") ?? 0);
	if (contentLength > 1024 * 1024)
		return c.json({ error: "Request too large" }, 413);
	const key = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
	const now = Date.now();
	const current = apiRequests.get(key);
	if (apiRequests.size > 1000) {
		for (const [address, window] of apiRequests) {
			if (window.resetAt <= now) apiRequests.delete(address);
		}
	}
	if (!current || current.resetAt <= now)
		apiRequests.set(key, { count: 1, resetAt: now + 60_000 });
	else if (current.count >= 120)
		return c.json({ error: "Rate limit exceeded" }, 429);
	else current.count += 1;
	await next();
});
const hocuspocus = new Hocuspocus<{ userId: string; userName: string }>({
	name: "realtime-board",
	quiet: true,
	async onAuthenticate({ documentName, requestHeaders, connectionConfig }) {
		const session = await auth.api.getSession({ headers: requestHeaders });
		if (!session) throw new Error("Unauthorized");
		const [board] = await db
			.select({ id: boards.id, ownerId: boards.ownerId })
			.from(boards)
			.where(eq(boards.id, documentName))
			.limit(1);
		if (!board) throw new Error("Board not found");
		const [member] = await db
			.select({ role: boardMembers.role })
			.from(boardMembers)
			.where(
				and(
					eq(boardMembers.boardId, board.id),
					eq(boardMembers.userId, session.user.id),
				),
			)
			.limit(1);
		const role =
			board.ownerId === session.user.id
				? "owner"
				: board.id === "demo" && session.user.isAnonymous
					? "editor"
					: member?.role;
		if (!role) throw new Error("Forbidden");
		connectionConfig.readOnly = role === "viewer";
		return { userId: session.user.id, userName: session.user.name };
	},
	async onLoadDocument({ documentName, document }) {
		const [board] = await db
			.select({ content: boards.content })
			.from(boards)
			.where(eq(boards.id, documentName))
			.limit(1);
		if (board?.content) {
			applyUpdate(document, board.content);
		}
		return document;
	},
	async onStoreDocument({ documentName, document }) {
		await db
			.update(boards)
			.set({
				content: Buffer.from(encodeStateAsUpdate(document)),
				updatedAt: new Date(),
			})
			.where(eq(boards.id, documentName));
	},
});

async function ensureDemoBoard() {
	const now = new Date();
	await db
		.insert(user)
		.values({
			id: "demo-board-owner",
			name: "Demo team",
			email: "demo@realtime-board.local",
			emailVerified: true,
			isAnonymous: false,
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoNothing();
	await db
		.insert(boards)
		.values({
			id: "demo",
			name: "Demo workspace",
			ownerId: "demo-board-owner",
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoNothing();
}

const demoResetTimer = setInterval(
	async () => {
		const document = hocuspocus.documents.get("demo");
		if (document?.getConnectionsCount()) return;
		if (document) await hocuspocus.unloadDocument(document);
		await db
			.update(boards)
			.set({ content: null, updatedAt: new Date() })
			.where(eq(boards.id, "demo"));
	},
	24 * 60 * 60 * 1000,
);
demoResetTimer.unref();

app.get("/api/health", (c) => c.json({ ok: true }));
app.all("/api/auth/*", (c) => auth.handler(c.req.raw));
export function registerTestLoginRoute(target: Hono, enabled: boolean) {
	if (enabled) {
		target.post("/api/test/login", (c) =>
			auth.handler(
				new Request(
					new URL("/api/auth/sign-in/anonymous", c.req.url),
					c.req.raw,
				),
			),
		);
	}
}
registerTestLoginRoute(app, process.env.NODE_ENV === "test");
app.get("/api/boards", async (c) => {
	const session = await auth.api.getSession({ headers: c.req.raw.headers });
	if (!session) return c.json({ error: "Unauthorized" }, 401);
	if (session.user.isAnonymous) await ensureDemoBoard();
	const rows = await db
		.select({
			id: boards.id,
			name: boards.name,
			ownerId: boards.ownerId,
			createdAt: boards.createdAt,
			updatedAt: boards.updatedAt,
		})
		.from(boards)
		.leftJoin(boardMembers, eq(boardMembers.boardId, boards.id))
		.where(
			session.user.isAnonymous
				? or(
						eq(boards.ownerId, session.user.id),
						eq(boardMembers.userId, session.user.id),
						eq(boards.id, "demo"),
					)
				: or(
						eq(boards.ownerId, session.user.id),
						eq(boardMembers.userId, session.user.id),
					),
		)
		.orderBy(desc(boards.updatedAt));
	return c.json({ boards: rows });
});
app.post("/api/boards", async (c) => {
	const session = await auth.api.getSession({ headers: c.req.raw.headers });
	if (!session) return c.json({ error: "Unauthorized" }, 401);
	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		return c.json({ error: "Invalid JSON body" }, 400);
	}
	if (
		typeof body !== "object" ||
		body === null ||
		!("name" in body) ||
		typeof body.name !== "string" ||
		body.name.trim().length < 1 ||
		body.name.trim().length > 80
	) {
		return c.json({ error: "Name must be between 1 and 80 characters" }, 400);
	}
	const now = new Date();
	const [board] = await db
		.insert(boards)
		.values({
			id: crypto.randomUUID(),
			name: body.name.trim(),
			ownerId: session.user.id,
			createdAt: now,
			updatedAt: now,
		})
		.returning();
	return c.json({ board }, 201);
});
app.get("/api/boards/:id", async (c) => {
	const session = await auth.api.getSession({ headers: c.req.raw.headers });
	if (!session) return c.json({ error: "Unauthorized" }, 401);
	const [board] = await db
		.select()
		.from(boards)
		.where(eq(boards.id, c.req.param("id")))
		.limit(1);
	if (!board) return c.json({ error: "Board not found" }, 404);
	const [member] = await db
		.select({ role: boardMembers.role })
		.from(boardMembers)
		.where(
			and(
				eq(boardMembers.boardId, board.id),
				eq(boardMembers.userId, session.user.id),
			),
		)
		.limit(1);
	if (session.user.isAnonymous && board.id === "demo") await ensureDemoBoard();
	const role =
		board.ownerId === session.user.id
			? "owner"
			: board.id === "demo" && session.user.isAnonymous
				? "editor"
				: member?.role;
	if (!role) return c.json({ error: "Board not found" }, 404);
	return c.json({ board: { ...board, role } });
});
app.patch("/api/boards/:id", async (c) => {
	const session = await auth.api.getSession({ headers: c.req.raw.headers });
	if (!session) return c.json({ error: "Unauthorized" }, 401);
	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		return c.json({ error: "Invalid JSON body" }, 400);
	}
	if (
		typeof body !== "object" ||
		body === null ||
		!("name" in body) ||
		typeof body.name !== "string" ||
		body.name.trim().length < 1 ||
		body.name.trim().length > 80
	) {
		return c.json({ error: "Name must be between 1 and 80 characters" }, 400);
	}
	const [board] = await db
		.update(boards)
		.set({ name: body.name.trim(), updatedAt: new Date() })
		.where(
			and(
				eq(boards.id, c.req.param("id")),
				eq(boards.ownerId, session.user.id),
			),
		)
		.returning();
	if (!board) return c.json({ error: "Board not found" }, 404);
	return c.json({ board });
});
app.delete("/api/boards/:id", async (c) => {
	const session = await auth.api.getSession({ headers: c.req.raw.headers });
	if (!session) return c.json({ error: "Unauthorized" }, 401);
	const [board] = await db
		.delete(boards)
		.where(
			and(
				eq(boards.id, c.req.param("id")),
				eq(boards.ownerId, session.user.id),
			),
		)
		.returning({ id: boards.id });
	if (!board) return c.json({ error: "Board not found" }, 404);
	return c.json({ ok: true });
});
app.get("/api/boards/:id/members", async (c) => {
	const session = await auth.api.getSession({ headers: c.req.raw.headers });
	if (!session) return c.json({ error: "Unauthorized" }, 401);
	const members = await db
		.select({
			id: boardMembers.userId,
			name: user.name,
			email: user.email,
			role: boardMembers.role,
		})
		.from(boardMembers)
		.innerJoin(user, eq(boardMembers.userId, user.id))
		.where(eq(boardMembers.boardId, c.req.param("id")));
	const [board] = await db
		.select({ id: boards.id, ownerId: boards.ownerId })
		.from(boards)
		.where(eq(boards.id, c.req.param("id")))
		.limit(1);
	if (!board) return c.json({ error: "Board not found" }, 404);
	if (
		board.ownerId !== session.user.id &&
		!members.some((member) => member.id === session.user.id) &&
		!(board.id === "demo" && session.user.isAnonymous)
	)
		return c.json({ error: "Forbidden" }, 403);
	return c.json({
		members: [
			{ id: board.ownerId, name: "Owner", email: "", role: "owner" },
			...members,
		],
	});
});
app.post("/api/boards/:id/invites", async (c) => {
	const session = await auth.api.getSession({ headers: c.req.raw.headers });
	if (!session) return c.json({ error: "Unauthorized" }, 401);
	const [board] = await db
		.select({ id: boards.id, ownerId: boards.ownerId })
		.from(boards)
		.where(eq(boards.id, c.req.param("id")))
		.limit(1);
	if (!board) return c.json({ error: "Board not found" }, 404);
	if (board.ownerId !== session.user.id)
		return c.json({ error: "Forbidden" }, 403);
	let body: unknown = {};
	try {
		body = await c.req.json();
	} catch {
		body = {};
	}
	const role =
		typeof body === "object" &&
		body !== null &&
		"role" in body &&
		body.role === "editor"
			? "editor"
			: "viewer";
	const token = crypto.randomUUID();
	const now = new Date();
	await db.insert(boardInvites).values({
		token,
		boardId: board.id,
		role,
		createdAt: now,
		expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
	});
	return c.json(
		{
			inviteUrl: `${new URL(c.req.url).origin}/invite/${token}`,
			expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
		},
		201,
	);
});
app.post("/api/invites/:token/accept", async (c) => {
	const session = await auth.api.getSession({ headers: c.req.raw.headers });
	if (!session) return c.json({ error: "Unauthorized" }, 401);
	const [invite] = await db
		.select()
		.from(boardInvites)
		.where(
			and(
				eq(boardInvites.token, c.req.param("token")),
				gt(boardInvites.expiresAt, new Date()),
			),
		)
		.limit(1);
	if (!invite) return c.json({ error: "Invite not found or expired" }, 404);
	await db
		.insert(boardMembers)
		.values({
			id: crypto.randomUUID(),
			boardId: invite.boardId,
			userId: session.user.id,
			role: invite.role,
			createdAt: new Date(),
		})
		.onConflictDoNothing();
	return c.json({ boardId: invite.boardId, role: invite.role });
});
app.get(
	"/sync/:boardId",
	upgradeWebSocket((c) => {
		let clientConnection:
			| ReturnType<typeof hocuspocus.handleConnection>
			| undefined;
		return {
			onOpen(_event, ws) {
				clientConnection = hocuspocus.handleConnection(
					ws.raw as WebSocketLike,
					c.req.raw,
				);
			},
			onMessage(event) {
				if (event.data instanceof ArrayBuffer) {
					clientConnection?.handleMessage(new Uint8Array(event.data));
				}
			},
			onClose(event) {
				clientConnection?.handleClose({
					code: event.code,
					reason: event.reason,
				});
			},
		};
	}),
);
app.all("/api/*", (c) => c.notFound());

const dist = join(import.meta.dirname, "../../web/dist");

if (existsSync(dist)) {
	app.use("*", serveStatic({ root: dist }));
	app.get("*", serveStatic({ root: dist, path: "index.html" }));
}

const port = Number(process.env.PORT ?? 3000);

if (process.env.VITEST !== "true") {
	serve(
		{
			fetch: app.fetch,
			port,
			websocket: {
				server: new WebSocketServer({
					noServer: true,
					maxPayload: 1024 * 1024,
				}),
			},
		},
		(info) => {
			console.log(`Listening on http://localhost:${info.port}`);
		},
	);
}
