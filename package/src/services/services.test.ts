/**
 * vitest-agent-reporter
 *
 * Tests for Effect Context.Tag service definitions.
 */

import { Context } from "effect";
import { describe, expect, it } from "vitest";
import { CoverageAnalyzer } from "./CoverageAnalyzer.js";
import { DataReader } from "./DataReader.js";
import { DataStore } from "./DataStore.js";
import { EnvironmentDetector } from "./EnvironmentDetector.js";
import { ProjectDiscovery } from "./ProjectDiscovery.js";

describe("Service tags", () => {
	it("CoverageAnalyzer is a valid Context.Tag", () => {
		expect(CoverageAnalyzer).toBeDefined();
		expect(Context.isTag(CoverageAnalyzer)).toBe(true);
	});

	it("ProjectDiscovery is a valid Context.Tag", () => {
		expect(ProjectDiscovery).toBeDefined();
		expect(Context.isTag(ProjectDiscovery)).toBe(true);
	});
});

describe("DataStore", () => {
	it("is a Context.Tag", () => {
		expect(DataStore.key).toBe("vitest-agent-reporter/DataStore");
	});
});

describe("DataReader", () => {
	it("is a Context.Tag", () => {
		expect(DataReader.key).toBe("vitest-agent-reporter/DataReader");
	});
});

describe("EnvironmentDetector", () => {
	it("is a Context.Tag", () => {
		expect(EnvironmentDetector.key).toBe("vitest-agent-reporter/EnvironmentDetector");
	});
});
