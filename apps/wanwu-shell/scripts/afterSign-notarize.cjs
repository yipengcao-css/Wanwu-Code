/**
 * electron-builder afterSign hook — notarize only when Apple secrets are present.
 * Never fails the build when secrets are absent (unsigned / Linux cross-build OK).
 *
 * Required env (all must be set):
 *   APPLE_ID
 *   APPLE_APP_SPECIFIC_PASSWORD
 *   APPLE_TEAM_ID
 */
exports.default = async function afterSign(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== "darwin") {
    return;
  }

  const appleId = process.env.APPLE_ID?.trim();
  const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD?.trim();
  const teamId = process.env.APPLE_TEAM_ID?.trim();

  if (!appleId || !appleIdPassword || !teamId) {
    console.log(
      "[wanwu afterSign] skip notarize — set APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID to enable",
    );
    return;
  }

  if (process.env.CSC_IDENTITY_AUTO_DISCOVERY === "false" || process.env.WANWU_SKIP_NOTARIZE === "1") {
    console.log("[wanwu afterSign] skip notarize — CSC_IDENTITY_AUTO_DISCOVERY=false or WANWU_SKIP_NOTARIZE=1");
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;

  console.log(`[wanwu afterSign] notarizing ${appPath}…`);
  const { notarize } = require("@electron/notarize");
  await notarize({
    appPath,
    appleId,
    appleIdPassword,
    teamId,
  });
  console.log("[wanwu afterSign] notarize OK");
};
