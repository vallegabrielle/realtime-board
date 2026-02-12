import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
	createCard,
	createColumn,
	deleteCard,
	ensureInitialDocument,
	moveCard,
	readCards,
	readColumns,
	updateCard,
} from "./board-model.ts";

describe("board document model", () => {
	it("creates, updates, orders, and deletes board items", () => {
		const document = new Y.Doc();
		ensureInitialDocument(document, "board-1");
		const columns = readColumns(document);
		const card = createCard(
			document,
			"Ship realtime board",
			columns[0]?.id ?? "",
		);

		expect(columns.map((column) => column.name)).toEqual([
			"To Do",
			"In Progress",
			"Done",
		]);
		expect(card.shortCode).toMatch(/^RB-[A-Z0-9]{4}$/);
		updateCard(document, card.id, { progress: 50, dueDate: "2026-12-01" });
		moveCard(document, card.id, columns[1]?.id ?? "", 0);

		expect(readCards(document)).toMatchObject([
			{
				id: card.id,
				columnId: columns[1]?.id,
				progress: 50,
				dueDate: "2026-12-01",
			},
		]);

		deleteCard(document, card.id);
		expect(readCards(document)).toEqual([]);
		document.destroy();
	});

	it("converges concurrent card moves without duplicating cards", () => {
		const source = new Y.Doc();
		ensureInitialDocument(source, "board-2");
		const columns = readColumns(source);
		const card = createCard(source, "A single card", columns[0]?.id ?? "");
		const left = new Y.Doc();
		const right = new Y.Doc();
		Y.applyUpdate(left, Y.encodeStateAsUpdate(source));
		Y.applyUpdate(right, Y.encodeStateAsUpdate(source));

		moveCard(left, card.id, columns[1]?.id ?? "", 0);
		moveCard(right, card.id, columns[2]?.id ?? "", 0);
		const leftUpdate = Y.encodeStateAsUpdate(left);
		const rightUpdate = Y.encodeStateAsUpdate(right);
		Y.applyUpdate(left, rightUpdate);
		Y.applyUpdate(right, leftUpdate);

		expect(readCards(left)).toHaveLength(1);
		expect(readCards(right)).toHaveLength(1);
		expect(readCards(left)).toEqual(readCards(right));
		expect(columns.map((column) => column.id)).toContain(
			readCards(left)[0]?.columnId,
		);
		source.destroy();
		left.destroy();
		right.destroy();
	});

	it("ignores malformed Yjs records while reading", () => {
		const document = new Y.Doc();
		document.getMap("cards").set("malformed", { title: "incomplete" });
		expect(readCards(document)).toEqual([]);
		document.destroy();
	});

	it("creates additional columns between ordered neighbors", () => {
		const document = new Y.Doc();
		ensureInitialDocument(document, "board-3");
		const before = readColumns(document);
		const extra = createColumn(document, "Review", "rose");
		const after = readColumns(document);
		expect(after.at(-1)?.id).toBe(extra.id);
		expect(after.map((column) => column.orderKey)).toEqual(
			after.map((column) => column.orderKey).toSorted(),
		);
		expect(before).toHaveLength(3);
		document.destroy();
	});
});
