import IAuthentication from "@databricks/sql/dist/connection/contracts/IAuthentication";
import {buildUserAgentString} from "@databricks/sql/dist/utils";
import {DatabricksCommandsClient} from "../DatabricksCommands";
import {HeadersInit} from "../types";

export class ExtensionAuthProvider implements IAuthentication {
    private headers: HeadersInit;

    constructor(
        private dbCommands: DatabricksCommandsClient,
        clientId: string
    ) {
        this.headers = {};
        this.headers["User-Agent"] = buildUserAgentString(clientId);
    }

    async authenticate(): Promise<HeadersInit> {
        const headers = await this.dbCommands.authenticate(this.headers);
        return headers;
    }
}
