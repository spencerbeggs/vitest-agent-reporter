import { describe, expect, it } from "vitest";
import { idempotencyKeys } from "./idempotency.js";

// ---------------------------------------------------------------------------
// Key derivation tests (pure logic, no I/O)
// ---------------------------------------------------------------------------

describe("idempotency key derivation", () => {
	const spec = (path: string) => {
		const s = idempotencyKeys.find((k) => k.procedurePath === path);
		if (!s) throw new Error(`No idempotency spec registered for "${path}"`);
		return s;
	};

	describe("hypothesis_record", () => {
		const { deriveKey } = spec("hypothesis_record");

		it("derives key as sessionId:content", () => {
			const key = deriveKey({ sessionId: 42, content: "my hypothesis" });
			expect(key).toBe("42:my hypothesis");
		});

		it("returns null for invalid input", () => {
			expect(deriveKey(null)).toBeNull();
			expect(deriveKey({ sessionId: "not-a-number", content: "x" })).toBeNull();
			expect(deriveKey({ sessionId: 1 })).toBeNull();
		});
	});

	describe("hypothesis_validate", () => {
		const { deriveKey } = spec("hypothesis_validate");

		it("derives key as id:outcome", () => {
			const key = deriveKey({ id: 7, outcome: "confirmed" });
			expect(key).toBe("7:confirmed");
		});

		it("returns null for invalid input", () => {
			expect(deriveKey(null)).toBeNull();
			expect(deriveKey({ id: "not-a-number", outcome: "confirmed" })).toBeNull();
			expect(deriveKey({ id: 1 })).toBeNull();
		});
	});
});
