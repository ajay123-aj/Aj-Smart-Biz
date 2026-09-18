#!/usr/bin/env bash
# ------------------------------------------------------------------ #
# setup-cloudflare-dns.sh - make sure every domain in domains/ has an A record
# in Cloudflare pointing at this platform's server.
#
# Runs on the GitHub runner, not on the server: it talks to the Cloudflare API
# over HTTPS and needs nothing else. Run it by hand the same way:
#
#     CLOUDFLARE_API_TOKEN=... SERVER_IP=203.0.113.10 \
#       ./nginx-domains/setup-cloudflare-dns.sh
#
# ------------------------------ ordering ------------------------------ #
#
# This is the FIRST thing the workflow does, before the deploy and well before
# certbot, and the order is not arbitrary. Let's Encrypt validates a domain by
# resolving it and connecting to it. A domain with no A record cannot be
# validated, so a certificate cannot be issued, so the site has no HTTPS.
#
#     DNS (here)  ->  deploy the vhost  ->  certbot issues and installs
#
# Getting this backwards is the single most common reason a new domain comes up
# on plain HTTP and stays there.
#
# --------------------------- what it does --------------------------- #
#
# For every domain found in the repository's domain files:
#
#   * no A record            -> create it, pointing at SERVER_IP
#   * A record, right IP     -> report "already exists" and leave it alone
#   * A record, a DIFFERENT IP
#       -> update it to SERVER_IP, because a stale address is a site that is
#          down rather than a difference of opinion. Pass --no-update to report
#          the mismatch and change nothing instead
#   * a CNAME on the same name
#       -> refuse. DNS does not allow a CNAME beside an A record, and silently
#          deleting somebody's CNAME is not this script's decision to make
#   * a domain outside the managed zone (a tenant's own domain)
#       -> skip with a note. We have no access to a customer's DNS, and should
#          not
#
# It never deletes a record. Removing a .conf from git takes the vhost off the
# server; the DNS record is left pointing at a host that no longer answers for
# that name, which is recoverable. An automatic delete is not.
#
# ------------------------------ the token ------------------------------ #
#
# CLOUDFLARE_API_TOKEN must be a SCOPED API token, not the Global API Key:
#
#     Cloudflare dashboard -> My Profile -> API Tokens -> Create Token
#     -> Custom token
#          Permissions:  Zone | DNS | Edit
#          Zone Resources: Include | Specific zone | ajtechhub.com
#
# The Global API Key can do anything to any zone AND to the account itself, and
# cannot be scoped or revoked individually. A token limited to DNS edits on one
# zone is the difference between a leaked secret being an incident and being a
# catastrophe.
#
# The token is read from the environment and never printed. Cloudflare's own
# error responses are echoed, and they do not contain it.
# ------------------------------------------------------------------ #

set -euo pipefail

# --------------------------- configuration --------------------------- #

CF_API="https://api.cloudflare.com/client/v4"

# Where the domain files live. Relative to the repository root, because this
# runs from a checkout rather than from the server.
DOMAINS_DIR="${DOMAINS_DIR:-nginx-domains/domains}"

# The zone this script is allowed to touch. Anything not inside it is skipped.
CLOUDFLARE_ZONE="${CLOUDFLARE_ZONE:-ajtechhub.com}"
CLOUDFLARE_ZONE_ID="${CLOUDFLARE_ZONE_ID:-}"

SERVER_IP="${SERVER_IP:-}"

# 1 is Cloudflare's "automatic" TTL. A low TTL matters while things are moving:
# it is what lets a corrected IP take effect in minutes rather than a day.
RECORD_TTL="${RECORD_TTL:-60}"

# Orange cloud off by default, and that is deliberate rather than lazy.
# Proxying puts Cloudflare between the browser and this server, which changes
# how TLS terminates and how Let's Encrypt validates. Get the certificates
# working end to end first; then turn the proxy on per record in the dashboard
# and set SSL/TLS mode to "Full (strict)", which is the only mode that keeps
# the origin certificate meaningful.
PROXIED="${PROXIED:-false}"

UPDATE=1
DRY_RUN=0
WAIT_FOR_DNS="${WAIT_FOR_DNS:-1}"

# ------------------------------ logging ------------------------------ #

log()  { printf '%s [ info] %s\n' "$(date '+%Y-%m-%d %H:%M:%S %z')" "$*"; }
warn() { printf '%s [ warn] %s\n' "$(date '+%Y-%m-%d %H:%M:%S %z')" "$*" >&2; }
err()  { printf '%s [ERROR] %s\n' "$(date '+%Y-%m-%d %H:%M:%S %z')" "$*" >&2; }

# ----------------------------- arguments ----------------------------- #

