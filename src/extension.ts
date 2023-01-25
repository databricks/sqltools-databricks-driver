import * as vscode from "vscode";
import {
    IExtension,
    IExtensionPlugin,
    IDriverExtensionApi,
} from "@sqltools/types";
import {ExtensionContext} from "vscode";
import {DRIVER_ALIASES} from "./constants";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const {publisher, name} = require("../package.json");

export async function activate(
    extContext: ExtensionContext
): Promise<IDriverExtensionApi> {
    const sqltools =
        vscode.extensions.getExtension<IExtension>("mtxr.sqltools");
    if (!sqltools) {
        throw new Error("SQLTools not installed");
    }
    await sqltools.activate();

    const api = sqltools.exports;

    const extensionId = `${publisher}.${name}`;
    const plugin: IExtensionPlugin = {
        extensionId,
        name: `Databricks Plugin`,
        type: "driver",
        async register(extension) {
            // register ext part here
            extension
                .resourcesMap()
                .set(`driver/${DRIVER_ALIASES[0].value}/icons`, {
                    active: extContext.asAbsolutePath("icons/active.png"),
                    default: extContext.asAbsolutePath("icons/default.png"),
                    inactive: extContext.asAbsolutePath("icons/inactive.png"),
                });
            DRIVER_ALIASES.forEach(({value}) => {
                extension
                    .resourcesMap()
                    .set(`driver/${value}/extension-id`, extensionId);
                extension
                    .resourcesMap()
                    .set(
                        `driver/${value}/connection-schema`,
                        extContext.asAbsolutePath("connection.schema.json")
                    );
                extension
                    .resourcesMap()
                    .set(
                        `driver/${value}/ui-schema`,
                        extContext.asAbsolutePath("ui.schema.json")
                    );
            });
            await extension.client.sendRequest("ls/RegisterPlugin", {
                path: extContext.asAbsolutePath("out/ls/plugin.js"),
            });
        },
    };
    api.registerPlugin(plugin);
    return {
        driverName: "Databricks",
        parseBeforeSaveConnection: async ({connInfo}) => {
            /**
             * This hook is called before saving the connection using the assistant
             * so you can do any transformations before saving it to disk.active
             * EG: relative file path transformation, string manipulation etc
             * Below is the exmaple for SQLite, where we save the DB path relative to workspace
             * and later we transform it back to absolute before editing
             */

            // only save the host part of the URL
            connInfo.host = connInfo.host
                .replace(/^https?:\/\//, "")
                .replace(/\/$/, "");

            connInfo.path = connInfo.path.replace(/^\/?/, "/");

            await extContext.secrets.store(
                `databricks-${connInfo.host}${connInfo.path}`,
                connInfo.token
            );
            delete connInfo.token;

            return connInfo;
        },
        parseBeforeEditConnection: async ({connInfo}) => {
            /**
             * This hook is called before editing the connection using the assistant
             * so you can do any transformations before editing it.
             * EG: absolute file path transformation, string manipulation etc
             * Below is the exmaple for SQLite, where we use relative path to save,
             * but we transform to asolute before editing
             */
            return connInfo;
        },
        resolveConnection: async ({connInfo}) => {
            /**
             * This hook is called after a connection definition has been fetched
             * from settings and is about to be used to connect.
             */
            if (connInfo.token === undefined) {
                connInfo.token = await extContext.secrets.get(
                    `databricks-${connInfo.host}${connInfo.path}`
                );
            }
            return connInfo;
        },
        driverAliases: DRIVER_ALIASES,
    };
}

export function deactivate() {}
