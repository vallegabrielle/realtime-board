import { expect, test } from "@playwright/test";

async function loginAsGuest(page: import("@playwright/test").Page) {
	await page.goto("/");
	await page.getByRole("button", { name: "Try demo" }).click();
	await page.waitForURL("**/boards");
	await expect(
		page.getByRole("heading", { name: "Your boards" }),
	).toBeVisible();
}

test("mobile navigation and keyboard dialogs remain usable", async ({
	browser,
}) => {
	const context = await browser.newContext({
		viewport: { width: 375, height: 812 },
	});
	const page = await context.newPage();
	await loginAsGuest(page);
	await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
	await page.getByRole("button", { name: "Create board", exact: true }).click();
	const dialog = page.getByRole("dialog", { name: "Create a board" });
	await expect(dialog).toBeVisible();
	await expect(page.getByLabel("Board name")).toBeFocused();
	await page.keyboard.press("Escape");
	await expect(dialog).not.toBeVisible();
	await page.getByRole("button", { name: "Demo workspace" }).first().click();
	await expect(
		page.getByRole("heading", { name: "Demo workspace" }),
	).toBeVisible();
	await expect(
		page.getByRole("status", { name: "Connection status" }),
	).toBeVisible();
	const horizontalOverflow = await page.evaluate(
		() => document.documentElement.scrollWidth > window.innerWidth,
	);
	expect(horizontalOverflow).toBe(false);
	await context.close();
});

