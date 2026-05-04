/**
 * OSC-8 terminal hyperlink helper.
 *
 * Emits the modern terminal hyperlink escape sequence
 * (`\x1b]8;;<url>\x07<label>\x1b]8;;\x07`) when enabled. When
 * disabled (NO_COLOR set, output target is not stdout, or caller
 * explicitly opted out), returns the plain label.
 *
 * **Important:** this helper is for CLI/console output only. Do NOT
 * emit OSC-8 codes in MCP tool responses — they render as garbage in
 * the agent's context. The triage_brief and wrapup_prompt MCP tools
 * always pass `enabled: false`.
 *
 * @packageDocumentation
 */

export interface Osc8Options {
	readonly enabled: boolean;
}

const ESC = "\x1b";
const BEL = "\x07";

export const osc8 = (url: string, label: string, options: Osc8Options): string => {
	if (!options.enabled) return label;
	return `${ESC}]8;;${url}${BEL}${label}${ESC}]8;;${BEL}`;
};
