#!/usr/bin/env bash
# ------------------------------------------------------------------ #
# setup-ssl.sh - hand every deployed domain to certbot, which issues the
# certificate and writes the TLS configuration into the deployed nginx file.
#
# Installed at /opt/nginx-domains/setup-ssl.sh, run as:
#
#     sudo -n /opt/nginx-domains/setup-ssl.sh
#
# The deploy workflow runs it after every successful deploy. Adding a .conf to
# git and pushing is all it takes to get a certificate.
#
# ---------------------------- the division ---------------------------- #
#
# The domain files in git describe ONE thing: a domain on port 80 and the app
# it proxies to. They contain no 443 block, no ssl_certificate and no redirect.
#
# certbot owns the other half. `certbot --nginx` reads the deployed server
# block, clones it into a 443 block with the certificate lines, and rewrites
# the port 80 block as a redirect. Nothing in this repository has to know what
# the current recommended cipher list is, or where the certificate lives, or
# how to write a redirect - certbot does, and it keeps that knowledge current
# through its own package updates.
#
# ------------------- why this runs on EVERY deploy ------------------- #
#
# Because a deploy undoes certbot's work, by design.
#
# deploy-nginx-domains.sh replaces /etc/nginx/conf.d/managed-<domain>.conf with
# the file from git - and the file in git is the port 80 proxy, without TLS. So
# every deploy strips the 443 block certbot added, and this script puts it back
# immediately afterwards.
#
# That is not a workaround; it is what keeps git authoritative for the proxy
# while certbot stays authoritative for TLS. The alternative - teaching the
# deploy to preserve certbot's edits - would mean a deployed file that no
# commit describes, and no way to tell a deliberate edit from a stale one.
#
# The cost is real and worth stating plainly: between the deploy's reload and
# this script finishing, a domain is served on plain HTTP and its HTTPS port
# has no server block. That window is seconds per domain. If it matters more
# than the simplicity does, the other arrangement is to write the 443 block
# into the domain files in git and use `certbot certonly` instead - see
# README.md section 10.
#
# ------------------------- what is NOT touched ------------------------- #
#
# Renewal. certbot's own timer renews certificates in place, and the deploy
# hook this script installs reloads nginx afterwards. A renewal changes files
# under /etc/letsencrypt only, which no part of this system manages.
#
# ----------------------------- rate limits ----------------------------- #
#
# Let's Encrypt allows 50 certificates per registered domain per week, and 5
# failed validations per hostname per hour.
#
# Two things keep this script from burning through either by accident:
#
#   * every domain is checked for DNS and for a reachable port 80 before
#     certbot is invoked at all. A domain that is not pointed here is skipped
#     rather than validated and failed;
#   * `--keep-until-expiring` means a certificate with more than 30 days left
#     is kept, not reissued. The run after every deploy re-installs the
#     configuration but does not ask Let's Encrypt for anything.
#
# Use `--staging` when testing changes to this script.
# ------------------------------------------------------------------ #

set -euo pipefail

# --------------------------- configuration --------------------------- #

ROOT="${NGINX_DOMAINS_ROOT:-/opt/nginx-domains}"
TARGET_DIR="${NGINX_CONF_D:-/etc/nginx/conf.d}"
PREFIX="managed-"

# Where Let's Encrypt sends expiry warnings if renewal ever stops working.
# This is the one address that will tell you before a certificate goes down, so
# it should be a mailbox somebody actually reads.
CERTBOT_EMAIL="${CERTBOT_EMAIL:-ajaymithapara2000@gmail.com}"

LE_LIVE="${LE_LIVE_DIR:-/etc/letsencrypt/live}"

STAGING=0
DRY_RUN=0
FORCE=0
SKIP_REACH=0

# ------------------------------ logging ------------------------------ #

log()  { printf '%s [ info] %s\n' "$(date '+%Y-%m-%d %H:%M:%S %z')" "$*"; }
warn() { printf '%s [ warn] %s\n' "$(date '+%Y-%m-%d %H:%M:%S %z')" "$*" >&2; }
err()  { printf '%s [ERROR] %s\n' "$(date '+%Y-%m-%d %H:%M:%S %z')" "$*" >&2; }

# ----------------------------- arguments ----------------------------- #

