/**
 * Ensures afterSign no-ops without Apple secrets (does not call notarize).
 */
process.env.APPLE_ID = "";
process.env.APPLE_APP_SPECIFIC_PASSWORD = "";
process.env.APPLE_TEAM_ID = "";
delete process.env.APPLE_ID;
delete process.env.APPLE_APP_SPECIFIC_PASSWORD;
delete process.env.APPLE_TEAM_ID;

const afterSign = require("./afterSign-notarize.cjs").default;

afterSign({
  electronPlatformName: "darwin",
  appOutDir: "/tmp/nonexistent-out",
  packager: { appInfo: { productFilename: "Wanwu Code" } },
})
  .then(() => {
    console.log("afterSign skip-without-secrets OK");
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
