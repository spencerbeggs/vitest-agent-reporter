import { describe, expect, it } from "vitest";
import { AgentReportCodec, AgentReportSchema, CacheManifestCodec, CacheManifestSchema } from "./schemas.js";

const sampleReport = {
	timestamp: "2026-03-20T00:00:00.000Z",
	reason: "passed" as const,
	summary: { total: 5, passed: 5, failed: 0, skipped: 0, duration: 120 },
	failed: [],
	unhandledErrors: [],
	failedFiles: [],
};

const sampleManifest = {
	updatedAt: "2026-03-20T00:00:00.000Z",
	cacheDir: ".vitest-agent-reporter",
	projects: [
		{
			project: "core",
			reportFile: "reports/core.json",
			lastRun: "2026-03-20T00:00:00.000Z",
			lastResult: "passed" as const,
		},
	],
};

describe("AgentReportSchema", () => {
	it("parses a valid report", () => {
		const result = AgentReportSchema.safeParse(sampleReport);
		expect(result.success).toBe(true);
	});

	it("rejects invalid reason", () => {
		const result = AgentReportSchema.safeParse({ ...sampleReport, reason: "unknown" });
		expect(result.success).toBe(false);
	});

	it("accepts optional coverage", () => {
		const withCoverage = {
			...sampleReport,
			coverage: {
				totals: { statements: 90, branches: 85, functions: 88, lines: 91 },
				threshold: 80,
				lowCoverage: [],
				lowCoverageFiles: [],
			},
		};
		const result = AgentReportSchema.safeParse(withCoverage);
		expect(result.success).toBe(true);
	});

	it("accepts optional project", () => {
		const withProject = { ...sampleReport, project: "core:unit" };
		const result = AgentReportSchema.safeParse(withProject);
		expect(result.success).toBe(true);
	});
});

describe("AgentReportCodec", () => {
	it("encodes a report to formatted JSON string", () => {
		const json = AgentReportCodec.encode(sampleReport);
		expect(typeof json).toBe("string");
		const parsed = JSON.parse(json);
		expect(parsed.reason).toBe("passed");
		expect(parsed.summary.total).toBe(5);
	});

	it("decodes a JSON string to a report", () => {
		const json = JSON.stringify(sampleReport);
		const report = AgentReportCodec.decode(json);
		expect(report.reason).toBe("passed");
		expect(report.summary.total).toBe(5);
	});

	it("roundtrips encode/decode", () => {
		const encoded = AgentReportCodec.encode(sampleReport);
		const decoded = AgentReportCodec.decode(encoded);
		expect(decoded.reason).toBe(sampleReport.reason);
		expect(decoded.summary).toEqual(sampleReport.summary);
	});

	it("throws on invalid JSON string", () => {
		expect(() => AgentReportCodec.decode("not json")).toThrow();
	});
});

describe("CacheManifestSchema", () => {
	it("parses a valid manifest", () => {
		const result = CacheManifestSchema.safeParse(sampleManifest);
		expect(result.success).toBe(true);
	});

	it("accepts null lastRun and lastResult", () => {
		const withNulls = {
			...sampleManifest,
			projects: [{ project: "core", reportFile: "reports/core.json", lastRun: null, lastResult: null }],
		};
		const result = CacheManifestSchema.safeParse(withNulls);
		expect(result.success).toBe(true);
	});
});

describe("CacheManifestCodec", () => {
	it("encodes a manifest to formatted JSON string", () => {
		const json = CacheManifestCodec.encode(sampleManifest);
		expect(typeof json).toBe("string");
		const parsed = JSON.parse(json);
		expect(parsed.cacheDir).toBe(".vitest-agent-reporter");
	});

	it("decodes a JSON string to a manifest", () => {
		const json = JSON.stringify(sampleManifest);
		const manifest = CacheManifestCodec.decode(json);
		expect(manifest.cacheDir).toBe(".vitest-agent-reporter");
		expect(manifest.projects).toHaveLength(1);
	});

	it("roundtrips encode/decode", () => {
		const encoded = CacheManifestCodec.encode(sampleManifest);
		const decoded = CacheManifestCodec.decode(encoded);
		expect(decoded).toEqual(sampleManifest);
	});
});
