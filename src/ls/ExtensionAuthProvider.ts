import IAuthentication from "@databricks/sql/dist/connection/contracts/IAuthentication";
import ITransport from "@databricks/sql/dist/connection/contracts/ITransport";
import {buildUserAgentString} from "@databricks/sql/dist/utils";
import {DatabricksCommandsClient} from "../DatabricksCommands";
import {Headers} from "../types";

export class ExtensionAuthProvider implements IAuthentication {
    private headers: Headers;

    constructor(
        private dbCommands: DatabricksCommandsClient,
        clientId: string
    ) {
        this.headers = {};
        this.headers["User-Agent"] = buildUserAgentString(clientId);
    }

    async authenticate(transport: ITransport): Promise<ITransport> {
        transport.setOptions(
            "headers",
            await this.dbCommands.authenticate(this.headers)
        );

        return transport;
    }
}
