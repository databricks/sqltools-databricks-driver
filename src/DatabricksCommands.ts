/**
 * Communication channel between the extension and the language server
 */

import {ILanguageServer} from "@sqltools/types";
import {Headers} from "./types";
import {IExtension} from "@sqltools/types";

export class DatabricksCommandsClient {
    constructor(private server: ILanguageServer) {}

    async authenticate(headers: Headers) {
        return await this.server.sendRequest("db/authenticate", headers);
    }

    async getHostname(): Promise<string> {
        return await this.server.sendRequest("db/getHostname");
    }
}

export async function initDatabricksCommands(
    client: IExtension["client"],
    vscode: typeof import("vscode")
) {
    async function getApiClient() {
        const dbExtension = vscode.extensions.getExtension<any>(
            "databricks.databricks"
        );
        if (!dbExtension) {
            const answer = await vscode.window.showWarningMessage(
                "Databricks extension is not installed. Do you want to install it and reload the window?",
                "Yes",
                "No"
            );
            if (answer === "Yes") {
                await vscode.commands.executeCommand(
                    "workbench.extensions.installExtension",
                    "databricks.databricks"
                );
                await vscode.commands.executeCommand(
                    "workbench.action.reloadWindow"
                );
                throw new Error("We never reach here!");
            } else {
                throw new Error("Databricks extension is not installed");
            }
        }
        await dbExtension.activate();

        const connectionManager = dbExtension.exports.connectionManager;
        await connectionManager.login();

        return connectionManager.workspaceClient.apiClient;
    }

    await client.onRequest("db/authenticate", async (headers: Headers) => {
        const apiClient = await getApiClient();
        await apiClient.config.authenticate(headers);
        return headers;
    });

    await client.onRequest("db/getHostname", async () => {
        const apiClient = await getApiClient();
        const host = await apiClient.host;

        return host.hostname;
    });
}
