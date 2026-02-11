import { DragDropProvider, useDroppable } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import { HocuspocusProvider } from "@hocuspocus/provider";
import type { ComponentProps, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { IndexeddbPersistence } from "y-indexeddb";
import * as Y from "yjs";
import { authClient } from "./auth.ts";
import {
	type BoardCard,
	type BoardColumn,
	type ColumnColor,
	columnColors,
	createCard,
	createColumn,
	deleteCard,
	deleteColumn,
	ensureInitialDocument,
	moveCard,
	moveColumn,
	readCards,
	readColumns,
	updateCard,
	updateColumn,
} from "./board-model.ts";

type Board = {
	id: string;
	name: string;
	ownerId: string;
	createdAt: string;
	updatedAt: string;
	role?: "owner" | "editor" | "viewer";
};

type BoardMember = { id: string; name: string; email: string; role: string };

type DialogOptions = {
	title: string;
	description?: string;
	label?: string;
	initialValue?: string;
	confirmLabel: string;
	destructive?: boolean;
	onConfirm: (value: string) => void;
};

function ActionDialog({
	options,
	onClose,
}: {
	options: DialogOptions;
	onClose: () => void;
}) {
	const dialogRef = useRef<HTMLDialogElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const [value, setValue] = useState(options.initialValue ?? "");
	useEffect(() => {
		dialogRef.current?.showModal();
		inputRef.current?.focus();
	}, []);
	return (
		<dialog
			ref={dialogRef}
			onCancel={onClose}
			className="m-auto w-[calc(100%-2rem)] max-w-md rounded-3xl bg-white p-0 text-ink shadow-2xl backdrop:bg-slate-900/40 backdrop:backdrop-blur-sm"
		>
			<form
				className="p-6 sm:p-8"
				onSubmit={(event) => {
					event.preventDefault();
					if (options.label && !value.trim()) return;
					options.onConfirm(value.trim());
					onClose();
				}}
			>
				<div className="flex items-start justify-between gap-4">
					<div>
						<p className="text-xs font-bold tracking-widest text-primary uppercase">
							Realtime Board
						</p>
						<h2 className="mt-2 text-2xl font-bold tracking-tight">
							{options.title}
						</h2>
					</div>
					<button
						aria-label="Close"
						className="grid size-9 shrink-0 place-items-center rounded-xl text-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700"
						onClick={onClose}
						type="button"
					>
						×
					</button>
				</div>
				{options.description ? (
					<p className="mt-3 text-sm leading-6 text-slate-500">
						{options.description}
					</p>
				) : null}
				{options.label ? (
					<label className="mt-6 grid gap-2 text-sm font-semibold text-slate-700">
						{options.label}
						<input
							ref={inputRef}
							className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-normal outline-none transition focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-500/10"
							maxLength={options.label === "Card title" ? 160 : 60}
							onChange={(event) => setValue(event.currentTarget.value)}
							value={value}
						/>
					</label>
				) : null}
				<div className="mt-7 flex justify-end gap-3">
					<button
						className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
						onClick={onClose}
						type="button"
					>
						Cancel
					</button>
					<button
						className={`rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 ${options.destructive ? "bg-rose-600 hover:bg-rose-700" : "bg-primary hover:bg-teal-800"}`}
						disabled={Boolean(options.label && !value.trim())}
						type="submit"
					>
						{options.confirmLabel}
					</button>
				</div>
			</form>
		</dialog>
	);
}

function usePathname() {
	const [pathname, setPathname] = useState(window.location.pathname);

	useEffect(() => {
		const onPopState = () => setPathname(window.location.pathname);
		window.addEventListener("popstate", onPopState);
		return () => window.removeEventListener("popstate", onPopState);
	}, []);

	function navigate(path: string) {
		window.history.pushState(null, "", path);
		setPathname(path);
	}

	return { pathname, navigate };
}

function LoginPage() {
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);

	async function signInWithGitHub() {
		setError("");
		setBusy(true);
		const result = await authClient.signIn.social({
			provider: "github",
			callbackURL: "/boards",
		});
		if (result.error) {
			setError(result.error.message ?? "Unable to start GitHub sign in.");
			setBusy(false);
		}
	}

	async function tryDemo() {
		setError("");
		setBusy(true);
		const result = await authClient.signIn.anonymous();
		if (result.error) {
			setError(result.error.message ?? "Unable to start a demo session.");
			setBusy(false);
			return;
		}
		window.location.assign("/boards");
	}

	return (
		<main className="grid min-h-screen place-items-center p-6">
			<section className="w-full max-w-md rounded-3xl bg-white p-8 shadow-xl shadow-slate-900/10 sm:p-10">
				<div className="grid size-12 place-items-center rounded-2xl bg-teal-50 text-xl font-bold text-primary">
					R
				</div>
				<p className="mt-7 text-sm font-semibold tracking-widest text-primary uppercase">
					Team Workflow
				</p>
				<h1 className="mt-3 text-4xl font-bold tracking-tight">
					Make progress together.
				</h1>
				<p className="mt-3 leading-6 text-slate-600">
					Plan work on a shared board and see every change as it happens.
				</p>
				<div className="mt-8 grid gap-3">
					<button
						className="w-full rounded-xl bg-primary px-4 py-3 font-semibold text-white transition hover:bg-teal-800 disabled:cursor-wait disabled:opacity-60"
						disabled={busy}
						onClick={signInWithGitHub}
						type="button"
					>
						Continue with GitHub
					</button>
					<button
						className="w-full rounded-xl border border-slate-200 px-4 py-3 font-semibold transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
						disabled={busy}
						onClick={tryDemo}
						type="button"
					>
						Try demo
					</button>
				</div>
				{error ? (
					<p className="mt-4 text-sm text-rose-600" role="alert">
						{error}
					</p>
				) : null}
				<p className="mt-6 text-center text-xs text-slate-500">
					No email or password required for the demo.
				</p>
			</section>
		</main>
	);
}

