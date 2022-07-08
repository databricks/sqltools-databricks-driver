# SQLTools driver for Databricks

This Visual Studio Code extension lets you run SQL queries against Databricks. It plugs into the popular [SQLTools](https://vscode-sqltools.mteixeira.dev/) extension. It supports the following capabilities:
- Connect to a specific catalog and schema in Databricks
- Browse tables and views
- Run SQL queries

![demo](/demo.gif)

Keyword completion (static or dynamic) is not yet implemented, neither is item search.

# Installation
- First, install the [SQLTools extension](https://marketplace.visualstudio.com/items?itemName=mtxr.sqltools) from the Visual Studio Code Marketplace.
- Second, download and install the [extension file](https://github.com/databricks/sqltools-databricks-driver/releases/download/nightly/sqltools-databricks-driver-0.0.1.vsix) from the [nightly release](https://github.com/databricks/sqltools-databricks-driver/releases/tag/nightly)

![Install Extension](/install-extension.gif)

# Connecting to Databricks
- Click the SQLTools icon in the left navigation bar
- Click the _Create new connection_ icon

![create-new-connection](/create-new-connection.png)

- Fill in the connection form. The information you fill in this form can be found in two different places depending on the type of compute you are connecting to. Read this [documentation](https://docs.databricks.com/dev-tools/python-sql-connector.html#get-started) to learn more.

![connection-form](/connection-form.png)

# Developing
## Running and debugging locally
1. Clone this repository to your computer.
2. Run `yarn install` to install dependencies.
3. Press `F5` to debug in Visual Studio Code. Breakpoints, watches etc. will all be available.

## Build a local package

```
yarn run vscode:package
```
