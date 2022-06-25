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
import IHiveSession from "@databricks/sql/dist/contracts/IHiveSession";
import IOperation from "@databricks/sql/dist/contracts/IOperation";
import {patchHttpConnection} from "./patch";
import {SqlClient} from "./sql_client";

type DriverLib = IHiveSession | SqlClient;
type DriverOptions = any;

const utils = DBSQLClient.utils;

export default class DatabricksDriver
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
        this.schema = this.credentials.schema || "default";

        if (this.credentials.sql_execution_api) {
            console.log("Using SQL execution API");
            this.connection = Promise.resolve(
                new SqlClient(
                    this.credentials.host,
                    this.credentials.token,
                    this.credentials.path.split("/").pop()
                )
            );
        } else {
            console.log("Using Thrift driver");
            this.connection = this.openSession(connectionOptions);
        }

        return this.connection;
    }

    private async openSession(connectionOptions: {
        host: string;
        path: string;
        token: string;
    }) {
        patchHttpConnection();
        const client = new DBSQLClient();

        const connection = await client.connect(connectionOptions);
        const session = await connection.openSession();

        return session;
    }

    private async handleOperation(operation: IOperation): Promise<any> {
        await utils.waitUntilReady(operation, false);

        operation.setMaxRows(15000);
        await utils.fetchAll(operation);
        await operation.close();

        return utils.getResult(operation).getValue();
    }

    private async execute(session: DriverLib, statement: string): Promise<any> {
        if (session instanceof SqlClient) {
            return await session.query(statement, {
                catalog: this.catalog,
                schema: this.schema,
            });
        } else {
            const operation = await session.executeStatement(statement, {
                runAsync: true,
            });

            return this.handleOperation(operation);
        }
    }

    public async close() {
        if (!this.connection) {
            return;
        }

        const session = await this.connection;
        if (session instanceof SqlClient) {
        } else {
            await session.close();
        }
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
        await this.open();
        await this.query("SELECT 1", {});
    }

    private async getColumns(
        parent: NSDatabase.ITable
    ): Promise<NSDatabase.IColumn[]> {
        console.time("get columns");
        const session = await this.connection;

        let result;
        if (session instanceof SqlClient) {
            result = await session.query(`describe table \`${parent.label}\``, {
                catalog: this.catalog,
                schema: this.schema,
            });
        } else {
            const operation = await session.getColumns({
                catalogName: this.catalog,
                schemaName: this.schema,
                tableName: parent.label,
            });

            result = await this.handleOperation(operation);
        }
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

        let result;
        if (session instanceof SqlClient) {
            result = await session.query(
                `use catalog \`${this.catalog}\`; show schemas`,
                {
                    catalog: this.catalog,
                    schema: this.schema,
                }
            );
        } else {
            result = await session
                .getSchemas({
                    catalogName: this.catalog,
                })
                .then(this.handleOperation);
        }

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

        let result;
        if (session instanceof SqlClient) {
            result = await session.query(`show tables in \`${this.schema}\``, {
                catalog: this.catalog,
                schema: this.schema,
            });
        } else {
            const operation = await session.getTables({
                catalogName: this.credentials.catalog,
                schemaName: database.label,
            });

            result = await this.handleOperation(operation);
        }
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
                if (this.credentials.schema) {
                    return <NSDatabase.IDatabase[]>[
                        {
                            label: this.credentials.schema,
                            database: this.credentials.schema,
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
        switch (itemType) {
            case ContextValue.TABLE:
            case ContextValue.VIEW:
                return await this.findTables(search);
            case ContextValue.COLUMN:
                return await this.getColumns(_extraParams.tables[0]);
        }
        return [];
    }

    // TODO: Implement caching
    private async findTables(search: string) {
        if (search === "") {
            return [];
        }

        const session = await this.connection;
        try {
            const statement = `SHOW TABLES FROM \`${this.schema}\` like "${search}*"`;
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

    public getStaticCompletions: IConnectionDriver["getStaticCompletions"] =
        async () => {
            return {};
        };
}
