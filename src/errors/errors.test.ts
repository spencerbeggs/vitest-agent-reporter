/**
 * vitest-agent-reporter
 *
 * Tests for Effect Data.TaggedError types.
 */

import { describe, expect, it } from "vitest";
import { CacheError } from "./CacheError.js";
import { DiscoveryError } from "./DiscoveryError.js";

describe("CacheError", () => {
	it("constructs with read operation", () => {
		const err = new CacheError({ operation: "read", path: "/tmp/cache/manifest.json", reason: "file not found" });
		expect(err._tag).toBe("CacheError");
		expect(err.operation).toBe("read");
		expect(err.path).toBe("/tmp/cache/manifest.json");
		expect(err.reason).toBe("file not found");
	});

	it("constructs with write operation", () => {
		const err = new CacheError({ operation: "write", path: "/tmp/cache/report.json", reason: "permission denied" });
		expect(err._tag).toBe("CacheError");
		expect(err.operation).toBe("write");
	});

	it("constructs with mkdir operation", () => {
		const err = new CacheError({ operation: "mkdir", path: "/tmp/cache", reason: "EACCES" });
		expect(err._tag).toBe("CacheError");
		expect(err.operation).toBe("mkdir");
	});

	it("is an instance of Error", () => {
		const err = new CacheError({ operation: "read", path: "/tmp", reason: "fail" });
		expect(err).toBeInstanceOf(Error);
	});
});

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
