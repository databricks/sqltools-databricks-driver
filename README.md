# Databricks driver for SQLTools

> 📘 **Note**: The [User Guide](https://docs.databricks.com/dev-tools/sqltools-driver.html) contains comprehesive documentation about the Databricks drvier for SQLTools.

This Visual Studio Code extension lets you run SQL queries against Databricks. It plugs into the popular [SQLTools](https://vscode-sqltools.mteixeira.dev/) extension. It supports the following capabilities:

-   Connect to a specific catalog and schema in Databricks
-   Browse tables and views
-   Run SQL queries

![demo](/demo.gif)

# Installation

-   First, install the [SQLTools extension](https://marketplace.visualstudio.com/items?itemName=mtxr.sqltools) from the Visual Studio Code Marketplace.
-   Second, install the [SQLTools Databricks Driver](https://marketplace.visualstudio.com/items?itemName=databricks.sqltools-databricks-driver) from the Visual Studio Code Marketplace.

# Connecting to Databricks

-   Click the SQLTools icon in the left navigation bar
-   Click the _Create new connection_ icon

![create-new-connection](/create-new-connection.png)

-   Fill in the connection form. The information you fill in this form can be found in two different places depending on the type of compute you are connecting to. Read this [documentation](https://docs.databricks.com/dev-tools/python-sql-connector.html#get-started) to learn more.

![connection-form](/connection-form.png)
