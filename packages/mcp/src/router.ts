import { router } from "./context.js";
import { acceptanceMetrics } from "./tools/acceptance-metrics.js";
import { cacheHealth } from "./tools/cache-health.js";
import { commitChanges } from "./tools/commit-changes.js";
import { configure } from "./tools/configure.js";
import { testCoverage } from "./tools/coverage.js";
import { getCurrentSessionId, setCurrentSessionId } from "./tools/current-session-id.js";
import { decomposeGoal } from "./tools/decompose-goal.js";
import { testErrors } from "./tools/errors.js";
import { failureSignatureGet } from "./tools/failure-signature-get.js";
import { fileCoverage } from "./tools/file-coverage.js";
import { help } from "./tools/help.js";
import { testHistory } from "./tools/history.js";
import { hypothesisList } from "./tools/hypothesis-list.js";
import { hypothesisRecord } from "./tools/hypothesis-record.js";
import { hypothesisValidate } from "./tools/hypothesis-validate.js";
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
import { tddPhaseTransitionRequest } from "./tools/tdd-phase-transition-request.js";
import { tddSessionEnd } from "./tools/tdd-session-end.js";
import { tddSessionGet } from "./tools/tdd-session-get.js";
import { tddSessionResume } from "./tools/tdd-session-resume.js";
import { tddSessionStart } from "./tools/tdd-session-start.js";
import { testForFile } from "./tools/test-for-file.js";
import { testGet } from "./tools/test-get.js";
import { testList } from "./tools/test-list.js";
import { testTrends } from "./tools/trends.js";
import { triageBrief } from "./tools/triage-brief.js";
import { turnSearch } from "./tools/turn-search.js";
import { wrapupPrompt } from "./tools/wrapup-prompt.js";

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
	tdd_session_start: tddSessionStart,
	tdd_session_end: tddSessionEnd,
	tdd_session_resume: tddSessionResume,
	tdd_phase_transition_request: tddPhaseTransitionRequest,
	decompose_goal_into_behaviors: decomposeGoal,
	hypothesis_list: hypothesisList,
	hypothesis_record: hypothesisRecord,
	hypothesis_validate: hypothesisValidate,
	acceptance_metrics: acceptanceMetrics,
	triage_brief: triageBrief,
	wrapup_prompt: wrapupPrompt,
	commit_changes: commitChanges,
	get_current_session_id: getCurrentSessionId,
	set_current_session_id: setCurrentSessionId,
});

export type AppRouter = typeof appRouter;