function BoardRoom({ board }: { board: Board }) {
	const [dialog, setDialog] = useState<DialogOptions | null>(null);
	const isViewer = board.role === "viewer";
	const [shareOpen, setShareOpen] = useState(false);
	const [shareRole, setShareRole] = useState<"viewer" | "editor">("viewer");
	const [inviteUrl, setInviteUrl] = useState("");
	const [shareError, setShareError] = useState("");
	const [members, setMembers] = useState<BoardMember[]>([]);
	const [status, setStatus] = useState("connecting");
	const [synced, setSynced] = useState(false);
	const [presence, setPresence] = useState<
		Array<{ id: number; name: string; color: string }>
	>([]);
	const [cursors, setCursors] = useState<
		Array<{ id: number; name: string; color: string; x: number; y: number }>
	>([]);
	const [localClientId, setLocalClientId] = useState<number | null>(null);
	const [, setUndoVersion] = useState(0);
	const [columns, setColumns] = useState<BoardColumn[]>([]);
	const [cards, setCards] = useState<BoardCard[]>([]);
	const documentRef = useRef<Y.Doc | null>(null);
	const draggingRef = useRef(false);
	const refreshRef = useRef<() => void>(() => {});
	const undoManagerRef = useRef<Y.UndoManager | null>(null);
	const providerRef = useRef<HocuspocusProvider | null>(null);
	useEffect(() => {
		fetch(`/api/boards/${board.id}/members`)
			.then(
				(response) => response.json() as Promise<{ members: BoardMember[] }>,
			)
			.then((data) => setMembers(data.members))
			.catch(() => setMembers([]));
	}, [board.id]);

	useEffect(() => {
		const document = new Y.Doc();
		documentRef.current = document;
		const persistence = new IndexeddbPersistence(
			`realtime-board:${board.id}`,
			document,
		);
		const columnMap = document.getMap("columns");
		const cardMap = document.getMap("cards");
		const undoManager = new Y.UndoManager([columnMap, cardMap]);
		undoManagerRef.current = undoManager;
		const updateUndo = () => setUndoVersion((version) => version + 1);
		undoManager.on("stack-item-added", updateUndo);
		undoManager.on("stack-item-popped", updateUndo);
		const refresh = () => {
			if (draggingRef.current) return;
			setColumns(readColumns(document));
			setCards(readCards(document));
		};
		refreshRef.current = refresh;
		const provider = new HocuspocusProvider({
			url: `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/sync/${board.id}`,
			name: board.id,
			document,
		});
		providerRef.current = provider;
		const identity = {
			name: "Guest",
			color:
				["#0f766e", "#0284c7", "#b45309", "#be123c"][
					Math.floor(Math.random() * 4)
				] ?? "#0f766e",
		};
		provider.awareness?.setLocalStateField("user", identity);
		setLocalClientId(provider.awareness?.clientID ?? null);
		const updatePresence = () => {
			const states = [...(provider.awareness?.getStates().entries() ?? [])];
			setPresence(
				states.flatMap(([id, state]) =>
					state.user
						? [{ id, name: state.user.name, color: state.user.color }]
						: [],
				),
			);
			setCursors(
				states.flatMap(([id, state]) =>
					state.user && state.cursor
						? [
								{
									id,
									name: state.user.name,
									color: state.user.color,
									...state.cursor,
								},
							]
						: [],
				),
			);
		};
		const movePointer = (event: PointerEvent) =>
			provider.awareness?.setLocalStateField("cursor", {
				x: event.clientX,
				y: event.clientY,
			});
		provider.awareness?.on("change", updatePresence);
		window.addEventListener("pointermove", movePointer);
		provider.on("status", ({ status: nextStatus }: { status: string }) =>
			setStatus(nextStatus),
		);
		provider.on("synced", () => {
			ensureInitialDocument(document, board.id);
			refresh();
			setSynced(true);
		});
		columnMap.observeDeep(refresh);
		cardMap.observeDeep(refresh);
		return () => {
			provider.awareness?.off("change", updatePresence);
			window.removeEventListener("pointermove", movePointer);
			undoManager.off("stack-item-added", updateUndo);
			undoManager.off("stack-item-popped", updateUndo);
			undoManager.destroy();
			columnMap.unobserveDeep(refresh);
			cardMap.unobserveDeep(refresh);
			provider.destroy();
			persistence.destroy();
			document.destroy();
			documentRef.current = null;
			undoManagerRef.current = null;
			providerRef.current = null;
		};
	}, [board.id]);

	function addColumn() {
		if (isViewer) return;
		setDialog({
			title: "Add a column",
			description: "Organize your board into stages that work for your team.",
			label: "Column name",
			confirmLabel: "Add column",
			onConfirm: (name) => {
				if (documentRef.current) createColumn(documentRef.current, name);
			},
		});
	}

	function addCard(columnId: string) {
		if (isViewer) return;
		setDialog({
			title: "Add a card",
			description:
				"Give this task a clear title so your team knows what needs to be done.",
			label: "Card title",
			confirmLabel: "Add card",
			onConfirm: (title) => {
				if (documentRef.current)
					createCard(documentRef.current, title, columnId);
			},
		});
	}

	function renameColumn(column: BoardColumn) {
		if (isViewer) return;
		setDialog({
			title: "Rename column",
			label: "Column name",
			initialValue: column.name,
			confirmLabel: "Save changes",
			onConfirm: (name) => {
				if (documentRef.current)
					updateColumn(documentRef.current, column.id, { name });
			},
		});
	}

	function setColumnColor(column: BoardColumn, color: ColumnColor) {
		if (isViewer || !documentRef.current) return;
		updateColumn(documentRef.current, column.id, { color });
	}

	function removeColumn(column: BoardColumn) {
		if (isViewer) return;
		setDialog({
			title: "Delete column?",
			description: `Cards in “${column.name}” will move to another column.`,
			confirmLabel: "Delete column",
			destructive: true,
			onConfirm: () => {
				if (documentRef.current) deleteColumn(documentRef.current, column.id);
			},
		});
	}

	function renameCard(card: BoardCard) {
		if (isViewer) return;
		setDialog({
			title: "Edit card",
			label: "Card title",
			initialValue: card.title,
			confirmLabel: "Save changes",
			onConfirm: (title) => {
				if (documentRef.current)
					updateCard(documentRef.current, card.id, { title });
			},
		});
	}

	function removeCard(card: BoardCard) {
		if (isViewer) return;
		setDialog({
			title: "Delete card?",
			description: `“${card.title}” (${card.shortCode}) will be removed from the board.`,
			confirmLabel: "Delete card",
			destructive: true,
			onConfirm: () => {
				if (documentRef.current) deleteCard(documentRef.current, card.id);
			},
		});
	}

	function setCardProgress(card: BoardCard, progress: number) {
		if (isViewer || !documentRef.current) return;
		updateCard(documentRef.current, card.id, { progress });
	}

	function setCardDueDate(card: BoardCard, dueDate: string) {
		if (isViewer || !documentRef.current) return;
		updateCard(documentRef.current, card.id, { dueDate: dueDate || null });
	}

	function assignCard(card: BoardCard, assigneeId: string) {
		if (isViewer || !documentRef.current) return;
		updateCard(documentRef.current, card.id, {
			assigneeId: assigneeId || null,
		});
	}

	async function createInvite() {
		setShareError("");
		const response = await fetch(`/api/boards/${board.id}/invites`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ role: shareRole }),
		});
		if (!response.ok) {
			setShareError("Unable to create invite.");
			return;
		}
		const data = (await response.json()) as { inviteUrl: string };
		setInviteUrl(data.inviteUrl);
	}

	function handleCardDrop(
		event: Parameters<
			NonNullable<ComponentProps<typeof DragDropProvider>["onDragEnd"]>
		>[0],
	) {
		try {
			if (event.canceled || !documentRef.current) return;
			const { source, target } = event.operation;
			if (!source || !target || !isSortable(source)) return;
			if (source.type === "column") {
				const index = readColumns(documentRef.current).findIndex(
					(column) => column.id === String(target.id),
				);
				if (index >= 0)
					moveColumn(documentRef.current, String(source.id), index);
				return;
			}
			const targetId = String(target.id);
			const emptyColumnPrefix = "column-drop:";
			const columnId = targetId.startsWith(emptyColumnPrefix)
				? targetId.slice(emptyColumnPrefix.length)
				: String(source.group ?? "");
			if (!columnId) return;
			const targetIndex = targetId.startsWith(emptyColumnPrefix)
				? readCards(documentRef.current).filter(
						(card) => card.columnId === columnId,
					).length
				: source.index;
			moveCard(documentRef.current, String(source.id), columnId, targetIndex);
		} finally {
			draggingRef.current = false;
			refreshRef.current();
		}
	}

	return (
		<div>
			{dialog ? (
				<ActionDialog options={dialog} onClose={() => setDialog(null)} />
			) : null}
			<div className="flex flex-wrap items-center justify-between gap-4">
				<div>
					<h1 className="text-3xl font-bold">{board.name}</h1>
					<p className="mt-2 text-slate-500">Your collaborative workspace</p>
				</div>
				<div className="flex items-center gap-3">
					{board.role === "owner" ? (
						<button
							className="rounded-xl bg-white px-3 py-2 text-sm font-semibold shadow-sm"
							onClick={() => setShareOpen((open) => !open)}
							type="button"
						>
							Share
						</button>
					) : null}
					<ul aria-label="Online users" className="flex -space-x-2">
						{presence.map((person) => (
							<li
								className="grid size-8 place-items-center rounded-full border-2 border-white text-xs font-bold text-white"
								key={person.id}
								style={{ backgroundColor: person.color }}
								title={`${person.name} online`}
							>
								{person.name.slice(0, 1)}
							</li>
						))}
					</ul>
					<button
						aria-label="Undo"
						className="rounded-lg bg-white px-3 py-2 text-sm shadow-sm disabled:opacity-40"
						disabled={isViewer || !undoManagerRef.current?.undoStack.length}
						onClick={() => undoManagerRef.current?.undo()}
						type="button"
					>
						Undo
					</button>
					<button
						aria-label="Redo"
						className="rounded-lg bg-white px-3 py-2 text-sm shadow-sm disabled:opacity-40"
						disabled={isViewer || !undoManagerRef.current?.redoStack.length}
						onClick={() => undoManagerRef.current?.redo()}
						type="button"
					>
						Redo
					</button>
					<button
						className="rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
						disabled={!synced || isViewer}
						onClick={addColumn}
						type="button"
					>
						+ Add column
					</button>
					<p className="rounded-full bg-white px-3 py-1.5 text-sm font-medium text-slate-600 shadow-sm">
						<span
							className={`mr-2 inline-block size-2 rounded-full ${status === "connected" ? "bg-emerald-500" : status === "connecting" ? "bg-amber-500" : "bg-rose-500"}`}
						/>
						{synced ? "All changes synced" : status}
					</p>
					{status === "disconnected" ? (
						<button
							className="rounded-lg bg-white px-3 py-2 text-sm shadow-sm"
							onClick={() => providerRef.current?.connect()}
							type="button"
						>
							Reconnect
						</button>
					) : null}
				</div>
			</div>
			{shareOpen ? (
				<div className="mt-4 rounded-xl bg-white p-4 shadow-sm">
					<p className="font-semibold">Invite link</p>
					<div className="mt-2 flex gap-2">
						<label className="text-sm">
							Role{" "}
							<select
								aria-label="Invite role"
								className="ml-2 rounded border p-2"
								onChange={(event) =>
									setShareRole(event.currentTarget.value as "viewer" | "editor")
								}
								value={shareRole}
							>
								<option value="viewer">Viewer</option>
								<option value="editor">Editor</option>
							</select>
						</label>
						<button
							className="rounded bg-teal-700 px-3 text-sm text-white"
							onClick={createInvite}
							type="button"
						>
							Create link
						</button>
					</div>
					{inviteUrl ? (
						<div className="mt-2 flex gap-2">
							<input
								className="min-w-0 flex-1 rounded border p-2 text-sm"
								readOnly
								value={inviteUrl}
							/>
							<button
								className="rounded bg-teal-700 px-3 text-sm text-white"
								onClick={() => navigator.clipboard.writeText(inviteUrl)}
								type="button"
							>
								Copy
							</button>
						</div>
					) : null}
					{shareError ? (
						<p className="text-sm text-rose-600">{shareError}</p>
					) : null}
				</div>
			) : null}
			<DragDropProvider
				onDragStart={() => {
					draggingRef.current = true;
				}}
				onDragEnd={handleCardDrop}
			>
				<div className="mt-8 overflow-x-auto pb-4">
					<div className="flex min-h-80 min-w-max items-start gap-5">
						{columns.map((column) => {
							const palette = columnPalette[column.color];
							const columnCards = cards.filter(
								(card) => card.columnId === column.id,
							);
							return (
								<ColumnDropZone
									column={column}
									index={columns.indexOf(column)}
									disabled={isViewer}
									key={column.id}
								>
									<header className="flex items-center justify-between px-1 py-2">
										<div className="flex min-w-0 items-center gap-2">
											<span
												className={`size-2.5 shrink-0 rounded-full ${palette.dot}`}
											/>
											<h2 className="truncate font-semibold">{column.name}</h2>
											<span className="text-sm text-slate-500">
												{columnCards.length}
											</span>
										</div>
										<button
											aria-label={`Add card to ${column.name}`}
											className="grid size-8 place-items-center rounded-lg text-xl text-slate-500 hover:bg-white"
											disabled={!synced || isViewer}
											onClick={() => addCard(column.id)}
											type="button"
										>
											+
										</button>
										<details className="relative">
											<summary
												aria-label={`Options for ${column.name}`}
												className="grid size-8 cursor-pointer list-none place-items-center rounded-lg text-slate-500 hover:bg-white"
											>
												···
											</summary>
											<div className="absolute right-0 z-10 mt-1 grid w-36 rounded-xl border border-slate-100 bg-white p-1 shadow-lg">
												<button
													className="rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50"
													onClick={() => renameColumn(column)}
													type="button"
												>
													Rename
												</button>
												<div className="border-t border-slate-100 px-3 py-2">
													<p className="mb-2 text-xs font-semibold text-slate-500">
														Column color
													</p>
													<div className="flex gap-2">
														{columnColors.map((color) => (
															<button
																aria-label={`Set ${column.name} color to ${color}`}
																className={`size-5 rounded-full ${columnPalette[color].dot} ${column.color === color ? "ring-2 ring-slate-700 ring-offset-2" : ""}`}
																key={color}
																onClick={() => setColumnColor(column, color)}
																type="button"
															/>
														))}
													</div>
												</div>
												<button
													className="rounded-lg px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50"
													onClick={() => removeColumn(column)}
													type="button"
												>
													Delete column
												</button>
											</div>
										</details>
									</header>
									<div className="grid gap-3">
										{columnCards.map((card) => (
											<CardTile
												card={card}
												columnId={column.id}
												index={columnCards.indexOf(card)}
												members={members}
												readOnly={isViewer}
												key={card.id}
												onDelete={() => removeCard(card)}
												onAssign={(assigneeId) => assignCard(card, assigneeId)}
												onDueDate={(dueDate) => setCardDueDate(card, dueDate)}
												onProgress={(progress) =>
													setCardProgress(card, progress)
												}
												onRename={() => renameCard(card)}
											/>
										))}
										{!columnCards.length ? (
											<p className="rounded-xl border border-dashed border-slate-300/80 px-4 py-5 text-center text-sm text-slate-400">
												No cards yet
											</p>
										) : null}
									</div>
								</ColumnDropZone>
							);
						})}
					</div>
				</div>
			</DragDropProvider>
			{cursors
				.filter((cursor) => cursor.id !== localClientId)
				.map((cursor) => (
					<div
						className="pointer-events-none fixed z-50 flex items-center gap-1 text-xs font-semibold"
						key={cursor.id}
						style={{ left: cursor.x, top: cursor.y, color: cursor.color }}
					>
						<span className="text-xl leading-none">↖</span>
						<span className="rounded bg-white/90 px-1.5 py-0.5 shadow">
							{cursor.name}
						</span>
					</div>
				))}
		</div>
	);
}

