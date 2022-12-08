import {IDriverAlias} from "@sqltools/types";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const {displayName} = require("../package.json");

/**
 * Aliases for yout driver. EG: PostgreSQL, PG, postgres can all resolve to your driver
 */
export const DRIVER_ALIASES: IDriverAlias[] = [
    {displayName, value: displayName},
];
