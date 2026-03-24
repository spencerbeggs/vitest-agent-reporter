import { router } from "./context.js";
import { cacheHealth } from "./tools/cache-health.js";
import { configure } from "./tools/configure.js";
import { testCoverage } from "./tools/coverage.js";
import { testErrors } from "./tools/errors.js";
import { testHistory } from "./tools/history.js";
import { noteCreate, noteDelete, noteGet, noteList, noteSearch, noteUpdate } from "./tools/notes.js";
import { testOverview } from "./tools/overview.js";
import { runTests } from "./tools/run-tests.js";
import { testStatus } from "./tools/status.js";
import { testForFile } from "./tools/test-for-file.js";
import { testTrends } from "./tools/trends.js";

export const appRouter = router({
	test_status: testStatus,
	test_overview: testOverview,
	test_coverage: testCoverage,
	test_history: testHistory,
	test_trends: testTrends,
	test_errors: testErrors,
	test_for_file: testForFile,
	run_tests: runTests,
	cache_health: cacheHealth,
	configure: configure,
	note_create: noteCreate,
	note_list: noteList,
	note_get: noteGet,
	note_update: noteUpdate,
	note_delete: noteDelete,
	note_search: noteSearch,
});

export type AppRouter = typeof appRouter;