while [ $# -gt 0 ]; do
  case "$1" in
    --staging)   STAGING=1 ;;
    --dry-run)   DRY_RUN=1 ;;
    --force)     FORCE=1 ;;
    --skip-reachability-check) SKIP_REACH=1 ;;
    --email)     CERTBOT_EMAIL="${2:-}"; shift ;;
    --email=*)   CERTBOT_EMAIL="${1#--email=}" ;;
    -h|--help)
      cat <<'USAGE'
Usage: setup-ssl.sh [options]

  --staging      Use the Let's Encrypt staging environment. Certificates are
                 untrusted, but the rate limits are far higher. Use this when
                 testing changes to this script.
  --dry-run      Rehearse the validation without issuing or installing
                 anything. Proves DNS and port 80 are right.
  --force        Renew even if the certificate is not near expiry. Counts
                 against the weekly duplicate-certificate limit - do not loop.
  --email ADDR   Override the expiry-notice address for this run.
  --skip-reachability-check
                 Hand every domain to certbot without the DNS and port 80
                 pre-check. Only for a host where the check cannot work.

Domains are discovered from the server_name lines of the deployed configs.
There is no domain list in this script.
USAGE
      exit 0
      ;;
    *) err "unknown argument: $1 (try --help)"; exit 2 ;;
  esac
  shift
done

# -------------------------- preflight checks -------------------------- #

if [ "$(id -u)" -ne 0 ]; then
  err "must run as root - certbot writes to /etc/nginx and /etc/letsencrypt."
  err "Run: sudo -n $0"
  exit 1
fi

if ! command -v certbot >/dev/null 2>&1; then
  err "certbot is not installed. Install it with:"
  err "  sudo apt-get update && sudo apt-get install -y certbot python3-certbot-nginx"
  exit 1
fi

# The nginx plugin is a SEPARATE package from certbot itself, and its absence
# is the most common failure here. Without it `certbot --nginx` fails with a
# plugin error that does not say "apt-get install".
if ! certbot plugins --non-interactive 2>/dev/null | grep -q '^\* nginx$'; then
  err "certbot's nginx plugin is not installed. This script needs it - it is"
  err "what writes the 443 block into the deployed config. Install it with:"
  err "  sudo apt-get install -y python3-certbot-nginx"
  exit 1
fi

for cmd in nginx systemctl curl; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    err "$cmd is not installed, and this script needs it."
    exit 1
  fi
done

if [ ! -d "$TARGET_DIR" ]; then
  err "$TARGET_DIR does not exist. Deploy the configs first:"
  err "  sudo -n $ROOT/deploy-nginx-domains.sh"
  exit 1
fi

# A malformed address is not discovered until certbot rejects the account
# registration, several confusing steps later.
if [[ ! "$CERTBOT_EMAIL" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[A-Za-z]{2,}$ ]]; then
  err "'$CERTBOT_EMAIL' does not look like an email address."
  err "It is where Let's Encrypt sends expiry warnings, so it has to be real."
  exit 1
fi

log "certificate setup starting"
log "  notices to  $CERTBOT_EMAIL"
log "  reading     $TARGET_DIR/${PREFIX}*.conf"
log "  method      certbot --nginx (issues, then writes the 443 block)"
[ "$STAGING" -eq 1 ] && warn "STAGING - certificates issued now will NOT be trusted by browsers."
[ "$DRY_RUN" -eq 1 ] && log "  mode        DRY RUN - nothing will be issued or installed"

# --------------------------- find the domains --------------------------- #
#
# Read from the DEPLOYED files rather than from the repository copy, so this
# script certifies exactly what nginx is currently serving. If a deploy rolled
# back, the rolled-back set gets the certificates - not the set that failed.
#
# The `^[[:space:]]*` anchor matters: every one of these files mentions
# server_name in its comment header, and without the anchor each of those
# comments would be read as a domain and handed to Let's Encrypt.

shopt -s nullglob

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
for f in "$TARGET_DIR"/"$PREFIX"*.conf; do
  while IFS= read -r line; do
    line="${line%;}"
    read -r -a names <<< "$line"
    for n in "${names[@]:1}"; do          # [0] is the word "server_name"
      # nginx's wildcard, regex and catch-all forms have nothing to validate
      # and certbot would reject them anyway.
      case "$n" in
        ''|_|'*'*|'~'*|'.'*) continue ;;
      esac
      DOMAINS+=("$n")
    done
  done < <(extract_server_names "$f")
