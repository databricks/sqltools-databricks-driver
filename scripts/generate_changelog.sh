set -x
set -e

git tag -l --sort=-committerdate
TAG=$(git tag -l --sort=-committerdate | grep -E "release-v(([0-9]+\.){2}[0-9]+)" | head -n1)

latestChangelog=$(mktemp /tmp/generate_changelog.XXXXXX)
if [[ $TAG ]]; then
    echo "Release tag found. Generating changelog from $TAG"
    yarn conventional-changelog --tag-prefix="release-v" >> $latestChangelog
else
    echo "No release tag matching pattern 'release-v*' found. Generating changelog from begining"
    yarn conventional-changelog >> $latestChangelog
fi

cat $latestChangelog | grep -Ev "Release: v.+" >> $2

tmpfile=$(mktemp /tmp/generate_changelog.XXXXXX)
echo "# Release: v$1" >> $tmpfile
cat $latestChangelog | grep -Ev "Release: v.+" >> $tmpfile
cat CHANGELOG.md >> $tmpfile

cat $tmpfile > CHANGELOG.md
