/**
 * vitest-agent-reporter
 *
 * Tests for Effect Data.TaggedError types.
 */

import { describe, expect, it } from "vitest";
import { DataStoreError } from "./DataStoreError.js";
import { DiscoveryError } from "./DiscoveryError.js";

describe("DiscoveryError", () => {
	it("constructs with glob operation", () => {
		const err = new DiscoveryError({ operation: "glob", path: "/project", reason: "pattern invalid" });
		expect(err._tag).toBe("DiscoveryError");
		expect(err.operation).toBe("glob");
		expect(err.path).toBe("/project");
		expect(err.reason).toBe("pattern invalid");
	});

	it("constructs with read operation", () => {
		const err = new DiscoveryError({ operation: "read", path: "/project/src", reason: "ENOENT" });
		expect(err._tag).toBe("DiscoveryError");
		expect(err.operation).toBe("read");
	});

	it("constructs with stat operation", () => {
		const err = new DiscoveryError({ operation: "stat", path: "/project/src/file.ts", reason: "ENOENT" });
		expect(err._tag).toBe("DiscoveryError");
		expect(err.operation).toBe("stat");
	});

	it("is an instance of Error", () => {
		const err = new DiscoveryError({ operation: "glob", path: "/tmp", reason: "fail" });
		expect(err).toBeInstanceOf(Error);
	});
});

describe("DataStoreError", () => {
	it("is a tagged error with correct tag", () => {
		const error = new DataStoreError({
			operation: "write",
			table: "test_runs",
			reason: "SQLITE_CONSTRAINT",
		});
		expect(error._tag).toBe("DataStoreError");
		expect(error.operation).toBe("write");
		expect(error.table).toBe("test_runs");
		expect(error.reason).toBe("SQLITE_CONSTRAINT");
	});

	it("supports read and migrate operations", () => {
		const read = new DataStoreError({ operation: "read", table: "test_cases", reason: "not found" });
		const migrate = new DataStoreError({ operation: "migrate", table: "schema", reason: "failed" });
		expect(read.operation).toBe("read");
		expect(migrate.operation).toBe("migrate");
	});
});
