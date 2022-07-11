const fetch = require("node-fetch");
const https = require("https");

export class SqlClient {
    agent: any;
    constructor(private host: string, private token: string, private warehouseId: string) {
        this.agent = new https.Agent({
            keepAlive: true
        });
    }

    async query(query: string): Promise<Array<any>> {
        console.time(`query: ${query}`);

        let url = `https://${this.host}/api/2.0/sql/statements`;
        let response = await fetch(url, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${this.token}`,
                "User-Agent": `vscode-sqltools-databricks`,
                "Content-Type": "text/json",
            },
            agent: this.agent,
            body: JSON.stringify({
                "statement": query,
                "warehouse_id": this.warehouseId,
                "await_result_for": {"seconds": 5 }
            })
        });

        let responseJson = await response.json();
        let schema = responseJson.result_manifest.schema;
        
        let executionToken = responseJson.execution_token;
        let rows = [];

        if (responseJson.result_data_batch) {
            executionToken = responseJson.result_data_batch.next_cursor_token;
            rows.push(...responseJson.result_data_batch.row_set_v1.rows);
        }

        while(executionToken) {
            response = await fetch(`${url}/${executionToken}`, {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${this.token}`,
                    "User-Agent": `vscode-sqltools-databricks`,
                    "Content-Type": "text/json",
                },
                agent: this.agent
            });
    
            // HTTP code checks:
            // - 200 -> OK
            // - 429/503 -> Retry, honor Retry-After header (sleep $Retry-After)
            // - 4xx/5xx -> Abort
            // Assume http client takes care of this for us.            

            let responseJson = await response.json();

            // Execution Status Check
            // - PENDING/RUNNING -> Retry (sleep 5)
            // - CANCELED/CLOSED/ERROR -> Abort
            // - SUCCESS -> OK for fetch

            let status = responseJson.execution_status.state
            if (status === "PENDING" || responseJson.status === "RUNNING") {
                await new Promise(resolve => setTimeout(resolve, 500));
                continue;
            }
            if (status === "CANCELED" || responseJson.status === "CLOSED" || responseJson.status === "ERROR") {
                throw new Error(responseJson);
            }

            rows.push(...responseJson.result_data_batch.row_set_v1.rows)            
            executionToken = responseJson?.result_data_batch?.next_cursor_token;
        }

        console.timeEnd(`query: ${query}`);

        return rows.map((row) => {
            let ret = {};
            for (let i=0; i<row.values.length; i++) {
                ret[schema.fields[i].name] = Object.values(row.values[i])[0]
            }
            return ret;            
        });
    }
}