/* eslint-disable no-console */
import AbstractDriver from "@sqltools/base-driver";
import queries from "./queries";
import {
    IConnectionDriver,
    MConnectionExplorer,
    NSDatabase,
    ContextValue,
    Arg0,
    IQueryOptions,
} from "@sqltools/types";
import {v4 as generateId} from "uuid";

import {DBSQLClient} from "@databricks/sql";
import {DatabricksSession} from "./DatabricksSession";

type DriverLib = DatabricksSession;
export interface DriverOptions {
    host: string;
    path: string;
    token: string;
    catalog?: string;
    schema?: string;
}

export class DatabricksDriver
    extends AbstractDriver<DriverLib, DriverOptions>
    implements IConnectionDriver
{
    queries = queries;
    private _catalog: string;
    public get catalog() {
        return this._catalog;
    }

    private _schema?: string;
    public get schema() {
        return this._schema;
    }

    public async open() {
        if (this.connection) {
            return this.connection;
        }

        const connectionOptions = {
            host: this.credentials.host,
            path: this.credentials.path,
            token: this.credentials.token,
        };

        this._catalog = this.credentials.catalog || "hive_metastore";
        this._schema = this.credentials.schema;

        this.connection = this.openSession(connectionOptions);
        return this.connection;
    }

    private async openSession(connectionOptions: {
        host: string;
        path: string;
        token: string;
    }): Promise<DatabricksSession> {
        const client = new DBSQLClient({});

        const connection = await client.connect(connectionOptions);
        const session = new DatabricksSession(await connection.openSession());

        return session;
    }

    public async close() {
        if (!this.connection) {
            return;
        }

        const session = await this.connection;
        await session.close();
        (this.connection as any) = null;
    }

    async showRecords(
        table: NSDatabase.ITable,
        opt: IQueryOptions & {
            limit: number;
            page?: number;
        }
    ): Promise<NSDatabase.IResult<any>[]> {
        console.time("show records");

        const query = `select * from \`${table.label}\` limit ${opt.limit}`;
        const queryResults = await this.query(query, opt);

        console.timeEnd("show records");

        return queryResults;
    }

    public query: typeof AbstractDriver["prototype"]["query"] = async (
        query: string,
        opt = {}
    ) => {
        const session = await this.connection;

        try {
            const queryResults = await session.execute(query);

            const cols = [];
            if (queryResults && queryResults.length > 0) {
                for (const colName in queryResults[0]) {
                    cols.push(colName);
                }
            }

            return [
                <NSDatabase.IResult>{
                    requestId: opt.requestId,
                    resultId: generateId(),
                    connId: this.getId(),
                    cols,
                    messages: [
                        {
                            date: new Date(),
                            message: `Query ok with ${queryResults.length} results`,
                        },
                    ],
                    query,
                    results: queryResults,
                },
            ];
        } catch (error) {
            return [
                <NSDatabase.IResult>{
                    requestId: opt.requestId,
                    connId: this.getId(),
                    resultId: generateId(),
                    cols: [],
                    messages: (<any>error).message,
                    error: true,
                    rawError: (<any>error).response.errorMessage,
                    query,
                    results: [],
                },
            ];
        }
    };

    public async testConnection() {
        await this.open();
        await this.query("SELECT 1", {});
    }

    private async getColumns(
        parent: NSDatabase.ITable
    ): Promise<NSDatabase.IColumn[]> {
        console.time("get columns");
        const session = await this.connection;

        const columns = await session.getColumns(
            this._catalog,
            parent.schema,
            parent.label
        );

        console.timeEnd("get columns");

        return <NSDatabase.IColumn[]>columns.map((col) => ({
            type: ContextValue.COLUMN,
            schema: parent.schema,
            database: parent.database,
            childType: ContextValue.NO_CHILD,
            dataType: col.TYPE_NAME,
            isNullable: col.IS_NULLABLE === "YES",
            table: parent,
            label: col.COLUMN_NAME,
            isPk: false,
            isFk: false,
            iconName: "column",
        }));
    }

    private async getDatabases(): Promise<NSDatabase.IDatabase[]> {
        const session = await this.connection;
        const schemas = await session.getSchemas(this._catalog);

        return schemas.map((item) => ({
            type: ContextValue.DATABASE,
            label: item.TABLE_SCHEM,
            schema: item.TABLE_SCHEM,
            database: item.TABLE_CATALOG,
            iconId: "database",
        }));
    }

    private async getTablesAndViews(
        database: NSDatabase.IDatabase
    ): Promise<NSDatabase.ITable[]> {
        console.time("get tables");
        const session = await this.connection;

        const tables = await session.getTables(this._catalog, database.label);

        console.timeEnd("get tables");

        return tables.map((item) => ({
            type: ContextValue.TABLE,
            database: item.TABLE_CAT,
            schema: item.TABLE_SCHEM,
            label: item.TABLE_NAME,
            isView: item.TABLE_TYPE === "VIEW",
        }));
    }

    private async getTables(
        parent: NSDatabase.IDatabase
    ): Promise<NSDatabase.ITable[]> {
        const tablesAndViews = await this.getTablesAndViews(parent);
        return tablesAndViews.filter((r) => !r.isView);
    }

    private async getViews(
        parent: NSDatabase.IDatabase
    ): Promise<NSDatabase.ITable[]> {
        const tablesAndViews = await this.getTablesAndViews(parent);
        return tablesAndViews.filter((r) => r.isView);
    }

    public async getChildrenForItem({
        item,
        parent,
    }: Arg0<IConnectionDriver["getChildrenForItem"]>) {
        switch (item.type) {
            case ContextValue.CONNECTION:
            case ContextValue.CONNECTED_CONNECTION:
                if (this._schema) {
                    return <NSDatabase.IDatabase[]>[
                        {
                            label: this._schema,
                            schema: this._schema,
                            database: this._catalog,
                            type: ContextValue.DATABASE,
                            detail: "database",
                        },
                    ];
                } else {
                    return this.getDatabases();
                }
            case ContextValue.DATABASE:
                return <MConnectionExplorer.IChildItem[]>[
                    {
                        label: "Tables",
                        type: ContextValue.RESOURCE_GROUP,
                        iconId: "folder",
                        childType: ContextValue.TABLE,
                    },
                    {
                        label: "Views",
                        type: ContextValue.RESOURCE_GROUP,
                        iconId: "folder",
                        childType: ContextValue.VIEW,
                    },
                ];
            case ContextValue.TABLE:
            case ContextValue.VIEW:
                return this.getColumns(item as NSDatabase.ITable);
            case ContextValue.RESOURCE_GROUP:
                return this.getChildrenForGroup({item, parent});
        }
        return [];
    }

    private async getChildrenForGroup({
        parent,
        item,
    }: Arg0<IConnectionDriver["getChildrenForItem"]>) {
        switch (item.childType) {
            case ContextValue.TABLE:
                return this.getTables(parent as NSDatabase.IDatabase);
            case ContextValue.VIEW:
                return this.getViews(parent as NSDatabase.IDatabase);
        }
        return [];
    }

    public async searchItems(
        itemType: ContextValue,
        search: string,
        _extraParams: any = {}
    ): Promise<NSDatabase.SearchableItem[]> {
        console.log("searchItems", itemType, search, _extraParams);
        const database = _extraParams.database;
        switch (itemType) {
            case ContextValue.TABLE:
            case ContextValue.VIEW:
                return await this.findTables(search, database);
            case ContextValue.COLUMN:
                return await this.getColumns(_extraParams.tables[0]);
            case ContextValue.DATABASE:
                return await this.findDatabases(search);
        }
        return [];
    }

    private async findTables(
        search: string,
        schema?: string
    ): Promise<NSDatabase.ITable[]> {
        if (search === "" || !schema) {
            return [];
        }

        schema = schema || this._schema;
        if (!schema) {
            return [];
        }

        const session = await this.connection;
        try {
            const tables = await session.getTables(
                this._catalog,
                schema,
                `${search}*`
            );

            return tables.map((item) => ({
                type: ContextValue.TABLE,
                label: item.TABLE_NAME,
                schema: item.TABLE_SCHEM,
                database: item.TABLE_CAT,
                isView: item.TABLE_TYPE === "VIEW",
            }));
        } catch (e) {
            console.error(e);
            return [];
        }
    }

    private async findDatabases(
        search: string
    ): Promise<NSDatabase.IDatabase[]> {
        if (!search) {
            return [];
        }

        const session = await this.connection;
        try {
            const schemas = await session.getSchemas(
                this._catalog,
                `%${search}*`
            );

            return schemas.map((item) => ({
                type: ContextValue.DATABASE,
                label: item.TABLE_SCHEM,
                schema: item.TABLE_SCHEM,
                database: item.TABLE_CATALOG,
                iconId: "database",
            }));
        } catch (e) {
            console.error(e);
            return [];
        }
    }

    public getStaticCompletions: IConnectionDriver["getStaticCompletions"] =
        async () => {
            return {};
        };
}
