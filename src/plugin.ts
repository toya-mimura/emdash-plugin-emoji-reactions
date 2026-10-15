import type { BlockResponse } from "@emdash-cms/blocks";
import type { PluginContext, SandboxedPlugin } from "emdash/plugin";
import { z } from "zod";

/**
 * Reactions — 記事ごとの絵文字リアクション（1人1記事につき1つだけ選べる）
 *
 * storage
 *   counts: id = contentId  → { contentId, total, updatedAt, c_<key>: number ... }
 *   votes : id = `${contentId}:${voterHash}` → { contentId, reaction, updatedAt }
 *
 * routes
 *   GET  /_emdash/api/plugins/reactions/state?contentId=...   (public)
 *   POST /_emdash/api/plugins/reactions/react {contentId, reaction} (public)
 *   admin (Block Kit: 設定 + ランキング)
 */

// ---------- 設定 ----------

type ReactionDef = { key: string; emoji: string; label: string };

/** 未設定時のデフォルト（key=emoji:ラベル をカンマ区切りで保存） */
const DEFAULT_SPEC = "love=💗:Love, hmm=🤔:Hmm, whistle=😗:Whoa";
const MAX_REACTIONS = 6;

const KEY_RE = /^[a-z][a-z0-9_]{0,23}$/;
const CONTENT_ID_RE = /^[A-Za-z0-9_\-:.]{1,128}$/;

/** "love=💗:すき, hmm=🤔" → ReactionDef[]（不正なものは捨てる） */
function parseSpec(spec: string): ReactionDef[] {
	const out: ReactionDef[] = [];
	const seen = new Set<string>();
	for (const raw of spec.split(",")) {
		const item = raw.trim();
		if (!item) continue;
		const eq = item.indexOf("=");
		if (eq <= 0) continue;
		const key = item.slice(0, eq).trim();
		const rest = item.slice(eq + 1).trim();
		const colon = rest.indexOf(":");
		const emoji = (colon >= 0 ? rest.slice(0, colon) : rest).trim();
		const label = (colon >= 0 ? rest.slice(colon + 1) : "").trim() || key;
		if (!KEY_RE.test(key) || !emoji || emoji.length > 16 || seen.has(key)) continue;
		seen.add(key);
		out.push({ key, emoji, label: label.slice(0, 32) });
		if (out.length >= MAX_REACTIONS) break;
	}
	return out;
}

async function loadReactions(ctx: PluginContext): Promise<{ spec: string; defs: ReactionDef[] }> {
	const spec = (await ctx.settings.get<string>("spec")) ?? DEFAULT_SPEC;
	const defs = parseSpec(spec);
	return defs.length > 0 ? { spec, defs } : { spec: DEFAULT_SPEC, defs: parseSpec(DEFAULT_SPEC) };
}

/** ボタンの見た目。ラベルは既定で非表示（ツールチップと読み上げには使う）、件数は既定で表示 */
type Display = { labels: boolean; counts: boolean };

async function loadDisplay(ctx: PluginContext): Promise<Display> {
	const [labels, counts] = await Promise.all([
		ctx.settings.get<boolean>("showLabels"),
		ctx.settings.get<boolean>("showCounts"),
	]);
	return { labels: labels === true, counts: counts !== false };
}

// ---------- 投票者の識別 ----------

/** サイトごとのランダムな塩。IPそのものは保存しない */
async function getSalt(ctx: PluginContext): Promise<string> {
	const existing = await ctx.kv.get<string>("state:salt");
	if (existing) return existing;
	const bytes = crypto.getRandomValues(new Uint8Array(16));
	const salt = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
	const created = await ctx.kv.compareAndSet("state:salt", null, salt);
	if (created.applied) return salt;
	return (await ctx.kv.get<string>("state:salt")) ?? salt;
}

type Meta = { ip?: string | null; userAgent?: string | null } | undefined;

/**
 * IP + UserAgent をハッシュして「同じ人」とみなす。
 * IPが取れない環境（ローカル開発など）ではブラウザが送る visitorId を使う。
 */
