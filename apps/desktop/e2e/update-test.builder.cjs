// Packaging for the update test only (CI: .github/workflows/desktop.yml, "An AppImage replaces
// itself"): the release's own configuration, AppImage only, with a version of the test's choosing
// and a generic feed on this machine instead of GitHub. Everything that runs is the release's:
// the same main process, the same electron-updater, the same quitAndInstall. Never published.
//   DRAFTER_TEST_VERSION=1.0.0 DRAFTER_TEST_FEED=http://127.0.0.1:47613/ DRAFTER_TEST_OUTPUT=/tmp/old \
//     electron-builder --config e2e/update-test.builder.cjs --linux --publish never
const release = require('../electron-builder.config.cjs');

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (see e2e/update-test.builder.cjs)`);
  return value;
}

/** @type {import('electron-builder').Configuration} */
module.exports = {
  ...release,
  extraMetadata: { version: required('DRAFTER_TEST_VERSION') },
  directories: { ...release.directories, output: required('DRAFTER_TEST_OUTPUT') },
  publish: [{ provider: 'generic', url: required('DRAFTER_TEST_FEED') }],
  linux: { ...release.linux, target: [{ target: 'AppImage', arch: ['x64'] }] },
};
