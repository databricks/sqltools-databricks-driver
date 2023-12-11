/**
 * Communication channel between the extension and the language server
 */

import {ILanguageServer} from "@sqltools/types";
import {HeadersInit} from "./types";
import {IExtension} from "@sqltools/types";

export class DatabricksCommandsClient {
    constructor(private server: ILanguageServer) {}

    async authenticate(headers: HeadersInit): Promise<HeadersInit> {
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

    await client.onRequest(
        "db/authenticate",
        async (headerFields: HeadersInit) => {
            const apiClient = await getApiClient();
            const headers = new Headers(headerFields);
            await apiClient.config.authenticate(headers);

            return [...headers.entries()].reduce((obj, [key, value]) => {
                obj[key] = value;
                return obj;
            }, {} as HeadersInit);
        }
    );

    await client.onRequest("db/getHostname", async () => {
        const apiClient = await getApiClient();
        const host = await apiClient.host;

        return host.hostname;
    });
}
