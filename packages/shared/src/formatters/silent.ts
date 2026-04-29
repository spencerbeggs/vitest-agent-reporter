import type { Formatter } from "./types.js";

export const SilentFormatter: Formatter = {
	format: "silent",
	render: () => [],
};
