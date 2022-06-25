/* eslint-disable @typescript-eslint/naming-convention */
import fetch from "node-fetch";
import https from "node:https";

export class SqlClient {
    agent: any;
    constructor(
        private host: string,
        private token: string,
        private warehouseId: string
    ) {
        this.agent = new https.Agent({
            keepAlive: true,
        });
    }

    private async request(
        method: string,
        path: string,
        body?: any
    ): Promise<any> {
        const url = `https://${this.host}/api/2.0${path}`;
        const response = await fetch(url, {
            method: method,
            headers: {
                "Authorization": `Bearer ${this.token}`,
                "User-Agent": `vscode-sqltools-databricks`,
                "Content-Type": "text/json",
            },
            agent: this.agent,
            body: body ? JSON.stringify(body) : undefined,
        });

        // TODO
        // HTTP code checks:
        // - 200 -> OK
        // - 429/503 -> Retry, honor Retry-After header (sleep $Retry-After)
        // - 4xx/5xx -> Abort

        //if (response.ok) {

        const responseJson = await response.json();

        // console.log(response.status, responseJson);

        const status = responseJson.execution_status.state;
        if (
            status === "CANCELED" ||
            responseJson.status === "CLOSED" ||
            responseJson.status === "ERROR"
        ) {
            throw new Error(responseJson);
        }

        return responseJson;
    }

    async query(
        query: string,
        options?: {
            catalog?: string;
            schema?: string;
        }
    ): Promise<Array<Record<string, any>>> {
        // console.time(`query: ${query}`);

        const responseJson = await this.request("POST", "/sql/statements", {
            statement: query,
            catalog: options?.catalog,
            schema: options?.schema,
            warehouse_id: this.warehouseId,
            await_result_for: {seconds: 5},
        });

        const schema = responseJson.result_manifest.schema;

        let executionToken = responseJson.execution_token;
        const rows = [];

        if (responseJson.result_data_batch) {
            executionToken = responseJson.result_data_batch.next_cursor_token;
            if (responseJson.result_data_batch.row_set_v1.row_count > 0) {
                rows.push(...responseJson.result_data_batch.row_set_v1.rows);
            }
        }

        while (executionToken) {
            const responseJson = await this.request(
                "GET",
                `/sql/statements/${executionToken}`
            );

            // Execution Status Check
            // - PENDING/RUNNING -> Retry (sleep 5)
            // - CANCELED/CLOSED/ERROR -> Abort
            // - SUCCESS -> OK for fetch

            const status = responseJson.execution_status.state;
            if (status === "PENDING" || responseJson.status === "RUNNING") {
                await new Promise((resolve) => setTimeout(resolve, 500));
                continue;
            }
            if (
                status === "CANCELED" ||
                responseJson.status === "CLOSED" ||
                responseJson.status === "ERROR"
            ) {
                throw new Error(responseJson);
            }

            rows.push(...responseJson.result_data_batch.row_set_v1.rows);
            executionToken = responseJson?.result_data_batch?.next_cursor_token;
        }

        // console.timeEnd(`query: ${query}`);

        return rows.map((row) => {
            const ret: Record<string, any> = {};
            for (let i = 0; i < row.values.length; i++) {
                ret[schema.fields[i].name] = Object.values(row.values[i])[0];
            }
            return ret;
        });
    }
}
