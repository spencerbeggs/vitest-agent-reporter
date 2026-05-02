import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { suppressSqliteExperimentalWarning } from "./suppress-experimental-warnings.js";

// Reset the install-once flag and restore process.emit between tests.
// We reach into the module's own state to do this; the production API
// is intentionally idempotent and one-shot.
const originalEmit = process.emit;
let stubbedEmit: ReturnType<typeof vi.fn>;

beforeEach(() => {
	// Replace process.emit with a stub. The suppressor will wrap THIS
	// stub, so the test never delivers warnings to Node's real default
	// listener (which would write to stderr).
	stubbedEmit = vi.fn().mockReturnValue(true);
	(process as unknown as { emit: typeof process.emit }).emit = stubbedEmit as unknown as typeof process.emit;
});

afterEach(() => {
	(process as unknown as { emit: typeof process.emit }).emit = originalEmit;
});

describe("suppressSqliteExperimentalWarning", () => {
	it("swallows the SQLite ExperimentalWarning before reaching the underlying emitter", () => {
		suppressSqliteExperimentalWarning();
		const warning = Object.assign(new Error("SQLite is an experimental feature and might change at any time"), {
			name: "ExperimentalWarning",
		});
		const result = process.emit("warning", warning);
		expect(result).toBe(false);
		expect(stubbedEmit).not.toHaveBeenCalled();
	});

	it("forwards other ExperimentalWarning instances to the underlying emitter", () => {
		suppressSqliteExperimentalWarning();
		const warning = Object.assign(new Error("Fetch API is an experimental feature"), {
			name: "ExperimentalWarning",
		});
		process.emit("warning", warning);
		expect(stubbedEmit).toHaveBeenCalledTimes(1);
		expect(stubbedEmit).toHaveBeenCalledWith("warning", warning);
	});

	it("forwards non-warning events to the underlying emitter", () => {
		suppressSqliteExperimentalWarning();
		(process as unknown as { emit: (e: string, payload: unknown) => boolean }).emit("custom-event", { foo: 1 });
		expect(stubbedEmit).toHaveBeenCalledTimes(1);
		expect(stubbedEmit).toHaveBeenCalledWith("custom-event", { foo: 1 });
	});
});
