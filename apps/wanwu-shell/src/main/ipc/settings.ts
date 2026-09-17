import { ipcMain } from "electron";
import { getSettingsView, updateSettings, type SettingsPatch } from "../settings.js";

export function registerSettingsIpc(onChanged: () => void): void {
  ipcMain.handle("settings:get", () => getSettingsView());
  ipcMain.handle("settings:set", (_e, patch: SettingsPatch) => {
    const view = updateSettings(patch);
    // Restart the ACP backend so the new provider/model/API key take effect.
    onChanged();
    return view;
  });
}
