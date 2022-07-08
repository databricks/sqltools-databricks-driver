import AbstractDriver from '@sqltools/base-driver';
import queries from './queries';
import { IConnectionDriver, MConnectionExplorer, NSDatabase, ContextValue, Arg0 } from '@sqltools/types';
import { v4 as generateId } from 'uuid';

import { DBSQLClient } from '@databricks/sql';
import IHiveSession from '@databricks/sql/dist/contracts/IHiveSession';
import IOperation from '@databricks/sql/dist/contracts/IOperation';
import { patchHttpConnection } from './patch';

type DriverLib = IHiveSession;
type DriverOptions = any;

const utils = DBSQLClient.utils;

export default class DatabricksDriver extends AbstractDriver<DriverLib, DriverOptions> implements IConnectionDriver {

  queries = queries;

  public async open() {
    if (this.connection) {
      return this.connection;
    }

    let connectionOptions = {
      host: this.credentials.host,
      path: this.credentials.path,
      token: this.credentials.token
    };

    this.connection = this.openSession(connectionOptions);

    return this.connection;
  }

  private async openSession(connectionOptions) {
    patchHttpConnection();
    const client = new DBSQLClient();

    if (this.credentials.catalog  == null) {
      this.credentials.catalog = 'hive_metastore';
    }
        
    const connection = await client.connect({
      catalog: this.credentials.catalog,
      ...connectionOptions
    });

    const session = await connection.openSession();

    return session;
};

  private async handleOperation(operation: IOperation): Promise<any> {
    await utils.waitUntilReady(operation, false);
    
    operation.setMaxRows(15000);
    await utils.fetchAll(operation);
    await operation.close();

    return utils.getResult(operation).getValue();    
  }

  private async execute(session: IHiveSession, statement: string) {
    const operation = await session.executeStatement(statement, { runAsync: true });

    return this.handleOperation(operation);
  };

  public async close() {
    if (!this.connection) return;

    const session = await this.connection;
    await session.close();

    this.connection = null;
  }

  public query: (typeof AbstractDriver)['prototype']['query'] = async (query: string, opt = {}) => {
    const session = await this.connection;

    try {
      const queryResults = await this.execute(session, query);

      const cols = [];
      if (queryResults && queryResults.length > 0) {
        for (const colName in queryResults[0]) {
          cols.push(colName)
        }
      }

      return [<NSDatabase.IResult>{
        requestId: opt.requestId,        
        resultId: generateId(),
        connId: this.getId(),
        cols,
        messages: [{ date: new Date(), message: `Query ok with ${queryResults.length} results` }],
        query,
        results: queryResults
      }];

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
    } catch(error) {
      return [<NSDatabase.IResult> {
        connId: this.getId(),
        resultId: generateId(),
        cols: [],
        messages: error.message,
        error: true,
        rawError: error.response.errorMessage,
        query,
        results: []
      }];
    };
  }

  public async testConnection() {
    await this.open();
    await this.query('SELECT 1', {});
  }

  private async getColumns(parent: NSDatabase.ITable): Promise<NSDatabase.IColumn[]> {
    const session = await this.connection;

    const operation = await session.getColumns({
      catalogName: this.credentials.catalog,
      schemaName: this.credentials.schema,
      tableName: parent.label
    })
    
    const result = await this.handleOperation(operation);
    
    return <NSDatabase.IColumn[]>result.map(col => ({
      type: ContextValue.COLUMN,
      schema: parent.schema,
      database: parent.database,
      childType: ContextValue.NO_CHILD,
      dataType: col.TYPE_NAME,
      isNullable: col.NULLABLE === 1,
      table: parent,
      label: col.COLUMN_NAME,
      isPk: false,
      isFk: false,
      iconName: 'column'
    }));
  }

  private async getDatabases(): Promise<NSDatabase.IDatabase[]> {
    const session = await this.connection;

    const result = await session.getSchemas({
      catalogName: this.credentials.catalog
    }).then(this.handleOperation);

    return result.map(item => ({
      type: ContextValue.DATABASE,
      label: item.TABLE_SCHEM,
      schema: item.TABLE_SCHEM,
      database: item.TABLE_SCHEM,
      iconId: 'database'
    }));
  }

