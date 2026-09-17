import { ipcMain } from "electron";
import { loadSessions, saveSessions, type StoredSession } from "../sessions.js";

export function registerSessionsIpc(getRoot: () => string | null): void {
  ipcMain.handle("sessions:get", () => loadSessions(getRoot()));
  ipcMain.handle("sessions:set", (_e, sessions: StoredSession[]) => {
    saveSessions(getRoot(), sessions);
    return true;
  });
}
