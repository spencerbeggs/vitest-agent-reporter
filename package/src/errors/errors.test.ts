/**
 * vitest-agent-reporter
 *
 * Tests for Effect Data.TaggedError types.
 */

import { describe, expect, it } from "vitest";
import { DataStoreError, extractSqlReason } from "./DataStoreError.js";
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

	it("derives a message from operation, path, and reason", () => {
		const err = new DiscoveryError({ operation: "stat", path: "/tmp/file", reason: "ENOENT" });
		expect(err.message).toBe("[stat /tmp/file] ENOENT");
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

	it("derives a message from operation, table, and reason", () => {
		const err = new DataStoreError({
			operation: "write",
			table: "test_history",
			reason: "UNIQUE constraint failed: test_history.full_name",
		});
		expect(err.message).toBe("[write test_history] UNIQUE constraint failed: test_history.full_name");
	});

	it("preserves field access on instance", () => {
		const err = new DataStoreError({ operation: "write", table: "files", reason: "disk full" });
		expect(err.operation).toBe("write");
		expect(err.table).toBe("files");
		expect(err.reason).toBe("disk full");
	});
});

describe("extractSqlReason", () => {
	it("returns cause.message for an Effect SqlError-shaped error", () => {
		const err = { message: "Failed to execute statement", cause: { message: "SQLITE_BUSY: database is locked" } };
		expect(extractSqlReason(err)).toBe("SQLITE_BUSY: database is locked");
	});

	it("falls back to message when cause is missing", () => {
		const err = { message: "Failed to execute statement" };
		expect(extractSqlReason(err)).toBe("Failed to execute statement");
	});

	it("returns string cause directly", () => {
		expect(extractSqlReason({ cause: "raw cause string" })).toBe("raw cause string");
	});

	it("falls back to String(e) when nothing useful is available", () => {
		expect(extractSqlReason("plain string")).toBe("plain string");
		expect(extractSqlReason(42)).toBe("42");
		expect(extractSqlReason(null)).toBe("null");
	});

	it("ignores empty messages", () => {
		const err = { message: "" };
		expect(extractSqlReason(err)).toBe("[object Object]");
	});
});
