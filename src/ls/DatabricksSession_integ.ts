/**
 * Integration tests for the driver. Currently we have no automated way to run them
 *
 * In order to run them, you need to set the following environment variables:
 *
 * DATABRICKS_HOST: The host of the Databricks instance
 * DATABRICK_SQL_PATH: The path to the SQL endpoint
 * DATABRICKS_TOKEN: The token to use to authenticate
 *
 * and run it with `yarn run test:integ `
 */

import * as assert from "assert";
import {DBSQLClient} from "@databricks/sql";
import {DatabricksSession} from "./DatabricksSession";

describe(__filename, () => {
    let session: DatabricksSession;

    const CATALG = "hive_metastore";
    const SCHEMA = "default";
    const TABLE = "russia_losses";

    before(async () => {
        assert.ok(process.env.DATABRICKS_HOST, "DATABRICKS_HOST is not set");
        assert.ok(
            process.env.DATABRICK_SQL_PATH,
            "DATABRICK_SQL_PATH is not set"
        );
        assert.ok(process.env.DATABRICKS_TOKEN, "DATABRICKS_TOKEN is not set");

        const client = new DBSQLClient({});

        const connection = await client.connect({
            host: process.env.DATABRICKS_HOST,
            path: process.env.DATABRICK_SQL_PATH,
            token: process.env.DATABRICKS_TOKEN,
        });
        session = new DatabricksSession(await connection.openSession());
    });

    after(async () => {
        await session.close();
    });

    it("should get schemas", async () => {
        const schemas = await session.getSchemas("hive_metastore");
        // console.log(schemas);
        assert.ok(schemas.length > 0);
    });

    it("should execute a query", async () => {
        const result = await session.execute("select 'fabian'");
        // console.log(result);
        assert.deepStrictEqual(result, [{fabian: "fabian"}]);
    });

    it("should get columns", async () => {
        const result = await session.getColumns(CATALG, SCHEMA, TABLE);
        // console.log(result);
        assert.ok(result.length > 0);

        for (const col of result) {
            assert.strictEqual(typeof col.TABLE_CAT, "string");
            assert.strictEqual(typeof col.TABLE_SCHEM, "string");
            assert.strictEqual(typeof col.TABLE_NAME, "string");
            assert.strictEqual(typeof col.ORDINAL_POSITION, "number");
            assert.ok(["YES", "NO"].includes(col.IS_NULLABLE));
            assert.ok(["YES", "NO"].includes(col.IS_AUTO_INCREMENT));
            assert.strictEqual(typeof col.DATA_TYPE, "number");
            assert.strictEqual(typeof col.COLUMN_SIZE, "number");
            assert.strictEqual(typeof col.TYPE_NAME, "string");
            assert.strictEqual(typeof col.REMARKS, "string");
            assert.strictEqual(typeof col.TABLE_NAME, "string");
        }
    });

    it("should get tables", async () => {
        const result = await session.getTables(CATALG, SCHEMA);
        // console.log(result);
        assert.ok(result.length > 0);

        for (const table of result) {
            assert.strictEqual(typeof table.TABLE_CAT, "string");
            assert.strictEqual(typeof table.TABLE_SCHEM, "string");
            assert.strictEqual(typeof table.TABLE_NAME, "string");
            assert.strictEqual(typeof table.TABLE_TYPE, "string");
            assert.strictEqual(typeof table.REMARKS, "string");
        }
    });

    it.skip("should find tables by prefix", async () => {
        const result = await session.getTables(CATALG, SCHEMA, "russ*");
        // console.log(result);
        assert.ok(result.length > 0);
    });

    it("should get catalogs", async () => {
        const result = await session.getCatalogs();
        // console.log(result);
        assert.ok(result.length > 0);

        for (const cat of result) {
            assert.strictEqual(typeof cat.TABLE_CAT, "string");
        }
    });

    it.skip("should fail properly when token is wrong", async () => {});
});