test("two guests see board edits and presence live", async ({ browser }) => {
	const ownerContext = await browser.newContext();
	const owner = await ownerContext.newPage();
	await loginAsGuest(owner);
	await owner.getByRole("button", { name: "Create board" }).click();
	await owner.getByLabel("Board name").fill("Live collaboration");
	await owner
		.getByRole("dialog")
		.getByRole("button", { name: "Create board" })
		.click();
	await owner.getByRole("heading", { name: "Live collaboration" }).waitFor();
	const boardId = owner.url().split("/").at(-1);

	await owner.getByRole("button", { name: "Share" }).click();
	await owner.getByLabel("Invite role").selectOption("editor");
	const shareResponse = owner.waitForResponse(
		(response) =>
			response.url().includes("/invites") && response.status() === 201,
	);
	await owner.getByRole("button", { name: "Create link" }).click();
	await shareResponse;
	const inviteUrl = await owner.locator("input[readonly]").inputValue();

	const guestContext = await browser.newContext();
	const guest = await guestContext.newPage();
	await loginAsGuest(guest);
	await guest.goto(inviteUrl);
	await expect(
		guest.getByRole("heading", { name: "Live collaboration" }),
	).toBeVisible();
	await expect(
		owner.getByRole("list", { name: "Online users" }).getByRole("listitem"),
	).toHaveCount(2);

	await owner
		.getByRole("button", { name: "Add card to To Do", exact: true })
		.click();
	await owner.getByLabel("Card title").fill("First synced card");
	await owner
		.getByRole("dialog")
		.getByRole("button", { name: "Add card" })
		.click();
	await expect(guest.getByText("First synced card")).toBeVisible();
	await owner.waitForTimeout(600);
	await owner.mouse.move(800, 400);
	await expect(guest.locator("div.fixed.z-50")).toBeVisible();
	const doneColumn = owner
		.locator("section.w-80")
		.filter({ has: owner.getByRole("heading", { name: "Done" }) });
	await owner.getByRole("button", { name: /^Drag RB-/ }).dragTo(doneColumn);
	await expect(doneColumn.getByText("First synced card").first()).toBeVisible();
	await owner.getByRole("button", { name: "Undo" }).click();
	await expect(
		owner
			.locator("section.w-80")
			.filter({ has: owner.getByRole("heading", { name: "To Do" }) })
			.getByText("First synced card")
			.first(),
	).toBeVisible();
	await owner.getByRole("button", { name: "Redo" }).click();
	await expect(doneColumn.getByText("First synced card").first()).toBeVisible();
	await guest
		.locator("article summary[aria-label^='Options for RB-']")
		.first()
		.click();
	await guest.getByRole("button", { name: "Edit title" }).click();
	await guest.getByLabel("Card title").fill("Edited by guest");
	await guest
		.getByRole("dialog")
		.getByRole("button", { name: "Save changes" })
		.click();
	await expect(owner.getByText("Edited by guest")).toBeVisible();
	await owner
		.getByRole("button", { name: "Add card to To Do", exact: true })
		.click();
	await owner.getByLabel("Card title").fill("Concurrent card");
	await owner
		.getByRole("dialog")
		.getByRole("button", { name: "Add card" })
		.click();
	await expect(guest.getByText("Concurrent card")).toBeVisible();
	const inProgressColumn = owner
		.locator("section.w-80")
		.filter({ has: owner.getByRole("heading", { name: "In Progress" }) });
	const guestDoneColumn = guest
		.locator("section.w-80")
		.filter({ has: guest.getByRole("heading", { name: "Done" }) });
	await Promise.all([
		owner
			.locator("article")
			.filter({ hasText: "Edited by guest" })
			.getByRole("button", { name: /^Drag RB-/ })
			.dragTo(inProgressColumn),
		guest
			.locator("article")
			.filter({ hasText: "Concurrent card" })
			.getByRole("button", { name: /^Drag RB-/ })
			.dragTo(guestDoneColumn),
	]);
	await expect(
		inProgressColumn.getByText("Edited by guest").first(),
	).toBeVisible();
	await expect(
		guestDoneColumn.getByText("Concurrent card").first(),
	).toBeVisible();
	await ownerContext.setOffline(true);
	await expect(
		owner.getByRole("status", { name: "Connection status" }),
	).toHaveText("Offline");
	await owner
		.getByRole("button", { name: "Add card to In Progress", exact: true })
		.click();
	await owner.getByLabel("Card title").fill("Saved while offline");
	await owner
		.getByRole("dialog")
		.getByRole("button", { name: "Add card" })
		.click();
	await expect(owner.getByText("Saved while offline")).toBeVisible();
	await ownerContext.setOffline(false);
	await expect(guest.getByText("Saved while offline")).toBeVisible();
	await expect(
		owner.getByRole("status", { name: "Connection status" }),
	).toHaveText("Connected");

	await owner.getByLabel("Invite role").selectOption("viewer");
	const viewerInviteResponse = owner.waitForResponse(
		(response) =>
			response.url().includes("/invites") && response.status() === 201,
	);
	await owner.getByRole("button", { name: "Create link" }).click();
	await viewerInviteResponse;
	const viewerInvite = await owner.locator("input[readonly]").inputValue();
	const viewerContext = await browser.newContext();
	const viewer = await viewerContext.newPage();
	await loginAsGuest(viewer);
	await viewer.goto(viewerInvite);
	await expect(
		viewer.getByRole("heading", { name: "Live collaboration" }),
	).toBeVisible();
	await expect(
		viewer.getByRole("button", { name: "Add card to To Do", exact: true }),
	).toBeDisabled();
	await viewer.goto(`http://localhost:5173/boards/${boardId}`);
	await expect(
		viewer.getByRole("heading", { name: "Live collaboration" }),
	).toBeVisible();
	await viewer.evaluate(async (id) => {
		const yjsPath = "/node_modules/.vite/deps/yjs.js";
		const providerPath = "/node_modules/.vite/deps/@hocuspocus_provider.js";
		const modelPath = "/src/board-model.ts";
		const Y = await import(yjsPath);
		const { HocuspocusProvider } = await import(providerPath);
		const { createCard, readColumns } = await import(modelPath);
		const document = new Y.Doc();
		const provider = new HocuspocusProvider({
			url: `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/sync/${id}`,
			name: id,
			document,
		});
		await new Promise<void>((resolve, reject) => {
			const timer = setTimeout(
				() => reject(new Error("Viewer sync timed out")),
				10000,
			);
			provider.on("synced", () => {
				clearTimeout(timer);
				resolve();
			});
		});
		const column = readColumns(document)[0];
		if (!column) throw new Error("Board has no columns");
		createCard(document, "Unauthorized viewer edit", column.id);
		await new Promise((resolve) => setTimeout(resolve, 500));
		provider.destroy();
		document.destroy();
	}, boardId);
	await expect(owner.getByText("Unauthorized viewer edit")).toHaveCount(0);
	await viewer.reload();
	await expect(
		viewer.getByRole("heading", { name: "Live collaboration" }),
	).toBeVisible();
	await expect(viewer.getByText("Edited by guest")).toBeVisible();
	await expect(viewer.getByText("Unauthorized viewer edit")).toHaveCount(0);
	const viewerDelete = await viewer.request.delete(`/api/boards/${boardId}`);
	expect(viewerDelete.status()).toBe(404);
	const viewerInviteAttempt = await viewer.request.post(
		`/api/boards/${boardId}/invites`,
		{
			data: { role: "editor" },
		},
	);
	expect(viewerInviteAttempt.status()).toBe(403);
	if (boardId) await owner.request.delete(`/api/boards/${boardId}`);

	await ownerContext.close();
	await guestContext.close();
	await viewerContext.close();
});
