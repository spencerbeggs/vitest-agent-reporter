import { router } from "./context.js";
import { acceptanceMetrics } from "./tools/acceptance-metrics.js";
import { cacheHealth } from "./tools/cache-health.js";
import { configure } from "./tools/configure.js";
import { testCoverage } from "./tools/coverage.js";
import { testErrors } from "./tools/errors.js";
import { failureSignatureGet } from "./tools/failure-signature-get.js";
import { fileCoverage } from "./tools/file-coverage.js";
import { help } from "./tools/help.js";
import { testHistory } from "./tools/history.js";
import { hypothesisList } from "./tools/hypothesis-list.js";
import { moduleList } from "./tools/module-list.js";
import { noteCreate, noteDelete, noteGet, noteList, noteSearch, noteUpdate } from "./tools/notes.js";
import { testOverview } from "./tools/overview.js";
import { projectList } from "./tools/project-list.js";
import { runTests } from "./tools/run-tests.js";
import { sessionGet } from "./tools/session-get.js";
import { sessionList } from "./tools/session-list.js";
import { settingsList } from "./tools/settings-list.js";
import { testStatus } from "./tools/status.js";
import { suiteList } from "./tools/suite-list.js";
import { tddSessionGet } from "./tools/tdd-session-get.js";
import { testForFile } from "./tools/test-for-file.js";
import { testGet } from "./tools/test-get.js";
import { testList } from "./tools/test-list.js";
import { testTrends } from "./tools/trends.js";
import { turnSearch } from "./tools/turn-search.js";

export const appRouter = router({
	help: help,
	test_status: testStatus,
	test_overview: testOverview,
	test_coverage: testCoverage,
	test_history: testHistory,
	test_trends: testTrends,
	test_errors: testErrors,
	test_for_file: testForFile,
	test_get: testGet,
	file_coverage: fileCoverage,
	run_tests: runTests,
	cache_health: cacheHealth,
	configure: configure,
	project_list: projectList,
	test_list: testList,
	module_list: moduleList,
	suite_list: suiteList,
	settings_list: settingsList,
	note_create: noteCreate,
	note_list: noteList,
	note_get: noteGet,
	note_update: noteUpdate,
	note_delete: noteDelete,
	note_search: noteSearch,
	session_list: sessionList,
	session_get: sessionGet,
	turn_search: turnSearch,
	failure_signature_get: failureSignatureGet,
	tdd_session_get: tddSessionGet,
	hypothesis_list: hypothesisList,
	acceptance_metrics: acceptanceMetrics,
});

export type AppRouter = typeof appRouter;
