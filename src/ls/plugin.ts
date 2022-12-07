import {ILanguageServerPlugin} from "@sqltools/types";
import {DatabricksDriver} from "./driver";
import {DRIVER_ALIASES} from "./../constants";

// eslint-disable-next-line @typescript-eslint/naming-convention
const DatabricksDriverPlugin: ILanguageServerPlugin = {
    register(server) {
        DRIVER_ALIASES.forEach(({value}) => {
            server.getContext().drivers.set(value, DatabricksDriver as any);
        });
    },
};

export default DatabricksDriverPlugin;
