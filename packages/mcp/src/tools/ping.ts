import { publicProcedure } from "../context.js";

export const ping = publicProcedure.query(async () => {
	return "pong";
});
