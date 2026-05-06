/**
 * Minimal source file used by the dogfood lifecycle test.
 *
 * @remarks
 * Exists so `lifecycle.test.ts` can import a real function, giving the
 * post-tool-use artifact hook a genuine file_edit → test_case linkage to
 * backfill `test_cases.created_turn_id`. Without an import, the `test_case`
 * row has no associated source file and `test_case_authored_in_session`
 * resolves to false, blocking the `red→green` phase transition.
 *
 * Do not delete — `lifecycle.test.ts` is ephemeral (created and removed by
 * each `/dogfood --lifecycle` run), but this file must persist between runs.
 */

export function sum(a: number, b: number): number {
	return a + b + 1;
}
