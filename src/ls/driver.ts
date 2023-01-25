/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable no-console */
import {
    IConnectionDriver,
    MConnectionExplorer,
    NSDatabase,
    ContextValue,
    IQueryOptions,
    IConnection,
} from "@sqltools/types";
import {v4 as generateId} from "uuid";

import {DBSQLClient} from "@databricks/sql";
import {DatabricksSession} from "./DatabricksSession";
import IDBSQLSession from "@databricks/sql/dist/contracts/IDBSQLSession";

const {
    name: productName,
    version: productVersion,
} = require("../../package.json");

export interface DriverOptions {
    host: string;
    path: string;
    token: string;
    catalog: string;
    schema?: string;
}

export class DatabricksDriver implements IConnectionDriver {
    // connection will be initialized in open method
    connection!: Promise<DatabricksSession>;
    private _catalog: string;
    private _schema?: string;

    constructor(public credentials: IConnection<DriverOptions>) {
        this._catalog = credentials.catalog;
        this._schema = credentials.schema;
    }

    public getId() {
        return this.credentials.id;
    }

    public get catalog() {
        return this._catalog;
    }

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
            clientId: `${productName}/${productVersion}`,
        };

        this.connection = this.openSession(connectionOptions);
        return this.connection;
    }

    private async openSession(connectionOptions: {
        host: string;
        path: string;
        token: string;
    }): Promise<DatabricksSession> {
        const client = new DBSQLClient({});
        let session: IDBSQLSession;

        try {
            const connection = await client.connect(connectionOptions);
            session = await connection.openSession({
                initialCatalog: this.catalog,
                initialSchema: this.schema,
            });
        } catch (e: any) {
            if (e.statusCode === 403) {
                throw new Error(
                    "Invalid token. Please check your token and try again."
                );
            } else {
                throw e;
            }
        }
        return new DatabricksSession(session);
    }

    public async close() {
        if (!this.connection) {
            return;
        }

        const session = await this.connection;
        await session.close();
        (this.connection as any) = null;
    }

    async checkDependencies(): Promise<void> {}

    async describeTable(
        table: NSDatabase.ITable,
        opt: IQueryOptions
    ): Promise<NSDatabase.IResult<any>[]> {
        console.time("describe table");
        await this.query(`use ${table.database}`, opt);
        const query = `describe \`${table.schema}\`.\`${table.label}\``;
        const queryResults = await this.query(query, opt);
        console.timeEnd("describe table");

        return queryResults;
    }

    async showRecords(
        table: NSDatabase.ITable,
        opt: IQueryOptions & {
            limit: number;
            page?: number;
        }
    ): Promise<NSDatabase.IResult<any>[]> {
        console.time("show records");

        await this.query(`use ${table.database}`, opt);
        const query = `select * from \`${table.schema}\`.\`${table.label}\` limit ${opt.limit}`;
        const queryResults = await this.query(query, opt);

        console.timeEnd("show records");

        return queryResults;
    }

    public async query(
        query: string,
        opt: IQueryOptions = {}
    ): Promise<NSDatabase.IResult[]> {
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
        } catch (error: any) {
            console.error(error);

            const rawMessage =
                error.response?.errorMessage || error.message || error + "";

            const message = error.response?.displayMessage || rawMessage;

            return [
                <NSDatabase.IResult>{
                    requestId: opt.requestId,
                    connId: this.getId(),
                    resultId: generateId(),
                    cols: [],
                    messages: [message],
                    error: true,
                    rawError: rawMessage,
                    query,
                    results: [],
                },
            ];
        }
    }

    public async testConnection() {
        await this.open();
        await this.query("SELECT 1", {});
    }

    private async getColumns(table: {
        label: string;
        database: string;
        schema?: string;
    }): Promise<NSDatabase.IColumn[]> {
        console.time("get columns");
        const session = await this.connection;

        const schema = table.schema || this._schema;
        if (!schema) {
            return [];
        }

        const columns = await session.getColumns(
            this._catalog,
            schema,
            table.label
        );

        console.timeEnd("get columns");

        return <NSDatabase.IColumn[]>columns.map((col) => ({
            type: ContextValue.COLUMN,
            schema: schema,
            database: table.database,
            childType: ContextValue.NO_CHILD,
            dataType: col.TYPE_NAME,
            isNullable: col.IS_NULLABLE === "YES",
            table: table,
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
        const tables = await session.getTables(this.catalog, database.label);
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

    public async getChildrenForItem(params: {
        item: NSDatabase.SearchableItem;
        parent?: NSDatabase.SearchableItem;
    }): Promise<MConnectionExplorer.IChildItem[]> {
        switch (params.item.type) {
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
                return this.getColumns(params.item as NSDatabase.ITable);
            case ContextValue.RESOURCE_GROUP:
                return this.getChildrenForGroup(params);
        }
        return [];
    }

    private async getChildrenForGroup(params: {
        item: NSDatabase.SearchableItem;
        parent?: NSDatabase.SearchableItem;
    }) {
        switch (params.item.childType) {
            case ContextValue.TABLE:
                return this.getTables(params.parent as NSDatabase.IDatabase);
            case ContextValue.VIEW:
                return this.getViews(params.parent as NSDatabase.IDatabase);
        }
        return [];
    }

    public async searchItems(
        itemType: ContextValue,
        search: string,
        extraParams: any = {}
    ): Promise<NSDatabase.SearchableItem[]> {
        console.log("searchItems", itemType, search, extraParams);
        const database = extraParams.database;
        switch (itemType) {
            case ContextValue.TABLE:
            case ContextValue.VIEW:
                return await this.findTables(search, database);
            case ContextValue.COLUMN:
                return await this.getColumns(extraParams.tables[0]);
            case ContextValue.DATABASE:
                return await this.findDatabases(search);
        }
        return [];
    }

    private async findTables(
        search: string,
        schema?: string
    ): Promise<NSDatabase.ITable[]> {
        if (search === "") {
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
                this.catalog,
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

    public async getStaticCompletions(): Promise<{
        [w: string]: NSDatabase.IStaticCompletion;
    }> {
        return {};
    }
}
