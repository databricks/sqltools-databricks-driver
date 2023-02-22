# Release: v0.4.0

## 0.4.0 (2023-02-22)

-   Preview Feature: Add support for authenticating through the official [Databricks extension](https://marketplace.visualstudio.com/items?itemName=databricks.databricks). This indirectly also add support for logging in using the Azure CLI. (#60) ([428f119](https://github.com/databricks/sqltools-databricks-driver/commit/428f119)), closes [#60](https://github.com/databricks/sqltools-databricks-driver/issues/60)
-   Minor: Change logo to disambiguate from the main Databricks extension (#59) ([262183c](https://github.com/databricks/sqltools-databricks-driver/commit/262183c)), closes [#59](https://github.com/databricks/sqltools-databricks-driver/issues/59) [#56](https://github.com/databricks/sqltools-databricks-driver/issues/56)

# Release: v0.3.0

## 0.3.0 (2023-01-25)

-   Feature: Don't store plain text tokens. Instead store tokens as VS Code secrets. Closes [#49](https://github.com/databricks/sqltools-databricks-driver/issues/49) [#45](https://github.com/databricks/sqltools-databricks-driver/issues/45)
-   Fix: Don't require a leading `/` in paths, closes [#45](https://github.com/databricks/sqltools-databricks-driver/issues/45) [#48](https://github.com/databricks/sqltools-databricks-driver/issues/48)

# Release: v0.2.1

## <small>0.2.1 (2023-01-10)</small>

-   Security Fix: Bump json5 from 1.0.1 to 1.0.2 (#46) ([8b51860](https://github.com/databricks/sqltools-databricks-driver/commit/8b51860)), closes [#46](https://github.com/databricks/sqltools-databricks-driver/issues/46)

# Release: v0.2.0

## 0.2.0 (2022-12-21)

-   Fix: Poperly configure catalog and improve error reporting, closes [#41](https://github.com/databricks/sqltools-databricks-driver/issues/41)
-   Fix: Update icons in readme, closes [#34](https://github.com/databricks/sqltools-databricks-driver/issues/34)

# Release: v0.1.1

## <small>0.1.1 (2022-12-12)</small>

-   Fix: Properly handle bad PAT in "test connection" ([#18](https://github.com/databricks/sqltools-databricks-driver/issues/18)), closes [#15](https://github.com/databricks/sqltools-databricks-driver/issues/15)
-   Fix: Use new Databricks icons ([#29](https://github.com/databricks/sqltools-databricks-driver/issues/29)), closes [#6](https://github.com/databricks/sqltools-databricks-driver/issues/6)

# Release: v0.1.0

## 0.1.0 (2022-12-07)

-   First release
