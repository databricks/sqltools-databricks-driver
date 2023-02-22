import {ILanguageServer, ILanguageServerPlugin} from "@sqltools/types";
import {DatabricksDriver} from "./driver";
import {DRIVER_ALIASES} from "./../constants";
import {DatabricksCommandsClient} from "../DatabricksCommands";

let dbCommands: DatabricksCommandsClient | undefined;

export function getDatabricksCommands(): DatabricksCommandsClient {
    if (!dbCommands) {
        throw new Error("DatabricksCommands not initialized");
    }
    return dbCommands;
}

// eslint-disable-next-line @typescript-eslint/naming-convention
const DatabricksDriverPlugin: ILanguageServerPlugin = {
    register(server: ILanguageServer) {
        dbCommands = new DatabricksCommandsClient(server);
        DRIVER_ALIASES.forEach(({value}) => {
            server.getContext().drivers.set(value, DatabricksDriver as any);
        });
    },
};

export default DatabricksDriverPlugin;
