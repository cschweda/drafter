#!/usr/bin/env bash
set -euo pipefail

# drafter-mcp publish script: puts a release's Drafter for Claude on npm, from your machine.
#
# Usage:
#   ./publish.sh             publish packages/mcp/package.json's version of drafter-mcp to npm
#   ./publish.sh --dry-run   run every check and a dry-run publish; change nothing, ask for no
#                            code (if you're not logged in to npm, it warns instead of logging in)
#   ./publish.sh --help      print this
#
# A release comes first, and this script never makes one: bump every package together, add the
# CHANGELOG.md section, merge, and push the tag (vX.Y.Z). The desktop workflow builds and tests,
# and puts drafter-mcp-<version>.js and its .sha256 on the tag's GitHub Release. Then, from main:
# ./publish.sh --dry-run, then ./publish.sh. There is no version argument and no bump: the version
# is the release's. A publish asks for npm's 6-digit two-factor code last, just before it
# publishes: a code lasts about 30 seconds, and the checks take minutes.
#
# Works in Git Bash on Windows as well as on macOS and Linux.
#
# Before anything is published, it checks that:
#   - you're in the Drafter repository's root, on main (or at the release's tag), up to date with
#     origin/main, with a clean tree, and logged in to npm and to the GitHub CLI;
#   - the release exists: the tag v<version> is on this branch, CHANGELOG.md has its section, the
#     desktop workflow passed for it, and its published GitHub Release holds drafter-mcp-<version>.js
#     and its .sha256; and drafter-mcp@<version> isn't on npm yet;
#   - the tag's own commit (in a temporary worktree, so nothing later on main leaks in) installs,
#     builds, passes drafter-mcp's tests, and stages the npm package;
#   - the staged drafter-mcp.js is byte for byte the GitHub Release's file, whose SHA-256 matches
#     its .sha256; the Release's own file is what goes in the package;
#   - the package holds package.json, README.md, LICENSE, and drafter-mcp.js and nothing else, with
#     no dependencies or scripts, and the packed tarball installs and runs.
# It then shows the commits in the release, asks for the version to be typed, and then for npm's
# two-factor code. What it publishes is the tarball it installed and ran. It never commits, tags,
# or pushes: the release did those.

PACKAGE_NAME="drafter-mcp"
BRANCH="main"
MANIFEST="packages/mcp/package.json"
WORKFLOW="desktop.yml"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'
info() { echo -e "${GREEN}[drafter-mcp]${NC} $1"; }
warn() { echo -e "${YELLOW}[drafter-mcp]${NC} $1"; }
error() { echo -e "${RED}[drafter-mcp]${NC} $1" >&2; }
die() {
  error "$1"
  exit 1
}

# The usage: the comment at the top of this file, from "Usage:" to the first blank comment line.
usage() {
  awk '/^# Usage:/ { on = 1 } on && /^#$/ { exit } on { sub(/^# ?/, ""); print }' "$0"
}

# ─── Arguments ──────────────────────────────────────────────────────

DRY_RUN=false
if [[ $# -gt 1 ]]; then
  usage
  die "publish.sh takes one argument at most (--dry-run or --help). The version is the release's."
fi
case "${1:-}" in
  "") ;;
  --dry-run) DRY_RUN=true ;;
  --help | -h)
    usage
    exit 0
    ;;
  *)
    usage
    die "Unknown argument '$1'. There is no version argument: the version is the release's."
    ;;
esac

# A problem that stops a publish, and that a dry run only warns about (so it can show the rest).
problem() {
  if [[ "$DRY_RUN" == true ]]; then
    warn "$1 A publish would stop here."
  else
    die "$1"
  fi
}

# Read the workspace manifest with Node (CommonJS, whatever the package's type).
pkg_field() {
  node --input-type=commonjs -e "console.log(require(require('path').resolve(process.argv[1])).$1)" "$MANIFEST"
}

# The SHA-256 of a file, in hex (sha256sum isn't on every Mac, shasum isn't in every Git Bash).
sha256_of() {
  node --input-type=commonjs -e '
    const data = require("fs").readFileSync(process.argv[1]);
    console.log(require("crypto").createHash("sha256").update(data).digest("hex"));
  ' "$1"
}

# ─── Clean up on the way out ────────────────────────────────────────

WORK=""
WORKTREE=""
cleanup() {
  if [[ -n "$WORKTREE" ]]; then
    git worktree remove --force "$WORKTREE" >/dev/null 2>&1 || true
    git worktree prune >/dev/null 2>&1 || true
  fi
  [[ -z "$WORK" ]] || rm -rf "$WORK"
}
trap cleanup EXIT