  private async getTablesAndViews(database: NSDatabase.IDatabase): Promise<NSDatabase.ITable[]> {
    const session = await this.connection;

    const operation = await session.getTables({
      catalogName: this.credentials.catalog,
      schemaName: database.label
    });
    
    const result = await this.handleOperation(operation);  

    return result.map(item => ({
      type: item.TABLE_TYPE === 'VIEW' ? ContextValue.VIEW : ContextValue.TABLE,
      catalog: item.TABLE_CAT,
      schema: item.TABLE_SCHEM,
      label: item.TABLE_NAME,
      isView: item.TABLE_TYPE === 'VIEW'
    }));
  }
  
  private async getTables(parent: NSDatabase.IDatabase): Promise<NSDatabase.ITable[]> {
    const tablesAndViews = await this.getTablesAndViews(parent);

    return tablesAndViews.filter(r => !r.isView);
  }

  private async getViews(parent: NSDatabase.IDatabase): Promise<NSDatabase.ITable[]> {
    const tablesAndViews = await this.getTablesAndViews(parent);

    return tablesAndViews.filter(r => r.isView);
  }

  public async getChildrenForItem({ item, parent }: Arg0<IConnectionDriver['getChildrenForItem']>) {
    switch (item.type) {
      case ContextValue.CONNECTION:
      case ContextValue.CONNECTED_CONNECTION:
        if (this.credentials.schema) {
          return <NSDatabase.IDatabase[]>[{
            label: this.credentials.schema,
            database: this.credentials.schema,
            type: ContextValue.DATABASE,
            detail: 'database'
          }];
        } else {
          return this.getDatabases()
        }
      case ContextValue.DATABASE:
        return <MConnectionExplorer.IChildItem[]>[
          { label: 'Tables', type: ContextValue.RESOURCE_GROUP, iconId: 'folder', childType: ContextValue.TABLE },
          { label: 'Views', type: ContextValue.RESOURCE_GROUP, iconId: 'folder', childType: ContextValue.VIEW },
        ];
      case ContextValue.TABLE:
      case ContextValue.VIEW:
        return this.getColumns(item as NSDatabase.ITable);
      case ContextValue.RESOURCE_GROUP:
        return this.getChildrenForGroup({ item, parent });
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

  private async getChildrenForGroup({ parent, item }: Arg0<IConnectionDriver['getChildrenForItem']>) {
    console.log({ item, parent });
    switch (item.childType) {
      case ContextValue.TABLE:
        return this.getTables(parent as NSDatabase.IDatabase);
      case ContextValue.VIEW:
        return this.getViews(parent as NSDatabase.IDatabase);
    }
    return [];
  }

  public async searchItems(itemType: ContextValue, search: string, _extraParams: any = {}): Promise<NSDatabase.SearchableItem[]> {
    switch (itemType) {
      case ContextValue.TABLE:
      case ContextValue.VIEW:
        return await this.findTables(search)
      case ContextValue.COLUMN:
        return await this.findColumn(search, _extraParams.tables)
    }
    return [];
  }

  // TODO: Implement caching
  private async findTables(search: string) {
    if (search == "") return [];

    const session = await this.connection;
    try {
      const statement = `SHOW TABLES FROM default like "${search}*"`
      const result = await this.execute(session, statement); 

      console.log("find table", search, result)
      return result.map(item => ({
        type: ContextValue.TABLE,
        label: item.tableName,
        database: item.database
      }));
    } catch(e) {
      console.error(e);
      return []
    }
  }

  // TODO: Implement caching
    private async findColumn(search: string, tables: Array<NSDatabase.IColumn>) {
    const session = await this.connection;
    try {
      const statement = `DESCRIBE TABLE ${tables[0].label};`;
      const result = await this.execute(session, statement); 

      console.log("find column", search, result)
      return result.map(item => ({
        type: ContextValue.COLUMN,
        label: item.col_name,
        dataType: item.data_type,
        table: tables[0]
      }));
    } catch(e) {
      console.error(e);
      return []
    }
  }
  
  public getStaticCompletions: IConnectionDriver['getStaticCompletions'] = async () => {
    return {};
  }
}
