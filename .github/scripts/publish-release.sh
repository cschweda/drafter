#!/usr/bin/env bash
# Publishes the desktop packages to the GitHub Release of a tag, as one complete release:
#
#   publish-release.sh <tag> <folder with the release's files>
#
# The folder holds the Linux packages (the .AppImage, the .deb, latest-linux.yml) and the Windows
# installers (x64 and arm64, latest.yml), every one of them (apps/desktop/scripts/check-release-assets.mjs):
# a release with one system's files missing is never made.
#
# Needs GH_TOKEN (contents: write), GH_REPO (owner/name), and jq, and runs from the repository root.
#   1. latest-linux.yml and latest.yml must agree with the files (every url there exists here, sha512
#      and size match) and give the same version, and latest.yml lists an installer for every
#      processor (x64 and arm64).
#   2. A release already PUBLISHED for the tag is never touched: its assets are compared with the
#      local files (name, size, and the digest when the API gives one), and the script fails if they
#      differ. A published release's files are what people have downloaded and what the updater
#      checks against; they are not replaced.
#   3. Otherwise the release is made as a DRAFT (or the tag's draft from an earlier run is reused),
#      so nobody sees a release with files missing. Every file is uploaded (--clobber replaces a
#      draft's earlier upload), then checked against what the draft now holds.
#   4. Only then is the draft published, by id (--prerelease when the tag contains "-", as in
#      v0.5.0-rc.1).
# Running it again after it finished only compares, and succeeds if nothing differs.
set -euo pipefail

tag=${1:?usage: publish-release.sh <tag> <folder>}
dir=${2:?usage: publish-release.sh <tag> <folder>}

node apps/desktop/scripts/check-update-feed.mjs --release "$dir" latest-linux.yml latest.yml
# Exactly one of each file, or nothing is made. Their names, one a line.
listing=$(node apps/desktop/scripts/check-release-assets.mjs --list "$dir")

prerelease=false
case "$tag" in *-*) prerelease=true ;; esac

# "<id> <draft>" of the release for the tag: a published one first, else the newest draft.
find_release() {
  gh api --paginate "repos/$GH_REPO/releases" |
    jq -r --arg tag "$tag" '[.[] | select(.tag_name == $tag)] | sort_by(.draft) | .[0] // empty | "\(.id) \(.draft)"' |
    awk 'NR==1'
}

# Compares the release's assets with the files in the folder; fails if they differ.
compare_with_release() {
  gh api "repos/$GH_REPO/releases/$1" --jq .assets | node apps/desktop/scripts/check-release-assets.mjs "$dir"
}

found=$(find_release || true)
if [ -z "$found" ]; then
  echo "No release for $tag: making a draft."
  gh release create "$tag" --draft --verify-tag --title "$tag" \
    --notes "Drafter $tag. See CHANGELOG.md for what changed."
  # A new draft takes a moment to show in the list.
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    found=$(find_release || true)
    [ -n "$found" ] && break
    sleep 3
  done
  if [ -z "$found" ]; then
    echo "::error::The draft release for $tag was made but is not in the list"
    exit 1
  fi
fi
read -r id draft <<<"$found"
echo "Release $id for $tag (draft: $draft)."

if [ "$draft" != "true" ]; then
  echo "$tag is already published: not uploading. Comparing its files with these."
  compare_with_release "$id"
  exit 0
fi

files=()
while IFS= read -r name; do files+=("$dir/$name"); done <<<"$listing"
gh release upload "$tag" "${files[@]}" --clobber

# What the draft holds now must be what was built.
compare_with_release "$id"

gh api -X PATCH "repos/$GH_REPO/releases/$id" -F draft=false -F prerelease="$prerelease" --jq '.html_url'
echo "Published $tag."
