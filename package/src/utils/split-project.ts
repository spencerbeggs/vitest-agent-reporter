export interface ProjectIdentity {
	readonly project: string;
	readonly subProject: string | null;
}

export function splitProject(name: string | undefined): ProjectIdentity {
	if (!name) {
		return { project: "default", subProject: null };
	}
	const colonIndex = name.indexOf(":");
	if (colonIndex === -1) {
		return { project: name, subProject: null };
	}
	return {
		project: name.slice(0, colonIndex),
		subProject: name.slice(colonIndex + 1),
	};
}
