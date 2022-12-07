import {DatabricksDriver} from "./driver";
import {WorkspaceFolder} from "vscode-languageserver-protocol";
import {IConnection} from "@sqltools/types";
import {instance, spy, anything, when} from "ts-mockito";
import {Mocker} from "ts-mockito/lib/Mock";
import * as assert from "assert";
import {DBSQLSession} from "@databricks/sql";

// see https://github.com/NagRock/ts-mockito/issues/163
function mock<T>(
    // eslint-disable-next-line @typescript-eslint/ban-types
    clazz?: (new (...args: any[]) => T) | (Function & {prototype: T})
): T {
    const mocker = new Mocker(clazz);
    mocker["excludedPropertyNames"] = ["hasOwnProperty", "then"];
    return mocker.getMock();
}

describe(__filename, () => {
    let credentials: IConnection<any>;
    const getWorkspaceFolders = function (): Promise<WorkspaceFolder[] | null> {
        return Promise.resolve([
            {
                uri: "/Workspaces",
                name: "Workspace",
            },
        ]);
    };

    beforeEach(() => {
        credentials = {
            host: "https://example.com",
            path: "/sql/1.0/warehouses/12345abcde",
            token: "ABC123",
            catalog: "hive_metastore",
            schema: "default",

            name: "Dabricks",
            driver: "Databricks",
            username: "?",
            id: "12345abcde",
            isConnected: true,
            isActive: true,
        };
    });

    it("should instantiate the driver", () => {
        const driver = new DatabricksDriver(credentials, getWorkspaceFolders);

        assert.strictEqual(driver.credentials.host, credentials.host);
        assert.strictEqual(driver.credentials.path, credentials.path);
        assert.strictEqual(driver.credentials.token, credentials.token);
        assert.strictEqual(driver.credentials.catalog, credentials.catalog);
        assert.strictEqual(driver.credentials.schema, credentials.schema);
    });

    it("should opne a session", async () => {
        const driver = new DatabricksDriver(credentials, getWorkspaceFolders);
        const spiedDriver = spy(driver);

        const dbsqlSessionMock = mock<DBSQLSession>();
        when(spiedDriver.openSession(anything())).thenResolve(
            instance(dbsqlSessionMock)
        );

        const session = await driver.open();
        assert.ok(session);

        assert.strictEqual(driver.schema, credentials.schema);
        assert.strictEqual(driver.catalog, credentials.catalog);
    });
});
