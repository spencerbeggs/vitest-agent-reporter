import { describe, expect, it } from "vitest";
import { parseAndValidateTurnPayload } from "./record-turn.js";

describe("parseAndValidateTurnPayload", () => {
	it("accepts a valid user_prompt payload", () => {
		const result = parseAndValidateTurnPayload(JSON.stringify({ type: "user_prompt", prompt: "hello" }));
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.payload.type).toBe("user_prompt");
		}
	});

	it("accepts a valid hook_fire payload", () => {
		const result = parseAndValidateTurnPayload(JSON.stringify({ type: "hook_fire", hook_kind: "PreCompact" }));
		expect(result.ok).toBe(true);
	});

	it("accepts a valid file_edit payload", () => {
		const result = parseAndValidateTurnPayload(
			JSON.stringify({ type: "file_edit", file_path: "/tmp/x.ts", edit_kind: "edit" }),
		);
		expect(result.ok).toBe(true);
	});

	it("rejects malformed JSON", () => {
		const result = parseAndValidateTurnPayload("{not json");
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toMatch(/JSON/i);
		}
	});

	it("rejects payload with unknown type discriminator", () => {
		const result = parseAndValidateTurnPayload(JSON.stringify({ type: "wat", foo: "bar" }));
		expect(result.ok).toBe(false);
	});

	it("rejects payload missing required field for its variant", () => {
		const result = parseAndValidateTurnPayload(JSON.stringify({ type: "user_prompt" /* missing prompt */ }));
		expect(result.ok).toBe(false);
	});
});
