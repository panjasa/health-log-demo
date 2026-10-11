// Set on the Cloud Run revision at deploy time (CI / deploy scripts read the VERSION file).
export const appVersion = {
  version: process.env.APP_VERSION || 'dev',
  commit: process.env.GIT_SHA || 'local',
  revision: process.env.K_REVISION || 'local',
};

/** e.g. "1.0.0+abc1234" */
export const versionLabel = `${appVersion.version}+${appVersion.commit}`;
