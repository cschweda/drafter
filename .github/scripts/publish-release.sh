#!/usr/bin/env bash
# Publishes the desktop packages to the GitHub Release of a tag, as one complete release:
#
#   publish-release.sh <tag> <folder with the .AppImage, the .deb, and latest-linux.yml>
#
# Needs GH_TOKEN (contents: write) and GH_REPO (owner/name), and runs from the repository root.
#   1. latest-linux.yml must agree with the files (every url there exists here, sha512 and size match).
#   2. The release for the tag is made as a DRAFT, or a draft that is already there is reused (a
#      re-run, or a run that stopped halfway), so nobody sees a release with files missing.
#   3. Every file is uploaded (--clobber, so a re-run replaces them), then checked against what the
#      release now holds (name, size, "uploaded").
#   4. Only then is the draft published (--prerelease when the tag contains "-", as in v0.5.0-rc.1).
# A release that is already published is only given the files again and checked; its notes and its
# state are left alone. Running it twice does no harm.
set -euo pipefail

tag=${1:?usage: publish-release.sh <tag> <folder>}
dir=${2:?usage: publish-release.sh <tag> <folder>}

node apps/desktop/scripts/check-update-feed.mjs "$dir"

shopt -s nullglob
files=("$dir"/*.AppImage "$dir"/*.deb "$dir/latest-linux.yml")
if [ "${#files[@]}" -ne 3 ]; then
  echo "::error::Expected one AppImage, one .deb, and latest-linux.yml in $dir; found: ${files[*]}"
  exit 1
fi

prerelease=()
case "$tag" in *-*) prerelease=(--prerelease) ;; esac

# "<id> <draft>" of the newest release for the tag (published or draft), or nothing.
find_release() {
  gh api --paginate "repos/$GH_REPO/releases" \
    --jq ".[] | select(.tag_name == \"$tag\") | \"\(.id) \(.draft)\"" | awk 'NR==1'
}

found=$(find_release || true)
if [ -z "$found" ]; then
  echo "No release for $tag: making a draft."
  gh release create "$tag" --draft --verify-tag --title "$tag" \
    --notes "Drafter $tag. See CHANGELOG.md for what changed." ${prerelease[@]+"${prerelease[@]}"}
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

gh release upload "$tag" "${files[@]}" --clobber

# What the release holds now must be what was built.
assets=$(gh api "repos/$GH_REPO/releases/$id" --jq '.assets[] | "\(.name) \(.size) \(.state)"')
echo "$assets"
for file in "${files[@]}"; do
  name=$(basename "$file")
  size=$(wc -c <"$file" | tr -d ' ')
  if ! grep -qx "$name $size uploaded" <<<"$assets"; then
    echo "::error::$name ($size bytes) is not on the release as an uploaded asset of that size"
    exit 1
  fi
done

if [ "$draft" = "true" ]; then
  gh release edit "$tag" --draft=false ${prerelease[@]+"${prerelease[@]}"}
  echo "Published $tag."
else
  echo "$tag was already published; its files were refreshed and checked."
fi
