import { Schema } from "effect";

/**
 * Accepts both a JavaScript number and a numeric string.
 *
 * The MCP protocol transmits integer literals as strings in some contexts
 * (confirmed in Claude Code debug logs). Using Schema.Number alone rejects
 * those calls with "expected number, received string". This union tries the
 * native number branch first, then falls through to NumberFromString so
 * agents can pass either form without error.
 */
export const CoercedNumber = Schema.Union(Schema.Number, Schema.NumberFromString);