while [ $# -gt 0 ]; do
  case "$1" in
    --no-update) UPDATE=0 ;;
    --dry-run)   DRY_RUN=1 ;;
    --proxied)   PROXIED=true ;;
    --ip)        SERVER_IP="${2:-}"; shift ;;
    --ip=*)      SERVER_IP="${1#--ip=}" ;;
    --zone)      CLOUDFLARE_ZONE="${2:-}"; shift ;;
    --zone=*)    CLOUDFLARE_ZONE="${1#--zone=}" ;;
    -h|--help)
      cat <<'USAGE'
Usage: setup-cloudflare-dns.sh [options]

  --dry-run      Report what would change and call no write API.
  --no-update    Report an A record that points somewhere else instead of
                 correcting it.
  --proxied      Create records with the Cloudflare proxy on (orange cloud).
                 Off by default - see the header for why.
  --ip ADDR      The A record target. Also read from SERVER_IP.
  --zone NAME    The Cloudflare zone to manage. Default: ajtechhub.com.

Environment: CLOUDFLARE_API_TOKEN (required), SERVER_IP, CLOUDFLARE_ZONE,
CLOUDFLARE_ZONE_ID, RECORD_TTL, DOMAINS_DIR.

Domains are discovered from the server_name lines in the domain files. There
is no domain list in this script.
USAGE
      exit 0
      ;;
    *) err "unknown argument: $1 (try --help)"; exit 2 ;;
  esac
  shift
done

# -------------------------- preflight checks -------------------------- #

for cmd in curl jq; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    err "$cmd is not installed, and this script needs it."
    err "  sudo apt-get install -y $cmd"
    exit 1
  fi
done

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  err "CLOUDFLARE_API_TOKEN is not set."
  err "Create a scoped token - Zone | DNS | Edit, restricted to $CLOUDFLARE_ZONE -"
  err "and put it in the repository secret CLOUDFLARE_API_TOKEN. Do not use the"
  err "Global API Key: it cannot be scoped and it can do anything to the account."
  exit 1
fi

if [ -z "$SERVER_IP" ]; then
  err "SERVER_IP is not set - there is no address to point the records at."
  err "Set the repository variable NGINX_SERVER_IP to the server's PUBLIC IPv4."
  exit 1
fi

