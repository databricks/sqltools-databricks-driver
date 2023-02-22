export function getConnectionMethod(connInfo: any): "PAT" | "Extension" {
    if (connInfo.host) {
        return "PAT";
    }
    return "Extension";
}
