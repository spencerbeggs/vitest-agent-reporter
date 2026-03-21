/**
 * vitest-agent-reporter
 *
 * Tests for Effect Context.Tag service definitions.
 */

import { Context } from "effect";
import { describe, expect, it } from "vitest";
import { AgentDetection } from "./AgentDetection.js";
import { CacheReader } from "./CacheReader.js";
import { CacheWriter } from "./CacheWriter.js";
import { CoverageAnalyzer } from "./CoverageAnalyzer.js";
import { ProjectDiscovery } from "./ProjectDiscovery.js";

describe("Service tags", () => {
	it("AgentDetection is a valid Context.Tag", () => {
		expect(AgentDetection).toBeDefined();
		expect(Context.isTag(AgentDetection)).toBe(true);
	});

	it("CacheReader is a valid Context.Tag", () => {
		expect(CacheReader).toBeDefined();
		expect(Context.isTag(CacheReader)).toBe(true);
	});

	it("CacheWriter is a valid Context.Tag", () => {
		expect(CacheWriter).toBeDefined();
		expect(Context.isTag(CacheWriter)).toBe(true);
	});

	it("CoverageAnalyzer is a valid Context.Tag", () => {
		expect(CoverageAnalyzer).toBeDefined();
		expect(Context.isTag(CoverageAnalyzer)).toBe(true);
	});

	it("ProjectDiscovery is a valid Context.Tag", () => {
		expect(ProjectDiscovery).toBeDefined();
		expect(Context.isTag(ProjectDiscovery)).toBe(true);
	});
});