# ─── Preflight ──────────────────────────────────────────────────────

[[ -f pnpm-workspace.yaml && -f "$MANIFEST" ]] ||
  die "No pnpm-workspace.yaml or $MANIFEST here. Run this from the Drafter repository's root."
for tool in git node pnpm npm gh; do
  command -v "$tool" >/dev/null || die "$tool is required."
done
[[ "$(pkg_field name)" == "$PACKAGE_NAME" ]] || die "$MANIFEST isn't $PACKAGE_NAME."
gh auth status >/dev/null 2>&1 || die "The GitHub CLI isn't logged in (gh auth login)."

VERSION=$(pkg_field version)
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]] || die "$MANIFEST has no usable version ('$VERSION')."
TAG="v$VERSION"
info "Version: $VERSION (tag $TAG)"

if [[ -n "$(git status --porcelain)" ]]; then
  git status --short
  die "Uncommitted changes. Commit or stash them first."
fi

info "Fetching origin/$BRANCH and the tags..."
git fetch --quiet origin "$BRANCH" --tags
HEAD_COMMIT=$(git rev-parse HEAD)
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
AT_TAG=false
[[ "$(git describe --tags --exact-match HEAD 2>/dev/null || true)" == "$TAG" ]] && AT_TAG=true
if [[ "$CURRENT_BRANCH" != "$BRANCH" && "$AT_TAG" == false ]]; then
  problem "Publish from $BRANCH or from the tag $TAG (you're on $CURRENT_BRANCH)."
fi
if [[ "$HEAD_COMMIT" != "$(git rev-parse "origin/$BRANCH")" && "$AT_TAG" == false ]]; then
  problem "$BRANCH and origin/$BRANCH differ, and HEAD isn't the tag $TAG. Pull first."
fi

if npm whoami >/dev/null 2>&1; then
  info "npm user: $(npm whoami)"
elif [[ "$DRY_RUN" == true ]]; then
  # Logging in writes a token to ~/.npmrc, and a dry run changes nothing.
  warn "Not logged in to npm. The dry run continues; a real publish will ask you to log in."
else
  warn "Not logged in to npm. Logging in now..."
  npm login
  info "npm user: $(npm whoami)"
fi

# ─── The release must exist first ───────────────────────────────────

if npm view "$PACKAGE_NAME@$VERSION" version >/dev/null 2>&1; then
  die "$PACKAGE_NAME@$VERSION is already on npm."
fi
FIRST_TIME=false
if ! npm view "$PACKAGE_NAME" version >/dev/null 2>&1; then
  FIRST_TIME=true
  warn "$PACKAGE_NAME isn't on npm yet: this is its first publish."
fi

TAG_COMMIT=""
if TAG_COMMIT=$(git rev-parse -q --verify "refs/tags/$TAG^{commit}"); then
  git merge-base --is-ancestor "$TAG_COMMIT" HEAD ||
    problem "The tag $TAG ($TAG_COMMIT) isn't on this branch."
  info "The tag $TAG marks $TAG_COMMIT."
else
  TAG_COMMIT=""
  problem "There's no tag $TAG. Make the release first (bump, merge, push the tag)."
fi

# A fixed string, so the dots in the version are dots (^ isn't needed: "## [" starts a section).
if grep -qF "## [$VERSION]" CHANGELOG.md; then
  info "CHANGELOG.md has a section for $VERSION."
else
  problem "CHANGELOG.md has no '## [$VERSION]' section."
fi

# Only the tag's run of the desktop workflow counts, and only when it finished and passed.
CI=$(gh run list --workflow "$WORKFLOW" --branch "$TAG" --limit 1 \
  --json status,conclusion --jq '.[0] | "\(.status) \(.conclusion)"' 2>/dev/null || true)
case "$CI" in
  "completed success") info "The $WORKFLOW run for $TAG passed." ;;
  "" | "null null") problem "No $WORKFLOW run found for $TAG." ;;
  *) problem "The $WORKFLOW run for $TAG hasn't passed (${CI% })." ;;
esac

ASSET="$PACKAGE_NAME-$VERSION.js"
RELEASE=$(gh release view "$TAG" --json isDraft,assets \
  --jq '"\(.isDraft) " + ([.assets[].name] | join(" "))' 2>/dev/null || true)
RELEASE_OK=false
if [[ -z "$RELEASE" ]]; then
  problem "There's no GitHub Release for $TAG."
elif [[ "${RELEASE%% *}" != "false" ]]; then
  problem "The GitHub Release for $TAG is still a draft."
elif [[ " $RELEASE " != *" $ASSET "* || " $RELEASE " != *" $ASSET.sha256 "* ]]; then
  problem "The GitHub Release for $TAG doesn't hold $ASSET and $ASSET.sha256."