const columnPalette: Record<ColumnColor, { dot: string }> = {
	sky: { dot: "bg-sky-500" },
	amber: { dot: "bg-amber-500" },
	emerald: { dot: "bg-emerald-500" },
	rose: { dot: "bg-rose-500" },
	slate: { dot: "bg-slate-500" },
};

function ColumnDropZone({
	column,
	index,
	disabled,
	children,
}: {
	column: BoardColumn;
	index: number;
	disabled: boolean;
	children: ReactNode;
}) {
	const dropZone = useDroppable({
		id: `column-drop:${column.id}`,
		accept: "card",
	});
	const sortable = useSortable({
		id: column.id,
		index,
		group: "columns",
		type: "column",
		accept: "column",
		disabled,
	});
	return (
		<section
			className={`w-80 rounded-2xl p-3 transition-colors ${dropZone.isDropTarget ? "bg-teal-100/80" : "bg-slate-100/75"} ${sortable.isDragging ? "opacity-50" : ""}`}
			ref={(element) => {
				dropZone.ref(element);
				sortable.ref(element);
			}}
		>
			{children}
		</section>
	);
}

function CardTile({
	card,
	columnId,
	index,
	readOnly,
	members,
	onDelete,
	onAssign,
	onDueDate,
	onProgress,
	onRename,
}: {
	card: BoardCard;
	columnId: string;
	index: number;
	readOnly: boolean;
	members: BoardMember[];
	onDelete: () => void;
	onAssign: (assigneeId: string) => void;
	onDueDate: (dueDate: string) => void;
	onProgress: (progress: number) => void;
	onRename: () => void;
}) {
	const sortable = useSortable({
		id: card.id,
		index,
		group: columnId,
		type: "card",
		accept: "card",
		disabled: readOnly,
	});
	return (
		<article
			className={`rounded-xl border border-slate-100 bg-white p-4 shadow-sm transition-shadow ${sortable.isDragging ? "opacity-50 shadow-lg" : ""}`}
			ref={sortable.ref}
		>
			<div className="flex items-start justify-between gap-2">
				<span className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-semibold tracking-wide text-slate-500">
					{card.shortCode}
				</span>
				<div className="flex items-center gap-2">
					<button
						aria-label={`Drag ${card.shortCode}`}
						className="cursor-grab text-slate-300 active:cursor-grabbing"
						ref={sortable.handleRef}
						type="button"
					>
						⠿
					</button>
					<details className="relative">
						<summary
							aria-label={`Options for ${card.shortCode}`}
							className="cursor-pointer list-none text-slate-400"
						>
							···
						</summary>
						<div className="absolute right-0 z-10 mt-1 grid w-56 rounded-xl border border-slate-100 bg-white p-1 shadow-lg">
							<button
								className="rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50"
								onClick={onRename}
								type="button"
							>
								Edit title
							</button>
							<div className="border-t border-slate-100 px-2 py-2">
								<p className="mb-2 text-xs font-semibold text-slate-500">
									Progress
								</p>
								<div className="flex gap-1">
									{[30, 50, 70].map((progress) => (
										<button
											className="rounded-md bg-slate-100 px-2 py-1 text-xs hover:bg-teal-50"
											key={progress}
											onClick={() => onProgress(progress)}
											type="button"
										>
											{progress}%
										</button>
									))}
								</div>
							</div>
							<label className="grid gap-1 border-t border-slate-100 px-2 py-2 text-xs font-semibold text-slate-500">
								Assign to
								<select
									className="rounded-md border border-slate-200 p-1.5 font-normal text-slate-700"
									disabled={readOnly}
									onChange={(event) => onAssign(event.currentTarget.value)}
									value={card.assigneeId ?? ""}
								>
									<option value="">Unassigned</option>
									{members.map((member) => (
										<option key={member.id} value={member.id}>
											{member.name} ({member.role})
										</option>
									))}
								</select>
							</label>
							<label className="grid gap-1 border-t border-slate-100 px-2 py-2 text-xs font-semibold text-slate-500">
								Due date
								<input
									className="w-full rounded-md border border-slate-200 p-1.5 font-normal text-slate-700"
									onChange={(event) => onDueDate(event.currentTarget.value)}
									type="date"
									value={card.dueDate ?? ""}
								/>
							</label>
							<button
								className="rounded-lg px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50"
								onClick={onDelete}
								type="button"
							>
								Delete card
							</button>
						</div>
					</details>
				</div>
			</div>
			<h3 className="mt-3 font-semibold leading-5">{card.title}</h3>
			{card.dueDate ? (
				<p className="mt-3 text-xs text-slate-500">
					Due {new Date(`${card.dueDate}T00:00:00`).toLocaleDateString()}
				</p>
			) : null}
			<div className="mt-4 flex items-center gap-3">
				<div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
					<div
						className="h-full rounded-full bg-teal-500"
						style={{ width: `${card.progress}%` }}
					/>
				</div>
				<span className="text-xs font-medium text-slate-500">
					{card.progress}%
				</span>
				{card.assigneeId ? (
					<span className="grid size-7 place-items-center rounded-full bg-amber-100 text-xs font-semibold text-amber-800">
						{card.assigneeId.slice(0, 1).toUpperCase()}
					</span>
				) : null}
			</div>
		</article>
	);
}

