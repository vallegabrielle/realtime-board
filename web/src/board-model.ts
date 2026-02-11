import { generateKeyBetween } from "fractional-indexing";
import * as Y from "yjs";
import { z } from "zod";

export const columnColors = [
	"sky",
	"amber",
	"emerald",
	"rose",
	"slate",
] as const;

const columnSchema = z.object({
	id: z.string().min(1),
	name: z.string().trim().min(1).max(60),
	color: z.enum(columnColors),
	orderKey: z.string().min(1),
});

const cardSchema = z.object({
	id: z.string().min(1),
	shortCode: z.string().regex(/^RB-[A-Z0-9]{4}$/),
	title: z.string().trim().min(1).max(160),
	columnId: z.string().min(1),
	orderKey: z.string().min(1),
	dueDate: z.iso.date().nullable(),
	progress: z.number().int().min(0).max(100),
	assigneeId: z.string().nullable(),
});

export type BoardColumn = z.infer<typeof columnSchema>;
export type BoardCard = z.infer<typeof cardSchema>;
export type ColumnColor = (typeof columnColors)[number];

function validRows<T>(map: Y.Map<unknown>, schema: z.ZodType<T>): T[] {
	const rows: T[] = [];
	for (const value of map.values()) {
		if (!(value instanceof Y.Map)) continue;
		const parsed = schema.safeParse(value.toJSON());
		if (parsed.success) rows.push(parsed.data);
	}
	return rows;
}

export function readColumns(document: Y.Doc): BoardColumn[] {
	return validRows(document.getMap("columns"), columnSchema).sort(
		(a, b) => a.orderKey.localeCompare(b.orderKey) || a.id.localeCompare(b.id),
	);
}

export function readCards(document: Y.Doc): BoardCard[] {
	return validRows(document.getMap("cards"), cardSchema).sort(
		(a, b) => a.orderKey.localeCompare(b.orderKey) || a.id.localeCompare(b.id),
	);
}

export function ensureInitialDocument(document: Y.Doc, boardId: string): void {
	const columns = document.getMap<Y.Map<unknown>>("columns");
	if (columns.size > 0) return;
	const initialColumns = [
		{ name: "To Do", color: "sky" },
		{ name: "In Progress", color: "amber" },
		{ name: "Done", color: "emerald" },
	] as const;
	document.transact(() => {
		initialColumns.forEach((column, index) => {
			const id = `${boardId}:column:${index}`;
			const row = new Y.Map<unknown>();
			row.set("id", id);
			row.set("name", column.name);
			row.set("color", column.color);
			row.set("orderKey", `a${index.toString()}`);
			columns.set(id, row);
		});
	});
}

export function createColumn(
	document: Y.Doc,
	name: string,
	color: ColumnColor = "slate",
): BoardColumn {
	const normalizedName = name.trim();
	const id = crypto.randomUUID();
	const orderKey = generateKeyBetween(
		readColumns(document).at(-1)?.orderKey ?? null,
		null,
	);
	const value = columnSchema.parse({
		id,
		name: normalizedName,
		color,
		orderKey,
	});
	const row = new Y.Map<unknown>();
	for (const [key, field] of Object.entries(value)) row.set(key, field);
	document.getMap<Y.Map<unknown>>("columns").set(id, row);
	return value;
}

export function updateColumn(
	document: Y.Doc,
	id: string,
	patch: Partial<Pick<BoardColumn, "name" | "color">>,
): void {
	const row = document.getMap<Y.Map<unknown>>("columns").get(id);
	if (!row) return;
	if (patch.name !== undefined) row.set("name", patch.name.trim());
	if (patch.color !== undefined) row.set("color", patch.color);
}

export function deleteColumn(document: Y.Doc, id: string): void {
	const columns = document.getMap<Y.Map<unknown>>("columns");
	const cards = document.getMap<Y.Map<unknown>>("cards");
	const remaining = readColumns(document).filter((column) => column.id !== id);
	if (!columns.has(id) || remaining.length === 0) return;
	const fallback = remaining[0];
	if (!fallback) return;
	document.transact(() => {
		for (const card of readCards(document).filter(
			(item) => item.columnId === id,
		)) {
			const row = cards.get(card.id);
			if (!row) continue;
			const targetCards = readCards(document).filter(
				(item) => item.columnId === fallback.id,
			);
			row.set("columnId", fallback.id);
			row.set(
				"orderKey",
				generateKeyBetween(targetCards.at(-1)?.orderKey ?? null, null),
			);
		}
		columns.delete(id);
	});
}

function createShortCode(document: Y.Doc): string {
	const cards = readCards(document);
	const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
	for (let attempt = 0; attempt < 100; attempt += 1) {
		const bytes = crypto.getRandomValues(new Uint8Array(4));
		const code = `RB-${Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("")}`;
		if (!cards.some((card) => card.shortCode === code)) return code;
	}
	throw new Error("Could not generate a unique card code");
}

export function createCard(
	document: Y.Doc,
	title: string,
	columnId: string,
): BoardCard {
	const id = crypto.randomUUID();
	const orderKey = generateKeyBetween(
		readCards(document)
			.filter((card) => card.columnId === columnId)
			.at(-1)?.orderKey ?? null,
		null,
	);
	const value = cardSchema.parse({
		id,
		shortCode: createShortCode(document),
		title,
		columnId,
		orderKey,
		dueDate: null,
		progress: 0,
		assigneeId: null,
	});
	const row = new Y.Map<unknown>();
	for (const [key, field] of Object.entries(value)) row.set(key, field);
	document.getMap<Y.Map<unknown>>("cards").set(id, row);
	return value;
}

export function updateCard(
	document: Y.Doc,
	id: string,
	patch: Partial<
		Pick<BoardCard, "title" | "dueDate" | "progress" | "assigneeId">
	>,
): void {
	const row = document.getMap<Y.Map<unknown>>("cards").get(id);
	if (!row) return;
	for (const [key, value] of Object.entries(patch)) {
		row.set(
			key,
			key === "title" && typeof value === "string" ? value.trim() : value,
		);
	}
}

export function deleteCard(document: Y.Doc, id: string): void {
	document.getMap<Y.Map<unknown>>("cards").delete(id);
}

export function moveCard(
	document: Y.Doc,
	id: string,
	columnId: string,
	index: number,
): void {
	const row = document.getMap<Y.Map<unknown>>("cards").get(id);
	if (!row || !document.getMap("columns").has(columnId)) return;
	const targetCards = readCards(document).filter(
		(card) => card.columnId === columnId && card.id !== id,
	);
	const safeIndex = Math.max(0, Math.min(index, targetCards.length));
	const orderKey = generateKeyBetween(
		targetCards[safeIndex - 1]?.orderKey ?? null,
		targetCards[safeIndex]?.orderKey ?? null,
	);
	document.transact(() => {
		row.set("columnId", columnId);
		row.set("orderKey", orderKey);
	});
}

export function moveColumn(document: Y.Doc, id: string, index: number): void {
	const row = document.getMap<Y.Map<unknown>>("columns").get(id);
	if (!row) return;
	const others = readColumns(document).filter((column) => column.id !== id);
	const safeIndex = Math.max(0, Math.min(index, others.length));
	row.set(
		"orderKey",
		generateKeyBetween(
			others[safeIndex - 1]?.orderKey ?? null,
			others[safeIndex]?.orderKey ?? null,
		),
	);
}
