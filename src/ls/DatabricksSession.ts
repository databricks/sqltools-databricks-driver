/* eslint-disable @typescript-eslint/naming-convention */
import IDBSQLSession from "@databricks/sql/dist/contracts/IDBSQLSession";
import IOperation from "@databricks/sql/dist/contracts/IOperation";

export interface Schema {
    TABLE_SCHEM: string;
    TABLE_CATALOG: string;
}
export interface Column {
    TABLE_CAT: string;
    TABLE_SCHEM: string;
    TABLE_NAME: string;
    COLUMN_NAME: string;
    ORDINAL_POSITION: number;
    COLUMN_DEF?: string;
    IS_NULLABLE: "YES" | "NO";
    DATA_TYPE: number;
    CHAR_OCTET_LENGTH?: string;
    COLUMN_SIZE: number;
    TYPE_NAME: string;
    DECIMAL_DIGITS?: number;
    NUM_PREC_RADIX?: number;
    REMARKS?: string;
    SQL_DATA_TYPE?: string;
    IS_AUTO_INCREMENT: "YES" | "NO";
}

export interface Table {
    TABLE_CAT: string;
    TABLE_SCHEM: string;
    TABLE_NAME: string;
    TABLE_TYPE: string;
    REMARKS?: string;
}

export interface Catalog {
    TABLE_CAT: string;
}

/**
 * Typed interface for the Databricks SQL API
 */
export class DatabricksSession {
    constructor(private session: IDBSQLSession) {}

    public async close() {
        await this.session.close();
    }

    async getCatalogs(): Promise<Catalog[]> {
        const operation = await this.session.getCatalogs();
        return await this.handleOperation(operation);
    }

    async getSchemas(
        catalogName: string,
        schemaName?: string
    ): Promise<Schema[]> {
        const operation = await this.session.getSchemas({
            catalogName,
            schemaName,
        });
        return await this.handleOperation(operation);
    }

    async getTables(
        catalogName: string,
        schemaName: string,
        tableName?: string
    ): Promise<Table[]> {
        const operation = await this.session.getTables({
            catalogName,
            schemaName,
            tableName,
        });
        return await this.handleOperation(operation);
    }

    async getColumns(
        catalogName: string,
        schemaName: string,
        tableName: string
    ): Promise<Column[]> {
        const operation = await this.session.getColumns({
            catalogName,
            schemaName,
            tableName,
        });

        return await this.handleOperation(operation);
    }

    async execute<T = object>(statement: string): Promise<T[]> {
        const operation = await this.session.executeStatement(statement, {
            runAsync: true,
        });

        return this.handleOperation(operation);
    }

    private async handleOperation<T>(operation: IOperation): Promise<T[]> {
        const result = await operation.fetchAll();
        await operation.close();

        return result as T[];
    }
}