done

# De-duplicate: certbot clones one server block per certificate, and asking
# twice for the same name would install the same thing twice.
if [ "${#DOMAINS[@]}" -gt 0 ]; then
  mapfile -t DOMAINS < <(printf '%s\n' "${DOMAINS[@]}" | sort -u)
fi

if [ "${#DOMAINS[@]}" -eq 0 ]; then
  err "no server_name found in $TARGET_DIR/${PREFIX}*.conf."
  err "Deploy the configs first:  sudo -n $ROOT/deploy-nginx-domains.sh"
  exit 1
fi

log "found ${#DOMAINS[@]} domain(s): ${DOMAINS[*]}"

# ------------------------- reachability pre-check ------------------------- #
#
# Two cheap questions, asked in the order that produces the most useful answer:
# does the name resolve at all, and does something answer HTTP on it. Together
# they catch the two things that actually go wrong - the A record was never
# created, and port 80 is closed by a firewall or security group - before a
# failed validation is spent against the hourly limit.
#
# Deliberately NOT comparing the resolved address against this host's own
# addresses. Behind a cloud load balancer, a NAT gateway or a floating IP the
# public address is not bound locally, and that comparison would refuse to
# certify a domain that is working perfectly.

reachable() {
  local domain="$1" code

  if ! getent ahostsv4 "$domain" >/dev/null 2>&1; then
    warn "  $domain does not resolve - no A record yet."
    return 1
  fi

  # --max-time, because a firewall that drops rather than rejects would
  # otherwise hang this script for the full TCP timeout, once per domain.
  # curl writes 000 when it never got a response at all.
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 \
            "http://$domain/" 2>/dev/null || true)"

  if [ -z "$code" ] || [ "$code" = "000" ]; then
    warn "  $domain resolves, but nothing answered HTTP on port 80."
    warn "  Port 80 must stay open even after everything redirects to 443 -"
    warn "  it is how Let's Encrypt validates, on first issue and every renewal."
    return 1
  fi

  # Any status is fine, including 404 or 502. It only has to prove that a
  # request for this name reaches this nginx; what the app does with it is not
  # certbot's problem.
  return 0
}

# --------------------------- certificate state --------------------------- #

# Days left on the live certificate, or -1 if there is none.
days_left() {
  local live="$LE_LIVE/$1/cert.pem" end
  [ -f "$live" ] || { echo -1; return; }
  end="$(openssl x509 -enddate -noout -in "$live" 2>/dev/null | cut -d= -f2)" || { echo -1; return; }
  echo $(( ( $(date -d "$end" +%s) - $(date +%s) ) / 86400 ))
}

# ------------------------- issue and install ------------------------- #

installed=0; skipped=0; failed=0
declare -a NEEDS_DNS=()

for domain in "${DOMAINS[@]}"; do
  left="$(days_left "$domain")"

  if [ "$SKIP_REACH" -eq 0 ] && ! reachable "$domain"; then
    warn "::warning::$domain skipped - not reachable on http://$domain/ from this server."
    NEEDS_DNS+=("$domain")
    skipped=$((skipped + 1))
    continue
  fi

  if [ "$left" -lt 0 ]; then
    log "$domain - no certificate yet, requesting one and installing it"
  elif [ "$FORCE" -eq 1 ]; then
    log "$domain - $left day(s) left, forcing renewal"
  else
    log "$domain - certificate has $left day(s) left, re-installing the config"
  fi

  # One command does both halves:
  #
  #   --keep-until-expiring  keep a certificate that is not near expiry, and
  #                          carry on to the installer. Without it, certbot in
  #                          non-interactive mode errors out when a certificate
  #                          already exists - which is every run after the first
  #   --redirect             write the HTTP -> HTTPS redirect into the port 80
  #                          block. Non-interactive certbot demands --redirect
  #                          or --no-redirect; there is no default
  #   --cert-name            pin the lineage name to the domain, so
  #                          /etc/letsencrypt/live/<domain>/ is predictable and
  #                          certbot never invents a "-0001" suffix
  #
  # Assembled as an array so no argument can be word-split, and so each flag is
  # readable on its own line.
  args=(--nginx -d "$domain" --cert-name "$domain"
        --email "$CERTBOT_EMAIL" --agree-tos --no-eff-email
        --non-interactive --keep-until-expiring --redirect)
  [ "$STAGING" -eq 1 ] && args+=(--staging)
  [ "$DRY_RUN" -eq 1 ] && args+=(--dry-run)
  [ "$FORCE"   -eq 1 ] && args+=(--force-renewal)

  if certbot "${args[@]}"; then
    if [ "$DRY_RUN" -eq 0 ]; then
      log "$domain - HTTPS is live"
      installed=$((installed + 1))
    else
      log "$domain - dry run passed"
    fi
  else
    err "$domain - certbot failed. Its own output is above; /var/log/letsencrypt/"
    err "  has the detail. This domain is still served on plain HTTP."
    failed=$((failed + 1))
  fi
