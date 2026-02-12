import { expect, test } from "@playwright/test";

async function loginAsGuest(page: import("@playwright/test").Page) {
	await page.goto("/");
	await page.getByRole("button", { name: "Try demo" }).click();
	await page.waitForURL("**/boards");
	await expect(
		page.getByRole("heading", { name: "Your boards" }),
	).toBeVisible();
}

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
	if (boardId) await owner.request.delete(`/api/boards/${boardId}`);

	await ownerContext.close();
	await guestContext.close();
	await viewerContext.close();
});
