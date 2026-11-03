#!/usr/bin/env bash
# STAR CAP: never more than 500 stars. A bigger repo is never a target, even if the query asks for it (a maintainer blocked us after a PR to a large org). Enforced below, not only by the query.
# Usage: scan-repos.sh "<github repo search query>" [limit]
#        scan-repos.sh "issues:<github issue search terms>" [limit]   (start from repos with fresh good-first/help-wanted issues)
# Prints one JSON object per repo: activity, how outsiders fare, setup pain, policy flags and a score. Needs gh and jq. Read-only.
set -uo pipefail
query="${1:?search query}"; limit="${2:-30}"
now=$(date -u +%s)
ago() { date -u -v-"$1"d +%F 2>/dev/null || date -u -d "$1 days ago" +%F; }
days() { echo $(( (now - $(date -u -j -f "%Y-%m-%dT%H:%M:%SZ" "$1" +%s 2>/dev/null || date -u -d "$1" +%s)) / 86400 )); }
since=$(ago 14)
case "$query" in *stars:*) stars="" ;; *) stars="stars:10..500" ;; esac
find_repos() {
  case "$query" in
  issues:*) # Repos with fresh "good first issue"/"help wanted" issues: maintainers who invite outside help.
    gh api -X GET search/issues -f q="${query#issues:} is:issue is:open created:>$(ago 30) label:\"good first issue\",\"help wanted\"" -f per_page=100 \
      -q '.items[].repository_url|sub(".*/repos/";"")' | sort -u |
      while read -r r; do gh api "repos/$r" -q 'select(.fork|not)|select(.archived|not)|select(.stargazers_count>=10 and .stargazers_count<=500)|[.full_name,.pushed_at,.stargazers_count]|@tsv' 2>/dev/null; done | head -n "$limit" ;;
  *)
    gh api -X GET search/repositories -f q="$query pushed:>$since $stars archived:false fork:false" -f sort=updated -f per_page="$limit" \
      -q '.items[]|select(.stargazers_count<=500)|[.full_name,.pushed_at,.stargazers_count]|@tsv' ;;
  esac
}
find_repos |
while IFS=$'\t' read -r repo pushed stars; do
  pd=$(days "$pushed")
  [ "$pd" -le 14 ] || continue
  # Last 50 closed PRs with author_association: outsiders = not OWNER/MEMBER/COLLABORATOR, bots excluded.
  pulls=$(gh api "repos/$repo/pulls?state=closed&per_page=50" 2>/dev/null || echo '[]')
  stats=$(echo "$pulls" | jq --argjson now "$now" '
    def recent: select(.merged_at != null and ($now - (.merged_at|fromdateiso8601)) < 5184000);
    def outsider: select((.author_association|IN("OWNER","MEMBER","COLLABORATOR")|not) and (.user.type != "Bot") and (.user.login|test("\\[bot\\]|dependabot|renovate")|not));
    {merged60: [.[]|recent]|length,
     outsiderMerged60: [.[]|recent|outsider]|length,
     outsiderAuthors60: [.[]|recent|outsider|.user.login]|unique|length,
     outsiderClosedUnmerged: [.[]|outsider|select(.merged_at == null)]|length,
     authors60: [.[]|recent|select(.user.type != "Bot")|.user.login]|unique|length,
     medHoursOutsider: ([.[]|recent|outsider|((.merged_at|fromdateiso8601)-(.created_at|fromdateiso8601))/3600]|sort|if length==0 then null else .[length/2|floor]|floor end)}')
  # Contribution farms (hackathon/bounty events) merge anything: a merge there says nothing about a real maintainer.
  farm=$(gh api "repos/$repo/labels?per_page=100" -q '[.[].name|ascii_downcase|select(test("gssoc|hacktoberfest|bounty|onlydust|drips|wave|swoc|jwoc|ssoc|points|level ?[0-9]"))]|length' 2>/dev/null || echo 0)
  case "$repo" in flisk-sh/*) continue ;; esac
  echo "$repo" | grep -qiE 'contribution|first-?contributions|hacktoberfest' && farm=$((farm+5))
  meta=$(gh api "repos/$repo" -q '{discussions: .has_discussions, license: (.license.spdx_id // null), owner: .owner.type}' 2>/dev/null || echo '{}')
  tree=$(gh api "repos/$repo/git/trees/HEAD?recursive=1" -q '.tree[].path' 2>/dev/null || true)
  compose=$(echo "$tree" | grep -ciE '(^|/)(docker-)?compose[^/]*\.ya?ml$' || true)
  dockerfiles=$(echo "$tree" | grep -ciE '(^|/)Dockerfile' || true)
  procfile=$(echo "$tree" | grep -ciE '(^|/)Procfile$' || true)
  flisk=$(echo "$tree" | grep -c 'service.json' || true)
  contribf=$(echo "$tree" | grep -iE '^(\.github/|docs/)?CONTRIBUTING' | head -1)
  # Policy flags from CONTRIBUTING: AI-contribution rules and CLA.
  policy=""
  if [ -n "$contribf" ]; then
    txt=$(gh api "repos/$repo/contents/$contribf" -H "Accept: application/vnd.github.raw" 2>/dev/null || true)
    echo "$txt" | grep -qiE '\b(AI|LLM|Copilot|ChatGPT|Claude|generated)\b' && policy="$policy ai-policy"
    echo "$txt" | grep -qiE '\bCLA\b|contributor license' && policy="$policy cla"
  fi
  echo "$tree" | grep -qiE '(^|/)(CLA(\.md|\.txt)?|\.clabot|cla\.json)$' && policy="$policy cla"
  # Setup pain: open issues from the last 120 days about getting it running locally.
  pain=$(gh api -X GET search/issues -f q="repo:$repo is:issue is:open created:>$(ago 120) setup OR install OR \"docker compose\" OR \"local development\" OR \"getting started\" OR \"doesn't start\"" -q .total_count 2>/dev/null || echo 0)
  sleep 2 # search API: 30 requests a minute
  jq -nc --arg repo "$repo" --argjson pd "$pd" --argjson stars "$stars" --argjson s "$stats" --argjson m "$meta" \
    --argjson compose "$compose" --argjson dockerfiles "$dockerfiles" --argjson procfile "$procfile" --argjson flisk "$flisk" \
    --arg contrib "$contribf" --arg policy "${policy# }" --argjson pain "$pain" --argjson farm "$farm" '
    (([$s.outsiderAuthors60,5]|min)*4 + ([$s.authors60,5]|min)*2 + ([$pain,5]|min)*2 + ([$compose+$dockerfiles+$procfile,4]|min)
      + (if $s.medHoursOutsider != null and $s.medHoursOutsider < 72 then 3 else 0 end)
      + (if $m.discussions then 1 else 0 end)
      - (if ($policy|test("ai-policy")) then 4 else 0 end) - (if ($policy|test("cla")) then 6 else 0 end)
      - (if $s.authors60 <= 1 then 6 else 0 end) - (if $farm > 0 then 20 else 0 end) - (if $flisk > 0 then 10 else 0 end)) as $raw |
    (($farm > 0) or ($s.outsiderAuthors60 > $stars and $s.outsiderAuthors60 >= 10)) as $isFarm |
    (if $isFarm then -99 else $raw end) as $score |
    {repo:$repo,score:$score,stars:$stars,daysSincePush:$pd} + $s + $m +
    {farm:$isFarm,farmLabels:$farm,compose:$compose,dockerfiles:$dockerfiles,procfile:$procfile,setupPainIssues:$pain,hasFlisk:($flisk>0),contributing:$contrib,policy:$policy}'
done