async function voterHash(ctx: PluginContext, meta: Meta, visitorId?: string): Promise<string | null> {
	const ip = meta?.ip ?? null;
	const basis = ip ? `${ip}|${meta?.userAgent ?? ""}` : visitorId ? `v|${visitorId}` : null;
	if (!basis) return null;
	const salt = await getSalt(ctx);
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}|${basis}`));
	return [...new Uint8Array(digest)]
		.slice(0, 16)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

// ---------- 集計 ----------

type CountsDoc = Record<string, unknown> & { contentId: string; total: number; updatedAt: string };
type VoteDoc = { contentId: string; reaction: string; updatedAt: string };

const field = (key: string) => `c_${key}`;

/** 公開APIの応答。件数を非表示にしているときは件数そのものを返さない */
function shape(defs: ReactionDef[], display: Display, doc: CountsDoc | null, mine: string | null) {
	const n = (v: unknown) => Math.max(0, Number(v ?? 0));
	return {
		reactions: defs.map((d) => ({
			key: d.key,
			emoji: d.emoji,
			label: d.label,
			...(display.counts ? { count: n(doc?.[field(d.key)]) } : {}),
		})),
		...(display.counts ? { total: n(doc?.total) } : {}),
		mine,
		display,
	};
}

/** 記事の集計に差分を適用する（無ければ作成）。最新の集計を返す */
async function applyDelta(
	ctx: PluginContext,
	contentId: string,
	deltas: Record<string, number>,
): Promise<CountsDoc | null> {
	const counts = ctx.storage.counts;
	const now = new Date().toISOString();
	const delta: Record<string, { inc: number } | { dec: number }> = {};
	let totalDelta = 0;
	for (const [key, d] of Object.entries(deltas)) {
		if (d === 0) continue;
		delta[field(key)] = d > 0 ? { inc: d } : { dec: -d };
		totalDelta += d;
	}
	if (totalDelta !== 0) delta.total = totalDelta > 0 ? { inc: totalDelta } : { dec: -totalDelta };
	if (Object.keys(delta).length === 0) return (await counts.get(contentId)) as CountsDoc | null;

	for (let attempt = 0; attempt < 3; attempt++) {
		const updated = await counts.updateIf(contentId, { where: {}, set: { updatedAt: now }, delta });
		if (updated.applied) return updated.data as CountsDoc;

		// まだ集計ドキュメントが無い → 作成（負の差分は0扱い）
		const initial: CountsDoc = { contentId, total: Math.max(0, totalDelta), updatedAt: now };
		for (const [key, d] of Object.entries(deltas)) initial[field(key)] = Math.max(0, d);
		const created = await counts.compareAndSet(contentId, null, initial);
		if (created.applied) return initial;
		// 同時に誰かが作成した → もう一度 updateIf
	}
	throw new Error("Reaction counter is busy; try again");
}

// ---------- 入力 ----------

const stateInput = z.object({
	contentId: z.string().regex(CONTENT_ID_RE),
	visitorId: z.string().uuid().optional(),
});

const reactInput = z.object({
	contentId: z.string().regex(CONTENT_ID_RE),
	reaction: z.string().regex(KEY_RE),
	visitorId: z.string().uuid().optional(),
});

const adminInteraction = z.discriminatedUnion("type", [
	z.object({ type: z.literal("page_load"), page: z.string() }),
	z.object({
		type: z.literal("form_submit"),
		action_id: z.string(),
		block_id: z.string().optional(),
		values: z.object({
			spec: z.string().max(400),
			showLabels: z.boolean().optional(),
			showCounts: z.boolean().optional(),
		}),
	}),
	z.object({
		type: z.literal("block_action"),
		action_id: z.string(),
		block_id: z.string().optional(),
		value: z.unknown().optional(),
	}),
]);

// ---------- 管理画面（Block Kit） ----------

/** 管理画面の文言。EmDash の管理画面ロケールが ja なら日本語、それ以外は英語 */
const MESSAGES = {
	en: {
		statPosts: "Posts with reactions",
		statVotes: "Active votes",
		statButtons: "Buttons",
		topHeader: "Top 10 posts",
		empty: "No reactions yet",
		total: "Total",
		updated: "Last",
		settingsHeader: "Buttons",
		help: "Format: key=emoji:label, comma separated (up to 6). Keys start with a lowercase letter. Removing a key hides its button but keeps its counts.",
		fieldLabel: "Reactions",
		save: "Save",
		saved: "Saved",
		invalid: "No valid buttons. Check the format.",
		showLabels: "Show labels",
		showLabelsHelp: "Off: labels are only used as tooltips and for screen readers.",
		showCounts: "Show counts",
		showCountsHelp: "Off: counts are hidden on your site and left out of the public API.",
	},
	ja: {
		statPosts: "リアクションされた記事",
		statVotes: "投票数（現在有効）",
		statButtons: "ボタン",
		topHeader: "よく押された記事 Top 10",
		empty: "まだリアクションはありません",
		total: "合計",
		updated: "最終",
		settingsHeader: "ボタンの設定",
		help: "書式: key=絵文字:ラベル をカンマ区切り（最大6個）。keyは英小文字で始める。key を消すとそのボタンは非表示になりますが、集計値は残ります。",
		fieldLabel: "リアクション",
		save: "保存",
		saved: "保存しました",
		invalid: "有効なボタンがありません。書式を確認してください",
		showLabels: "ラベルを表示",
		showLabelsHelp: "オフ: ラベルはツールチップと読み上げにだけ使います。",
		showCounts: "件数を表示",
		showCountsHelp: "オフ: サイトに件数を出さず、公開APIにも含めません。",
	},
} as const;

type Messages = (typeof MESSAGES)[keyof typeof MESSAGES];

function messagesFor(locale: string | undefined): Messages {
	return locale?.toLowerCase().startsWith("ja") ? MESSAGES.ja : MESSAGES.en;
}

async function renderAdmin(ctx: PluginContext, t: Messages): Promise<BlockResponse> {
	const { spec, defs } = await loadReactions(ctx);
	const display = await loadDisplay(ctx);
	const top = await ctx.storage.counts.query({ orderBy: { total: "desc" }, limit: 10 });
	const totalDocs = await ctx.storage.counts.count();
	const totalVotes = await ctx.storage.votes.count();

	return {
		blocks: [
			{ type: "header", text: "Reactions" },
			{
				type: "stats",
				items: [
					{ label: t.statPosts, value: totalDocs },
					{ label: t.statVotes, value: totalVotes },
					{ label: t.statButtons, value: defs.map((d) => d.emoji).join(" ") },
				],
			},
			{ type: "divider" },
			{ type: "header", text: t.topHeader },
			{
				type: "table",
				page_action_id: "ranking_page",
				empty_text: t.empty,
				columns: [
					{ key: "contentId", label: "contentId", format: "code" },
					...defs.map((d) => ({ key: d.key, label: d.emoji, format: "number" as const })),
					{ key: "total", label: t.total, format: "number" },
					{ key: "updatedAt", label: t.updated, format: "relative_time" },
				],
				rows: top.items.map(({ data }) => {
					const doc = data as CountsDoc;
					const row: Record<string, unknown> = {
						contentId: doc.contentId,
						total: doc.total,
						updatedAt: doc.updatedAt,
					};
					for (const d of defs) row[d.key] = Number(doc[field(d.key)] ?? 0);
					return row;
				}),
			},
			{ type: "divider" },
			{ type: "header", text: t.settingsHeader },
			{
				type: "context",
				text: t.help,
			},
			{
				type: "form",
				block_id: "settings",
				fields: [
					{
						type: "text_input",
						action_id: "spec",
						label: t.fieldLabel,
						placeholder: DEFAULT_SPEC,
						initial_value: spec,
					},
					{
						type: "toggle",
						action_id: "showLabels",
						label: t.showLabels,
						description: t.showLabelsHelp,
						initial_value: display.labels,
					},
					{
						type: "toggle",
						action_id: "showCounts",
						label: t.showCounts,
						description: t.showCountsHelp,
						initial_value: display.counts,
					},
				],
				submit: { label: t.save, action_id: "save" },
			},
		],
	};
}

// ---------- プラグイン本体 ----------

const plugin: SandboxedPlugin = {
	routes: {
		/** 記事の現在の集計と「自分が押したもの」を返す */
		state: {
			public: true,
			methods: ["GET"],
			request: { body: "none" },
			handler: async (routeCtx, ctx) => {
				const parsed = stateInput.safeParse(routeCtx.input);
				if (!parsed.success) return { ok: false, error: "INVALID_INPUT" };
				const { contentId, visitorId } = parsed.data;

				const { defs } = await loadReactions(ctx);
				const display = await loadDisplay(ctx);
				const doc = (await ctx.storage.counts.get(contentId)) as CountsDoc | null;
				const voter = await voterHash(ctx, routeCtx.requestMeta as Meta, visitorId);
				const vote = voter
					? ((await ctx.storage.votes.get(`${contentId}:${voter}`)) as VoteDoc | null)
					: null;
				return { ok: true, ...shape(defs, display, doc, vote?.reaction ?? null) };
			},
		},

		/**
		 * リアクションを押す。
		 *  - 未投票        → そのリアクションに +1
		 *  - 同じものを再度 → 取り消し（-1）
		 *  - 別のもの      → 付け替え（旧 -1 / 新 +1）
		 */
		react: {
			public: true,
			methods: ["POST"],
			request: { body: "json", maxBytes: 1024 },
			handler: async (routeCtx, ctx) => {
				const parsed = reactInput.safeParse(routeCtx.input);
				if (!parsed.success) return { ok: false, error: "INVALID_INPUT" };
				const { contentId, reaction, visitorId } = parsed.data;

				const { defs } = await loadReactions(ctx);
				if (!defs.some((d) => d.key === reaction)) return { ok: false, error: "UNKNOWN_REACTION" };

				const voter = await voterHash(ctx, routeCtx.requestMeta as Meta, visitorId);
				if (!voter) return { ok: false, error: "NO_VOTER" };

				const votes = ctx.storage.votes;
				const voteId = `${contentId}:${voter}`;
				const now = new Date().toISOString();
				const current = await votes.getVersioned(voteId);
				const prev = (current?.value as VoteDoc | undefined)?.reaction ?? null;

				let mine: string | null;
				let deltas: Record<string, number>;

				if (!current) {
					const r = await votes.compareAndSet(voteId, null, { contentId, reaction, updatedAt: now });
					if (!r.applied) return { ok: false, error: "CONFLICT" };
					mine = reaction;
					deltas = { [reaction]: 1 };
				} else if (prev === reaction) {
					const r = await votes.compareAndDelete(voteId, current.revision);
					if (!r.applied) return { ok: false, error: "CONFLICT" };
					mine = null;
					deltas = { [reaction]: -1 };
				} else {
					const r = await votes.compareAndSet(voteId, current.revision, {
						contentId,
						reaction,
						updatedAt: now,
					});
					if (!r.applied) return { ok: false, error: "CONFLICT" };
					mine = reaction;
					deltas = prev ? { [prev]: -1, [reaction]: 1 } : { [reaction]: 1 };
				}

				const doc = await applyDelta(ctx, contentId, deltas);
				return { ok: true, ...shape(defs, await loadDisplay(ctx), doc, mine) };
			},
		},

		/** 管理画面（Block Kit） */
		admin: {
			handler: async (routeCtx, ctx) => {
				const parsed = adminInteraction.safeParse(routeCtx.input);
				if (!parsed.success) return { blocks: [] };
				const it = parsed.data;
				const t = messagesFor(routeCtx.ui?.locale);

				if (it.type === "form_submit" && it.action_id === "save") {
					const defs = parseSpec(it.values.spec);
					if (defs.length === 0) {
						return {
							...(await renderAdmin(ctx, t)),
							toast: { message: t.invalid, type: "error" },
						};
					}
					const normalized = defs.map((d) => `${d.key}=${d.emoji}:${d.label}`).join(", ");
					await ctx.settings.set("spec", normalized);
					if (it.values.showLabels !== undefined) await ctx.settings.set("showLabels", it.values.showLabels);
					if (it.values.showCounts !== undefined) await ctx.settings.set("showCounts", it.values.showCounts);
					return { ...(await renderAdmin(ctx, t)), toast: { message: t.saved, type: "success" } };
				}
				return renderAdmin(ctx, t);
			},
		},
	},
};

export default plugin;