export function App() {
	const [creatingBoard, setCreatingBoard] = useState(false);
	const { data: session, isPending } = authClient.useSession();
	const { pathname, navigate } = usePathname();
	const [boards, setBoards] = useState<Board[]>([]);
	const [board, setBoard] = useState<Board | null>(null);
	const [loadingBoards, setLoadingBoards] = useState(false);
	const [error, setError] = useState("");

	useEffect(() => {
		if (!session) return;
		setLoadingBoards(true);
		fetch("/api/boards")
			.then(async (response) => {
				if (!response.ok) throw new Error("Unable to load your boards.");
				return (await response.json()) as { boards: Board[] };
			})
			.then((data) => setBoards(data.boards))
			.catch((cause: unknown) =>
				setError(
					cause instanceof Error
						? cause.message
						: "Unable to load your boards.",
				),
			)
			.finally(() => setLoadingBoards(false));
	}, [session]);

	const selectedBoardId = pathname.match(/^\/boards\/([^/]+)$/)?.[1];
	const inviteToken = pathname.match(/^\/invite\/([^/]+)$/)?.[1];
	useEffect(() => {
		if (!inviteToken || !session) return;
		fetch(`/api/invites/${inviteToken}/accept`, { method: "POST" })
			.then(async (response) => {
				if (!response.ok) throw new Error("Invite is invalid or expired.");
				return (await response.json()) as { boardId: string };
			})
			.then((data) => {
				window.history.replaceState(null, "", `/boards/${data.boardId}`);
				window.dispatchEvent(new PopStateEvent("popstate"));
			})
			.catch((cause: unknown) =>
				setError(
					cause instanceof Error ? cause.message : "Unable to accept invite.",
				),
			);
	}, [inviteToken, session]);
	useEffect(() => {
		if (!selectedBoardId) {
			setBoard(null);
			return;
		}
		fetch(`/api/boards/${selectedBoardId}`)
			.then(async (response) => {
				if (!response.ok) throw new Error("Board not found.");
				return (await response.json()) as { board: Board };
			})
			.then((data) => setBoard(data.board))
			.catch((cause: unknown) =>
				setError(cause instanceof Error ? cause.message : "Board not found."),
			);
	}, [selectedBoardId]);

	if (isPending) {
		return (
			<main className="grid min-h-screen place-items-center text-slate-500">
				Loading your workspace…
			</main>
		);
	}
	if (!session) return <LoginPage />;

	async function createBoard(name: string) {
		setError("");
		const response = await fetch("/api/boards", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ name }),
		});
		if (!response.ok) {
			setError("Unable to create your board.");
			return;
		}
		const data = (await response.json()) as { board: Board };
		setBoards((current) => [data.board, ...current]);
		setBoard(data.board);
		navigate(`/boards/${data.board.id}`);
	}

	return (
		<div className="min-h-screen md:flex">
			{creatingBoard ? (
				<ActionDialog
					options={{
						title: "Create a board",
						description: "Give your workspace a name to get started.",
						label: "Board name",
						initialValue: "Product roadmap",
						confirmLabel: "Create board",
						onConfirm: (name) => {
							void createBoard(name);
						},
					}}
					onClose={() => setCreatingBoard(false)}
				/>
			) : null}
			<aside className="flex w-full flex-col border-b border-slate-200/80 bg-white/75 p-5 md:min-h-screen md:w-64 md:border-r md:border-b-0">
				<button
					className="flex items-center gap-3 text-left"
					onClick={() => navigate("/boards")}
					type="button"
				>
					<span className="grid size-10 place-items-center rounded-xl bg-primary font-bold text-white">
						R
					</span>
					<span className="text-lg font-bold">Realtime Board</span>
				</button>
				<div className="mt-9 flex items-center justify-between px-2">
					<p className="text-xs font-bold tracking-wider text-slate-500 uppercase">
						Your boards
					</p>
					<button
						aria-label="Create board"
						className="grid size-8 place-items-center rounded-lg text-xl text-primary hover:bg-teal-50"
						onClick={() => setCreatingBoard(true)}
						type="button"
					>
						+
					</button>
				</div>
				<nav className="mt-2 grid gap-1">
					{boards.map((item) => (
						<button
							className={`rounded-xl px-3 py-2.5 text-left text-sm font-medium ${item.id === selectedBoardId ? "bg-teal-50 text-primary" : "text-slate-600 hover:bg-slate-100"}`}
							key={item.id}
							onClick={() => navigate(`/boards/${item.id}`)}
							type="button"
						>
							{item.name}
						</button>
					))}
					{!boards.length && !loadingBoards ? (
						<p className="px-3 py-2 text-sm text-slate-400">No boards yet</p>
					) : null}
				</nav>
				<div className="mt-auto hidden border-t border-slate-100 pt-4 md:block">
					<button
						className="w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-600 hover:bg-slate-100"
						onClick={() =>
							authClient.signOut().then(() => window.location.assign("/"))
						}
						type="button"
					>
						Sign out
					</button>
				</div>
			</aside>
			<main className="min-w-0 flex-1">
				<header className="flex h-16 items-center justify-between border-b border-slate-200/70 px-6 md:px-10">
					<p className="text-sm font-medium text-slate-500">Workspace</p>
					<div className="flex items-center gap-3">
						<span className="grid size-9 place-items-center rounded-full bg-amber-100 text-sm font-semibold text-amber-800">
							{session.user.name.slice(0, 1).toUpperCase()}
						</span>
						<span className="text-sm font-medium">{session.user.name}</span>
					</div>
				</header>
				<section className="p-6 md:p-10">
					{error ? (
						<p className="mb-5 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">
							{error}
						</p>
					) : null}
					{selectedBoardId ? (
						<div>
							<button
								className="mb-5 text-sm font-medium text-primary hover:underline"
								onClick={() => navigate("/boards")}
								type="button"
							>
								← All boards
							</button>
							{board ? (
								<BoardRoom board={board} />
							) : (
								<p className="text-slate-500">Loading board…</p>
							)}
						</div>
					) : (
						<div className="mx-auto max-w-5xl">
							<div className="flex flex-wrap items-end justify-between gap-4">
								<div>
									<p className="text-sm font-semibold text-primary">
										WORKSPACE
									</p>
									<h1 className="mt-2 text-3xl font-bold tracking-tight">
										Your boards
									</h1>
									<p className="mt-2 text-slate-500">
										Pick up where your team left off.
									</p>
								</div>
								<button
									className="rounded-xl bg-primary px-4 py-2.5 font-semibold text-white hover:bg-teal-800"
									onClick={() => setCreatingBoard(true)}
									type="button"
								>
									+ New board
								</button>
							</div>
							{loadingBoards ? (
								<p className="mt-10 text-slate-500">Loading boards…</p>
							) : boards.length ? (
								<div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
									{boards.map((item) => (
										<button
											className="rounded-2xl border border-white bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
											key={item.id}
											onClick={() => navigate(`/boards/${item.id}`)}
											type="button"
										>
											<span className="grid size-10 place-items-center rounded-xl bg-sky-50 text-lg text-sky-600">
												▦
											</span>
											<span className="mt-4 block font-semibold">
												{item.name}
											</span>
											<span className="mt-1 block text-sm text-slate-500">
												Updated {new Date(item.updatedAt).toLocaleDateString()}
											</span>
										</button>
									))}
								</div>
							) : (
								<div className="mt-10 rounded-3xl border border-dashed border-slate-300 bg-white/50 px-6 py-14 text-center">
									<h2 className="text-xl font-semibold">Start with a board</h2>
									<p className="mt-2 text-slate-500">
										Create a shared space for your next project.
									</p>
									<button
										className="mt-5 rounded-xl bg-primary px-4 py-2.5 font-semibold text-white hover:bg-teal-800"
										onClick={() => setCreatingBoard(true)}
										type="button"
									>
										Create your first board
									</button>
								</div>
							)}
						</div>
					)}
				</section>
			</main>
		</div>
	);
}
