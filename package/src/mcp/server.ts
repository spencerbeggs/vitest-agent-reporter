import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import type { McpContext } from "./context.js";
import { createCallerFactory } from "./context.js";
import { appRouter } from "./router.js";

function textResult(text: string) {
	return { content: [{ type: "text" as const, text }] };
}

function jsonResult(value: unknown) {
	return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

export async function startMcpServer(ctx: McpContext): Promise<void> {
	const server = new McpServer({
		name: "vitest-agent-reporter",
		version: "0.1.0",
	});

	const factory = createCallerFactory(appRouter);
	const caller = factory(ctx);

	// ── Read-only tools (queries returning markdown) ────────────────────

	server.registerTool(
		"test_status",
		{
			description: "Per-project test pass/fail state from the most recent run",
			inputSchema: {
				project: z.optional(z.string()).describe("Filter to a specific project"),
			},
		},
		async (args) => textResult(await caller.test_status({ project: args.project })),
	);

	server.registerTool(
		"test_overview",
		{
			description: "Test landscape summary with per-project run metrics",
			inputSchema: {
				project: z.optional(z.string()).describe("Filter to a specific project"),
			},
		},
		async (args) => textResult(await caller.test_overview({ project: args.project })),
	);

	server.registerTool(
		"test_coverage",
		{
			description: "Coverage gap analysis with per-metric thresholds and targets",
			inputSchema: {
				project: z.optional(z.string()).describe("Project name"),
				subProject: z.optional(z.string()).describe("Sub-project name"),
			},
		},
		async (args) =>
			textResult(
				await caller.test_coverage({
					project: args.project,
					subProject: args.subProject,
				}),
			),
	);

	server.registerTool(
		"test_history",
		{
			description: "Flaky tests, persistent failures, and recovered tests with run visualization",
			inputSchema: {
				project: z.string().describe("Project name (required)"),
				subProject: z.optional(z.string()).describe("Sub-project name"),
			},
		},
		async (args) =>
			textResult(
				await caller.test_history({
					project: args.project,
					subProject: args.subProject,
				}),
			),
	);

	server.registerTool(
		"test_trends",
		{
			description: "Per-project coverage trend with direction, metrics, and sparkline trajectory",
			inputSchema: {
				project: z.string().describe("Project name (required)"),
				subProject: z.optional(z.string()).describe("Sub-project name"),
				limit: z.optional(z.number()).describe("Max number of trend entries to return"),
			},
		},
		async (args) =>
			textResult(
				await caller.test_trends({
					project: args.project,
					subProject: args.subProject,
					limit: args.limit,
				}),
			),
	);

	server.registerTool(
		"test_errors",
		{
			description: "Detailed test errors with diffs and stack traces for a project",
			inputSchema: {
				project: z.string().describe("Project name (required)"),
				subProject: z.optional(z.nullable(z.string())).describe("Sub-project name"),
				errorName: z.optional(z.string()).describe("Filter to a specific error name"),
			},
		},
		async (args) =>
			textResult(
				await caller.test_errors({
					project: args.project,
					subProject: args.subProject,
					errorName: args.errorName,
				}),
			),
	);

	server.registerTool(
		"test_for_file",
		{
			description: "Find test modules that cover a given source file",
			inputSchema: {
				filePath: z.string().describe("Source file path to find tests for"),
			},
		},
		async (args) =>
			textResult(
				await caller.test_for_file({
					filePath: args.filePath,
				}),
			),
	);

	server.registerTool(
		"configure",
		{
			description: "View captured Vitest settings for a test run",
			inputSchema: {
				settingsHash: z.optional(z.string()).describe("Settings hash from a manifest entry or test run"),
			},
		},
		async (args) =>
			textResult(
				await caller.configure({
					settingsHash: args.settingsHash,
				}),
			),
	);

	server.registerTool(
		"cache_health",
		{
			description: "Cache health diagnostic: manifest presence, project states, staleness",
		},
		async () => textResult(await caller.cache_health()),
	);

	// ── Mutation tools (return JSON) ────────────────────────────────────

	server.registerTool(
		"run_tests",
		{
			description: "Run Vitest tests with optional file and project filters",
			inputSchema: {
				files: z.optional(z.array(z.string())).describe("Test file paths to run"),
				project: z.optional(z.string()).describe("Project name to filter"),
				timeout: z.optional(z.number()).describe("Timeout in seconds (default: 120)"),
			},
		},
		async (args) =>
			jsonResult(
				await caller.run_tests({
					files: args.files,
					project: args.project,
					timeout: args.timeout,
				}),
			),
	);

	// ── Note CRUD tools ─────────────────────────────────────────────────

	server.registerTool(
		"note_create",
		{
			description: "Create a scoped note (global, project, module, suite, test, or free-form)",
			inputSchema: {
				title: z.string().describe("Note title"),
				content: z.string().describe("Note content (markdown supported)"),
				scope: z.enum(["global", "project", "module", "suite", "test", "note"]).describe("Note scope"),
				project: z.optional(z.string()).describe("Project name (for project/module/suite/test scopes)"),
				subProject: z.optional(z.string()).describe("Sub-project name"),
				testFullName: z.optional(z.string()).describe("Full test name (for test scope)"),
				modulePath: z.optional(z.string()).describe("Module file path (for module scope)"),
				parentNoteId: z.optional(z.number()).describe("Parent note ID for threading"),
				createdBy: z.optional(z.string()).describe("Creator identifier"),
				expiresAt: z.optional(z.string()).describe("ISO 8601 expiration timestamp"),
				pinned: z.optional(z.boolean()).describe("Pin the note"),
			},
		},
		async (args) => jsonResult(await caller.note_create(args)),
	);

	server.registerTool(
		"note_list",
		{
			description: "List notes with optional scope, project, and test filters",
			inputSchema: {
				scope: z.optional(z.string()).describe("Filter by scope"),
				project: z.optional(z.string()).describe("Filter by project"),
				testFullName: z.optional(z.string()).describe("Filter by test full name"),
			},
		},
		async (args) => jsonResult(await caller.note_list(args)),
	);

	server.registerTool(
		"note_get",
		{
			description: "Get a specific note by ID",
			inputSchema: {
				id: z.number().describe("Note ID"),
			},
		},
		async (args) => jsonResult(await caller.note_get({ id: args.id })),
	);

	server.registerTool(
		"note_update",
		{
			description: "Update an existing note's title, content, pin state, or expiration",
			inputSchema: {
				id: z.number().describe("Note ID to update"),
				title: z.optional(z.string()).describe("New title"),
				content: z.optional(z.string()).describe("New content"),
				pinned: z.optional(z.boolean()).describe("Pin or unpin"),
				expiresAt: z.optional(z.string()).describe("New expiration (ISO 8601)"),
			},
		},
		async (args) => jsonResult(await caller.note_update(args)),
	);

	server.registerTool(
		"note_delete",
		{
			description: "Delete a note by ID",
			inputSchema: {
				id: z.number().describe("Note ID to delete"),
			},
		},
		async (args) => jsonResult(await caller.note_delete({ id: args.id })),
	);

	server.registerTool(
		"note_search",
		{
			description: "Full-text search across note titles and content",
			inputSchema: {
				query: z.string().describe("Search query"),
			},
		},
		async (args) => jsonResult(await caller.note_search({ query: args.query })),
	);

	const transport = new StdioServerTransport();
	await server.connect(transport);
}