else
  RELEASE_OK=true
  info "The GitHub Release for $TAG holds $ASSET and its .sha256."
fi

# ─── Build and check, at the tag's commit ───────────────────────────

WORK=$(mktemp -d)
WORKTREE="$WORK/source"
STAGE="$WORK/stage"
if [[ -n "$TAG_COMMIT" ]]; then
  BUILD_AT="$TAG"
else
  # Only a dry run gets here without a tag: it builds this commit instead, to show the rest.
  BUILD_AT="$HEAD_COMMIT"
  warn "Building this commit instead of the tag, for the dry run."
fi
info "Checking out $BUILD_AT in a temporary worktree..."
# Line endings exactly as committed (LF), whatever this machine's Git says: a Windows checkout with
# core.autocrlf=true would put CRLF in the bundle, and it would never match the Release's file.
git -c core.autocrlf=false -c core.eol=lf worktree add --quiet --detach "$WORKTREE" "$BUILD_AT"
(
  cd "$WORKTREE"
  # No install scripts: building and testing drafter-mcp needs none (Electron's download is the
  # desktop app's), and the repository's own `prepare` would set Git's hooks path.
  pnpm install --frozen-lockfile --ignore-scripts
  pnpm --filter "$PACKAGE_NAME..." build
  pnpm --filter "$PACKAGE_NAME" test
  node packages/mcp/scripts/stage.mjs "$STAGE"
) || die "The build, the tests, or the staging failed at $BUILD_AT."
info "Built, tested, and staged at $BUILD_AT."

# ─── Same bytes as the GitHub Release ───────────────────────────────

if [[ "$RELEASE_OK" == true ]]; then
  DOWNLOAD="$WORK/release"
  mkdir "$DOWNLOAD"
  gh release download "$TAG" --dir "$DOWNLOAD" --pattern "$ASSET" --pattern "$ASSET.sha256"
  RELEASED=$(sha256_of "$DOWNLOAD/$ASSET")
  LISTED=$(awk 'NR == 1 { print $1 }' "$DOWNLOAD/$ASSET.sha256")
  NAMED=$(awk 'NR == 1 { print $2 }' "$DOWNLOAD/$ASSET.sha256")
  STAGED=$(sha256_of "$STAGE/drafter-mcp.js")
  [[ "$RELEASED" == "$LISTED" && "$NAMED" == "$ASSET" ]] ||
    die "The Release's $ASSET doesn't match its .sha256 ($RELEASED, listed $LISTED for $NAMED)."
  [[ "$RELEASED" == "$STAGED" ]] ||
    die "npm would get a different file from the GitHub Release ($STAGED here, $RELEASED there)."
  # The same bytes, so this changes nothing; it makes plain that npm gets the Release's file.
  cp "$DOWNLOAD/$ASSET" "$STAGE/drafter-mcp.js"
  chmod 755 "$STAGE/drafter-mcp.js"
  info "The staged drafter-mcp.js is the GitHub Release's file (SHA-256 $RELEASED)."
else
  problem "Couldn't compare with the GitHub Release's file."
fi

# ─── What's in the package ──────────────────────────────────────────

