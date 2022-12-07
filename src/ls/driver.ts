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
import IOperation from "@databricks/sql/dist/contracts/IOperation";
import IDBSQLSession from "@databricks/sql/dist/contracts/IDBSQLSession";

type DriverLib = IDBSQLSession;
type DriverOptions = any;

export class DatabricksDriver
    extends AbstractDriver<DriverLib, DriverOptions>
    implements IConnectionDriver
{
    queries = queries;
    private catalog?: string;
    private schema?: string;

    public async open() {
        if (this.connection) {
            return this.connection;
        }

        const connectionOptions = {
            host: this.credentials.host,
            path: this.credentials.path,
            token: this.credentials.token,
        };

        this.catalog = this.credentials.catalog || "hive_metastore";
        this.schema = this.credentials.schema;

        this.connection = this.openSession(connectionOptions);

        return this.connection;
    }

    private async openSession(connectionOptions: {
        host: string;
        path: string;
        token: string;
    }) {
        const client = new DBSQLClient({});

        const connection = await client.connect(connectionOptions);
        const session = await connection.openSession();

        return session;
    }

    private async handleOperation(operation: IOperation): Promise<any> {
        const result = await operation.fetchAll();
        await operation.close();

        return result;
    }

    private async execute(session: DriverLib, statement: string): Promise<any> {
        const operation = await session.executeStatement(statement, {
            runAsync: true,
        });

        return this.handleOperation(operation);
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
            const queryResults = await this.execute(session, query);

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

            // queryResults.forEach(queryResult => {
            //   resultsAgg.push({
            //     requestId: opt.requestId,
            //     resultId: generateId(),
            //     connId: this.getId(),
            //     cols: Object.keys(queryResult),
            //     messages: [{ date: new Date(), message: `Query ok with ${queryResults.length} results` }],
            //     query: query.toString(),
            //     results: queryResult
            //   });
            // });

            //return resultsAgg;
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
        console.log("TESTING!!!!!!!!!!!!!");
        await this.open();
        await this.query("SELECT 1", {});
    }

    private async getColumns(
        parent: NSDatabase.ITable
    ): Promise<NSDatabase.IColumn[]> {
        console.time("get columns");
        const session = await this.connection;

        const operation = await session.getColumns({
            catalogName: this.catalog,
            schemaName: parent.schema,
            tableName: parent.label,
        });

        const result = await this.handleOperation(operation);
        console.timeEnd("get columns");

        return <NSDatabase.IColumn[]>result.map((col: any) => ({
            type: ContextValue.COLUMN,
            schema: parent.schema,
            database: parent.database,
            childType: ContextValue.NO_CHILD,
            dataType: col.TYPE_NAME,
            isNullable: col.NULLABLE === 1,
            table: parent,
            label: col.COLUMN_NAME || col.col_name,
            isPk: false,
            isFk: false,
            iconName: "column",
        }));
    }

    private async getDatabases(): Promise<NSDatabase.IDatabase[]> {
        const session = await this.connection;
        const operation = await session.getSchemas({
            catalogName: this.catalog,
        });
        const result = await this.handleOperation(operation);

        return result.map((item: any) => ({
            type: ContextValue.DATABASE,
            label: item.TABLE_SCHEM,
            schema: item.TABLE_SCHEM,
            database: item.TABLE_SCHEM,
            iconId: "database",
        }));
    }

    private async getTablesAndViews(
        database: NSDatabase.IDatabase
    ): Promise<NSDatabase.ITable[]> {
        console.time("get tables");
        const session = await this.connection;

        const operation = await session.getTables({
            catalogName: this.credentials.catalog,
            schemaName: database.label,
        });

        const result = await this.handleOperation(operation);
        console.timeEnd("get tables");

        return result.map((item: any) => ({
            type: ContextValue.TABLE,
            catalog: this.credentials.catalog,
            schema: database.label,
            label: item.TABLE_NAME || item.tableName,
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
                if (this.schema) {
                    return <NSDatabase.IDatabase[]>[
                        {
                            label: this.schema,
                            database: this.schema,
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

    // private async getCatalogs() {
    //   const session = await this.connection;
    //   const catalogs = await this.handleOperation(await session.getCatalogs());

    //   console.log("Catalogs", catalogs);
    //   return catalogs.map(item => ({
    //     type: ContextValue.DATABASE,
    //     catalog: item.TABLE_CAT,
    //     label: item.TABLE_CAT,
    //     isView: false
    //   }));
    // }

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

    // TODO: Implement caching
    private async findTables(search: string, schema?: string) {
        if (search === "" || !schema) {
            return [];
        }

        schema = schema || this.schema;
        if (!schema) {
            return [];
        }

        const session = await this.connection;
        try {
            const statement = `SHOW TABLES FROM \`${schema}\` like "${search}*"`;
            const result = await this.execute(session, statement);

            return result.map((item: any) => ({
                type: ContextValue.TABLE,
                label: item.tableName,
                database: item.database,
            }));
        } catch (e) {
            console.error(e);
            return [];
        }
    }

    private async findDatabases(search: string) {
        if (!search) {
            return [];
        }

        const session = await this.connection;
        try {
            const operation = await session.getSchemas({
                catalogName: this.catalog,
                schemaName: `%${search}*`,
            });
            const result = await this.handleOperation(operation);

            return result.map((item: any) => ({
                type: ContextValue.DATABASE,
                label: item.TABLE_SCHEM,
                schema: item.TABLE_SCHEM,
                database: item.TABLE_SCHEM,
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