# A hostname here would be accepted by Cloudflare's API for a CNAME and
# rejected for an A record, with an error that does not explain itself. A
# private address would be accepted and would simply never work from outside.
if [[ ! "$SERVER_IP" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
  err "SERVER_IP is '$SERVER_IP', which is not an IPv4 address."
  err "It must be the server's public address, not a hostname."
  exit 1
fi
case "$SERVER_IP" in
  10.*|127.*|169.254.*|192.168.*|172.1[6-9].*|172.2[0-9].*|172.3[01].*|0.*)
    err "SERVER_IP is $SERVER_IP, which is a private or loopback address."
    err "Cloudflare will accept it and nothing on the internet will reach it."
    err "Use the server's PUBLIC IPv4 - on the server: curl -s ifconfig.me"
    exit 1
    ;;
esac

# --------------------------- API helpers --------------------------- #
#
# One place that knows how to call Cloudflare, so the token is written once and
# every call is checked the same way. `--silent --show-error` keeps the
# progress meter out of the log while still reporting transport failures.

cf() {
  local method="$1" path="$2" body="${3:-}"
  local args=(--silent --show-error --fail-with-body --max-time 30
              -X "$method" "$CF_API$path"
              -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"
              -H "Content-Type: application/json")
  [ -n "$body" ] && args+=(--data "$body")
  curl "${args[@]}"
}

# Cloudflare returns HTTP 200 with "success": false for application-level
# errors, so the exit status of curl is not enough on its own.
cf_ok() { jq -e '.success == true' >/dev/null 2>&1 <<< "$1"; }

cf_errors() {
  jq -r '.errors[]? | "  cloudflare: [\(.code)] \(.message)"' <<< "$1" 2>/dev/null \
    || echo "  cloudflare: unparseable response"
}

# ------------------------------ the token ------------------------------ #
#
# Verified before anything else, so an expired or mistyped token fails in one
# line here rather than as a confusing 403 in the middle of the domain loop.

log "verifying the Cloudflare token"
resp="$(cf GET /user/tokens/verify || true)"
if ! cf_ok "$resp"; then
  err "the Cloudflare API token was rejected."
  cf_errors "$resp" >&2
  err "Check it is a scoped token with Zone | DNS | Edit on $CLOUDFLARE_ZONE,"
  err "that it has not expired, and that it was pasted whole."
  exit 1
fi

# ------------------------------- the zone ------------------------------- #

if [ -z "$CLOUDFLARE_ZONE_ID" ]; then
  log "looking up the zone $CLOUDFLARE_ZONE"
  resp="$(cf GET "/zones?name=$CLOUDFLARE_ZONE" || true)"
  if ! cf_ok "$resp"; then
    err "could not list zones."
    cf_errors "$resp" >&2
    exit 1
  fi
  CLOUDFLARE_ZONE_ID="$(jq -r '.result[0].id // empty' <<< "$resp")"
  if [ -z "$CLOUDFLARE_ZONE_ID" ]; then
    err "the token cannot see a zone called '$CLOUDFLARE_ZONE'."
    err "Either the name is wrong, or the token's Zone Resources do not include"
    err "it. A token scoped to a different zone lists nothing rather than"
    err "failing, which is why this looks like a missing domain."
    exit 1
  fi
fi
log "zone $CLOUDFLARE_ZONE is $CLOUDFLARE_ZONE_ID"

# --------------------------- find the domains --------------------------- #
#
# The same discovery rule as everything else in this system: read the
# server_name lines, never a hand-kept list. The `^[[:space:]]*` anchor matters
# because every domain file also mentions server_name in its comment header.

shopt -s nullglob

if [ ! -d "$DOMAINS_DIR" ]; then
  err "$DOMAINS_DIR does not exist. Run this from the repository root."
  exit 1
fi

# Pull the server_name values out of an nginx file.
#
# Comments are stripped FIRST, then the file is split on `;` so every directive
# lands on a line of its own. Both steps matter:
#
#   * without stripping comments, the header of every domain file - which
#     explains what server_name does - would be read as a list of domains and
#     handed to Cloudflare;
#   * without splitting on `;`, a compact block like
#     `server { listen 80; server_name x.example; }` would be missed entirely,
#     because server_name is not at the start of the line. Silently missing a
#     domain is the worst possible failure here: no record, no certificate, no
#     error - just a site that never comes up.
extract_server_names() {
  sed 's/#.*$//' "$1" 2>/dev/null \
    | tr ';' '\n' \
    | grep -E '^[[:space:]]*server_name[[:space:]]' || true
}

declare -a DOMAINS=()
for f in "$DOMAINS_DIR"/*.conf; do
  while IFS= read -r line; do
    line="${line%;}"
    read -r -a names <<< "$line"
    for n in "${names[@]:1}"; do
      case "$n" in
        ''|_|'*'*|'~'*|'.'*) continue ;;
      esac
      DOMAINS+=("$n")
    done
  done < <(extract_server_names "$f")
done

if [ "${#DOMAINS[@]}" -gt 0 ]; then
  mapfile -t DOMAINS < <(printf '%s\n' "${DOMAINS[@]}" | sort -u)
fi

if [ "${#DOMAINS[@]}" -eq 0 ]; then
  err "no server_name found in $DOMAINS_DIR/*.conf."
  exit 1
fi

log "found ${#DOMAINS[@]} domain(s) in $DOMAINS_DIR"
log "target A record: $SERVER_IP   proxied: $PROXIED   ttl: $RECORD_TTL"
[ "$DRY_RUN" -eq 1 ] && log "mode: DRY RUN - no record will be created or changed"

# ------------------------------ reconcile ------------------------------ #

created=0; existing=0; updated=0; skipped=0; failed=0
declare -a CREATED=()

for domain in "${DOMAINS[@]}"; do
  # Only touch names inside the zone this token owns. A tenant's own domain
  # lives in the tenant's Cloudflare account, and pointing it here is their
  # change to make, not ours.
  case "$domain" in
    "$CLOUDFLARE_ZONE"|*".$CLOUDFLARE_ZONE") ;;
    *)
      log "$domain - outside $CLOUDFLARE_ZONE, leaving its DNS alone"
      skipped=$((skipped + 1))
      continue
      ;;
  esac

  resp="$(cf GET "/zones/$CLOUDFLARE_ZONE_ID/dns_records?name=$domain" || true)"
  if ! cf_ok "$resp"; then
    err "$domain - could not read its existing records."
    cf_errors "$resp" >&2
    failed=$((failed + 1))
    continue
  fi

  # A CNAME cannot coexist with an A record on the same name. Deleting one that
  # somebody added on purpose is not a decision to make automatically.
  cname="$(jq -r '.result[] | select(.type=="CNAME") | .content' <<< "$resp" | head -1)"
  if [ -n "$cname" ]; then
    err "$domain - a CNAME to $cname already exists here."
    err "  DNS does not allow an A record beside a CNAME. Remove the CNAME in"
    err "  the Cloudflare dashboard if this name should point at the server."
    failed=$((failed + 1))
    continue
  fi

  # An AAAA would be preferred by any client with IPv6, so a stale one silently
  # overrides everything this script just did.
  aaaa="$(jq -r '.result[] | select(.type=="AAAA") | .content' <<< "$resp" | head -1)"
  if [ -n "$aaaa" ]; then
    warn "$domain - an AAAA record points at $aaaa."
    warn "  IPv6 clients will use that in preference to the A record below."
    warn "  Remove it, or point it at the server's IPv6 address."
  fi

  rec_id="$(jq -r '.result[] | select(.type=="A") | .id' <<< "$resp" | head -1)"
  rec_ip="$(jq -r '.result[] | select(.type=="A") | .content' <<< "$resp" | head -1)"

  # ---- already correct ----
  if [ -n "$rec_id" ] && [ "$rec_ip" = "$SERVER_IP" ]; then
    log "$domain - already created, A -> $rec_ip"
    existing=$((existing + 1))
    continue
  fi

  # ---- exists, wrong address ----
  if [ -n "$rec_id" ]; then
    if [ "$UPDATE" -eq 0 ]; then
      warn "::warning::$domain - A record points at $rec_ip, not $SERVER_IP."
      warn "  --no-update was given, so it was left as it is."
      skipped=$((skipped + 1))
      continue
    fi
    if [ "$DRY_RUN" -eq 1 ]; then
      log "$domain - would update A from $rec_ip to $SERVER_IP"
      updated=$((updated + 1))
      continue
    fi
    body="$(jq -nc --arg ip "$SERVER_IP" --argjson ttl "$RECORD_TTL" \
              --argjson proxied "$PROXIED" '{content:$ip,ttl:$ttl,proxied:$proxied}')"
    resp="$(cf PATCH "/zones/$CLOUDFLARE_ZONE_ID/dns_records/$rec_id" "$body" || true)"
    if cf_ok "$resp"; then
      log "$domain - updated A from $rec_ip to $SERVER_IP"
      updated=$((updated + 1))
      CREATED+=("$domain")
    else
      err "$domain - could not update its A record."
      cf_errors "$resp" >&2
      failed=$((failed + 1))
    fi
    continue
  fi

  # ---- does not exist ----
  if [ "$DRY_RUN" -eq 1 ]; then
    log "$domain - would create A -> $SERVER_IP"
    created=$((created + 1))
    continue
  fi
  body="$(jq -nc --arg name "$domain" --arg ip "$SERVER_IP" \
            --argjson ttl "$RECORD_TTL" --argjson proxied "$PROXIED" \
            '{type:"A",name:$name,content:$ip,ttl:$ttl,proxied:$proxied}')"
  resp="$(cf POST "/zones/$CLOUDFLARE_ZONE_ID/dns_records" "$body" || true)"
  if cf_ok "$resp"; then
    log "$domain - created A -> $SERVER_IP"
    created=$((created + 1))
    CREATED+=("$domain")
  else
    err "$domain - could not create its A record."
    cf_errors "$resp" >&2
    failed=$((failed + 1))
  fi
done

# ------------------------ wait for it to resolve ------------------------ #
#
# Cloudflare's edge is authoritative within seconds, but certbot runs a couple
# of minutes from now and a resolver that was asked about this name a moment
# ago may be holding a negative answer. Confirming the record is live here
# turns "certbot skipped the domain" into a problem already visible, with the
# record it was waiting on named.
#
# Queries Cloudflare's own resolver, not the runner's, because the runner's is
# the one most likely to have cached the NXDOMAIN.

if [ "$WAIT_FOR_DNS" = "1" ] && [ "$DRY_RUN" -eq 0 ] && [ "${#CREATED[@]}" -gt 0 ]; then
  log "waiting for ${#CREATED[@]} new record(s) to resolve"
  for domain in "${CREATED[@]}"; do
    for attempt in 1 2 3 4 5 6 7 8 9 10; do
      got="$(curl -s --max-time 10 \
               -H 'accept: application/dns-json' \
               "https://cloudflare-dns.com/dns-query?name=$domain&type=A" \
             | jq -r '.Answer[]? | select(.type==1) | .data' | head -1 || true)"
      if [ -n "$got" ]; then
        log "  $domain resolves to $got"
        break
      fi
      [ "$attempt" -eq 10 ] && warn "  $domain does not resolve yet - certbot may skip it this run."
      sleep 3
    done
  done
fi

# ------------------------------ summary ------------------------------ #

log "cloudflare dns finished"
log "  created          $created"
log "  already existed  $existing"
log "  updated          $updated"
log "  skipped          $skipped"
log "  failed           $failed"

# A record this script could not write is a real failure: the domain will not
# resolve, certbot will skip it, and the site will not come up. Fail the build
# rather than let the later steps report a confusing secondary symptom.
[ "$failed" -eq 0 ] || exit 1
exit 0
