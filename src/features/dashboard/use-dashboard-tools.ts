import { createContext, useContext } from "react";
export const DashboardToolsContext = createContext({ newOrder: () => {}, shortcuts: () => {} });
export const useDashboardTools = () => useContext(DashboardToolsContext);
