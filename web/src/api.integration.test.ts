import { Hono } from "hono";
import { afterAll, describe, expect, it } from "vitest";
import { app, registerTestLoginRoute } from "../../server/src/index.ts";

describe("board API", () => {
	let sessionCookie = "";
	let boardId = "";

	afterAll(async () => {
		if (boardId && sessionCookie) {
			await app.request(`/api/boards/${boardId}`, {
				method: "DELETE",
				headers: { cookie: sessionCookie },
			});
		}
	});

	it("requires a session for protected board routes", async () => {
		const response = await app.request("/api/boards");
		expect(response.status).toBe(401);
	});

	it("does not register test login outside test mode", async () => {
		const productionApp = new Hono();
		registerTestLoginRoute(productionApp, false);
		const response = await productionApp.request("/api/test/login", {
			method: "POST",
		});
		expect(response.status).toBe(404);
	});

	it("supports a guest session and board CRUD", async () => {
		const signIn = await app.request("/api/test/login", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: "{}",
		});
		expect(signIn.status).toBe(200);
		sessionCookie = signIn.headers.get("set-cookie") ?? "";
		expect(sessionCookie).toContain("better-auth.session_token");

		const create = await app.request("/api/boards", {
			method: "POST",
			headers: { cookie: sessionCookie, "content-type": "application/json" },
			body: JSON.stringify({ name: "Integration board" }),
		});
		expect(create.status).toBe(201);
		const created = (await create.json()) as {
			board: { id: string; name: string };
		};
		boardId = created.board.id;
		expect(created.board.name).toBe("Integration board");

		const list = await app.request("/api/boards", {
			headers: { cookie: sessionCookie },
		});
		expect(list.status).toBe(200);
		const listed = (await list.json()) as { boards: Array<{ id: string }> };
		expect(listed.boards.some((board) => board.id === boardId)).toBe(true);

		const invalid = await app.request(`/api/boards/${boardId}`, {
			method: "PATCH",
			headers: { cookie: sessionCookie, "content-type": "application/json" },
			body: JSON.stringify({ name: "" }),
		});
		expect(invalid.status).toBe(400);
	});
});