done

# --------------------------- the renewal hook --------------------------- #
#
# certbot's timer renews certificates, but nginx has already read the old one
# into memory: without this hook a certificate renews on disk and nginx keeps
# serving the expired one until something happens to reload it.
#
# A deploy hook runs only after a renewal actually succeeded, so this does not
# fire on the twice-daily no-op checks.

HOOK=/etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
if [ "$DRY_RUN" -eq 0 ]; then
  mkdir -p "$(dirname "$HOOK")"
  cat > "$HOOK" <<'HOOKEOF'
#!/bin/sh
# Installed by /opt/nginx-domains/setup-ssl.sh - do not edit by hand.
#
# Runs after certbot successfully renews a certificate. The renewed file is
# already at the path the nginx config points at, so a reload is all that is
# needed.
#
# `nginx -t` first: a reload with a broken configuration is refused by nginx
# anyway, but testing first means the failure is logged as what it is rather
# than as a renewal problem.
set -e
nginx -t
systemctl reload nginx
HOOKEOF
  chmod 755 "$HOOK"
  log "renewal hook installed at $HOOK"
fi

# --------------------------- the renewal timer --------------------------- #

if systemctl list-unit-files 2>/dev/null | grep -q '^certbot\.timer'; then
  if ! systemctl is-enabled --quiet certbot.timer 2>/dev/null; then
    systemctl enable --now certbot.timer
    log "enabled certbot.timer"
  fi
  log "renewal timer is active"
elif [ -f /etc/cron.d/certbot ]; then
  log "renewal is handled by /etc/cron.d/certbot"
else
  warn "no certbot timer or cron job found - certificates will NOT renew by"
  warn "  themselves. Check with: systemctl list-timers | grep certbot"
fi

# ------------------------------ verify ------------------------------ #
#
# certbot reloads nginx itself after a successful install, so there is nothing
# to reload here. This is a last look at the result: if certbot wrote something
# nginx cannot parse, it is better to say so now, with the command that shows
# it, than to leave it for the next unrelated deploy to discover.

if [ "$DRY_RUN" -eq 0 ] && [ "$installed" -gt 0 ]; then
  if ! nginx_output="$(nginx -t 2>&1)"; then
    err "nginx does not accept the configuration after certbot's changes:"
    printf '%s\n' "$nginx_output" >&2
    err "Inspect the deployed file and, if need be, redeploy to reset it:"
    err "  sudo -n $ROOT/deploy-nginx-domains.sh"
    exit 1
  fi
fi

# ------------------------------ summary ------------------------------ #

log "certificate setup finished"
log "  installed        $installed"
log "  skipped, no DNS  $skipped"
log "  failed           $failed"

if [ "${#NEEDS_DNS[@]}" -gt 0 ]; then
  warn "still on plain HTTP: ${NEEDS_DNS[*]}"
  warn "Point DNS at this server, open port 80, then run this script again."
fi

# A domain whose DNS is not pointed yet is a thing you have not done, not a
# broken deploy, so it does not fail the build - it prints a ::warning:: that
# GitHub surfaces on the run. A certbot error is a real failure and does.
[ "$failed" -eq 0 ] || exit 1
exit 0
