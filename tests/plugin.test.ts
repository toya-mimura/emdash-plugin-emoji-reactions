import { afterEach, describe, expect, it } from "vitest";

import {
	createPluginRuntimeTestHost,
	createPluginTestHost,
	type PluginRuntimeTestHost,
	type PluginTestHost,
} from "@emdash-cms/plugin-test";

let host: PluginTestHost | undefined;
let runtime: PluginRuntimeTestHost | undefined;

afterEach(async () => {
	await host?.dispose();
	host = undefined;
	await runtime?.dispose();
	runtime = undefined;
});

const reader = (ip: string) => ({
	method: "POST",
	meta: { ip, userAgent: "vitest", referer: null, geo: null },
});

type State = {
	ok: boolean;
	error?: string;
	reactions: Array<{ key: string; emoji: string; label: string; count: number }>;
	total: number;
	mine: string | null;
};

const count = (s: State, key: string) => s.reactions.find((r) => r.key === key)?.count;

describe("reactions", () => {
	it("returns default buttons with zero counts", async () => {
		host = await createPluginTestHost();
		const s = (await host.invokeRoute(
			"state",
			{ contentId: "post-1" },
			{ ...reader("1.1.1.1"), method: "GET" },
		)) as State;
		expect(s.ok).toBe(true);
		expect(s.reactions.map((r) => r.emoji)).toEqual(["💗", "🤔", "😗"]);
		expect(s.reactions.map((r) => r.label)).toEqual(["Love", "Hmm", "Whoa"]);
		expect(s.total).toBe(0);
		expect(s.mine).toBeNull();
	});

	it("allows one reaction per reader: add, switch, and toggle off", async () => {
		host = await createPluginTestHost();

		let s = (await host.invokeRoute("react", { contentId: "post-1", reaction: "love" }, reader("1.1.1.1"))) as State;
		expect(s.mine).toBe("love");
		expect(count(s, "love")).toBe(1);

		// 別の読者
		s = (await host.invokeRoute("react", { contentId: "post-1", reaction: "love" }, reader("2.2.2.2"))) as State;
		expect(count(s, "love")).toBe(2);
		expect(s.total).toBe(2);

		// 1人目が付け替え
		s = (await host.invokeRoute("react", { contentId: "post-1", reaction: "hmm" }, reader("1.1.1.1"))) as State;
		expect(s.mine).toBe("hmm");
		expect(count(s, "love")).toBe(1);
		expect(count(s, "hmm")).toBe(1);
		expect(s.total).toBe(2);

		// 同じボタンをもう一度 → 取り消し
		s = (await host.invokeRoute("react", { contentId: "post-1", reaction: "hmm" }, reader("1.1.1.1"))) as State;
		expect(s.mine).toBeNull();
		expect(count(s, "hmm")).toBe(0);
		expect(s.total).toBe(1);

		// 状態取得でも自分の選択が見える
		const st = (await host.invokeRoute(
			"state",
			{ contentId: "post-1" },
			{ ...reader("2.2.2.2"), method: "GET" },
		)) as State;
		expect(st.mine).toBe("love");

		// IPは保存されない
		const votes = await host.storage("votes").list();
		expect(JSON.stringify(votes)).not.toContain("2.2.2.2");
		expect(votes).toHaveLength(1);
	});

	it("rejects unknown reactions and bad input", async () => {
		host = await createPluginTestHost();
		const bad = (await host.invokeRoute("react", { contentId: "post-1", reaction: "angry" }, reader("1.1.1.1"))) as State;
		expect(bad).toMatchObject({ ok: false, error: "UNKNOWN_REACTION" });
		const bad2 = (await host.invokeRoute("react", { contentId: "../../x y", reaction: "love" }, reader("1.1.1.1"))) as State;
		expect(bad2).toMatchObject({ ok: false, error: "INVALID_INPUT" });
	});

	it("saves custom buttons from the admin page", async () => {
		host = await createPluginTestHost();
		const page = (await host.invokeRoute("admin", { type: "page_load", page: "/reactions" })) as { blocks: unknown[] };
		expect(page.blocks.length).toBeGreaterThan(0);

		const saved = (await host.invokeRoute("admin", {
			type: "form_submit",
			action_id: "save",
			values: { spec: "fire=🔥:アツい, BAD KEY=x, cry=😭" },
		})) as { toast?: { type: string } };
		expect(saved.toast?.type).toBe("success");

		const s = (await host.invokeRoute(
			"state",
			{ contentId: "post-9" },
			{ ...reader("3.3.3.3"), method: "GET" },
		)) as State;
		expect(s.reactions.map((r) => r.key)).toEqual(["fire", "cry"]);
	});

	it("renders the admin page in the admin locale", async () => {
		runtime = await createPluginRuntimeTestHost();
		const en = JSON.stringify(await runtime.admin.loadPage("/reactions", { locale: "en" }));
		expect(en).toContain("Top 10 posts");
		const ja = JSON.stringify(await runtime.admin.loadPage("/reactions", { locale: "ja" }));
		expect(ja).toContain("よく押された記事 Top 10");
	});
});
