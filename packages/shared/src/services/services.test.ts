/**
 * vitest-agent-reporter-shared
 *
 * Tests for Effect Context.Tag service definitions provided by the shared
 * package. CoverageAnalyzer lives in the reporter package and is tested
 * there.
 */

import { Context } from "effect";
import { describe, expect, it } from "vitest";
import { DataReader } from "./DataReader.js";
import { DataStore } from "./DataStore.js";
import { EnvironmentDetector } from "./EnvironmentDetector.js";
import { ProjectDiscovery } from "./ProjectDiscovery.js";

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

describe("ProjectDiscovery", () => {
	it("is a valid Context.Tag", () => {
		expect(ProjectDiscovery).toBeDefined();
		expect(Context.isTag(ProjectDiscovery)).toBe(true);
	});
});