# The bundle carries every dependency it has, so the package has none: nothing to lock, nothing to
# audit, and nothing that runs on install.
info "Checking the packed files..."
PACKED="$WORK/packed"
mkdir "$PACKED"
FILES=$(npm pack "$STAGE" --pack-destination "$PACKED" --json --ignore-scripts |
  node --input-type=commonjs -e '
    const [pack] = JSON.parse(require("fs").readFileSync(0, "utf8"));
    console.log(pack.files.map((f) => f.path).sort().join("\n"));
  ')
EXPECTED=$(printf '%s\n' LICENSE README.md drafter-mcp.js package.json)
[[ "$FILES" == "$EXPECTED" ]] ||
  die "The package should hold exactly package.json, README.md, LICENSE, and drafter-mcp.js; it holds:"$'\n'"$FILES"
head -1 "$STAGE/drafter-mcp.js" | grep -qx '#!/usr/bin/env node' ||
  die "drafter-mcp.js has no #!/usr/bin/env node line."
node --input-type=commonjs -e '
  const pkg = require(require("path").resolve(process.argv[1], "package.json"));
  const extra = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies", "scripts"]
    .filter((field) => field in pkg);
  if (extra.length > 0) { console.error(extra.join(", ")); process.exit(1); }
' "$STAGE" || die "The staged package.json has dependencies or scripts; it should have neither."
TARBALL=$(ls "$PACKED"/*.tgz)
info "4 files; no dependencies, no scripts: $(basename "$TARBALL")"

# ─── Install the real tarball and run it ────────────────────────────

info "Installing the packed tarball in a scratch project..."
SCRATCH="$WORK/scratch"
mkdir "$SCRATCH"
(
  cd "$SCRATCH"
  npm init -y >/dev/null
  npm install --ignore-scripts --no-audit --no-fund "$TARBALL" >/dev/null
  INSTALLED=$(npx --no-install drafter-mcp --version)
  [[ "$INSTALLED" == "$VERSION" ]] || {
    echo "drafter-mcp --version printed '$INSTALLED', expected '$VERSION'" >&2
    exit 1
  }
  set +e
  REFUSED=$(npx --no-install drafter-mcp 2>&1 >/dev/null </dev/null)
  STATUS=$?
  set -e
  [[ "$STATUS" == 1 && "$REFUSED" == *"Give at least one folder: --folder <path>."* ]] || {
    echo "drafter-mcp with no folder exited $STATUS and said: $REFUSED" >&2
    exit 1
  }
) || die "The packed tarball didn't install and run."
info "The packed tarball installs, prints $VERSION, and asks for a folder when given none."

# ─── Dry run ────────────────────────────────────────────────────────

NPM_TAG=()
# A pre-release (1.2.3-rc.1) goes out as `next`, never as what `npx drafter-mcp` gets.
[[ "$VERSION" == *-* ]] && NPM_TAG=(--tag next)

info "npm publish --dry-run..."
npm publish "$TARBALL" --dry-run --access public --ignore-scripts ${NPM_TAG[@]+"${NPM_TAG[@]}"}

# What's in the release, and who made it: shown by a dry run as well as a publish, to look over
# before anything goes out. A commit's author and subject are anyone's words, so a control
# character in them is shown as an escape.
TO="${TAG_COMMIT:-$HEAD_COMMIT}"
PREVIOUS=$(git describe --tags --abbrev=0 "$TO^" 2>/dev/null || true)
if [[ -n "$PREVIOUS" ]]; then
  info "The commits since $PREVIOUS, and who made them:"
  git log --format='  %h  %an  %s' "$PREVIOUS..$TO" |
    node --input-type=commonjs -e '
      const text = require("fs").readFileSync(0, "utf8");
      const shown = (c) => "\\u{" + c.codePointAt(0).toString(16) + "}";
      process.stdout.write(text.replace(/(?![\n\t])[\p{Cc}\p{Cf}\u{2028}\u{2029}]/gu, shown));
    '
fi

if [[ "$DRY_RUN" == true ]]; then
  info "Dry run complete. Nothing was published or changed."
  exit 0
fi

# ─── Confirm ────────────────────────────────────────────────────────

echo ""
if [[ "$FIRST_TIME" == true ]]; then
  warn "About to publish $PACKAGE_NAME@$VERSION (FIRST TIME, public)."
else
  warn "About to publish $PACKAGE_NAME@$VERSION."
fi
read -r -p "To publish it, type the version ($VERSION): " REPLY || REPLY=""
[[ "$REPLY" == "$VERSION" ]] || {
  info "Aborted. Nothing was published."
  exit 0
}

# ─── Publish ────────────────────────────────────────────────────────

# npm asks every publish for a fresh two-factor code, and a code lasts about 30 seconds, so it's
# asked for now, after every check and the typed version.
read -r -p "npm's 6-digit two-factor code: " OTP || OTP=""
[[ "$OTP" =~ ^[0-9]{6}$ ]] ||
  die "That isn't a 6-digit code, so nothing was published. Run ./publish.sh again, and type npm's code when it asks."

# The tarball that was installed and run above, not a new one packed from the folder.
npm publish "$TARBALL" --access public --ignore-scripts --otp "$OTP" ${NPM_TAG[@]+"${NPM_TAG[@]}"}

# The registry can take a moment to answer for a new version.
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if [[ "$(npm view "$PACKAGE_NAME@$VERSION" version 2>/dev/null || true)" == "$VERSION" ]]; then
    break
  fi
  sleep 3
done
[[ "$(npm view "$PACKAGE_NAME@$VERSION" version 2>/dev/null || true)" == "$VERSION" ]] ||
  die "npm took the publish, but doesn't list $PACKAGE_NAME@$VERSION yet. Look at https://www.npmjs.com/package/$PACKAGE_NAME before running this again."

echo ""
info "Published $PACKAGE_NAME@$VERSION."
info "npm: https://www.npmjs.com/package/$PACKAGE_NAME"
info "Try it: npx -y $PACKAGE_NAME@$VERSION --help"
