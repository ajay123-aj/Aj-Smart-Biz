#!/usr/bin/env bash
# ------------------------------------------------------------------ #
# install-server.sh - the one-time server setup, done once, by hand, as root.
#
#     sudo ./nginx-domains/install-server.sh
#
# The deploy workflow does NOT run this. Everything here is a privileged,
# one-off change - installing packages, creating /opt/nginx-domains, and
# granting sudo - and none of it should happen automatically on a push.
#
# Safe to run again. Every step checks before it acts, so a second run reports
# what is already in place and changes nothing.
#
# --------------------------- the sudoers file --------------------------- #
#
# The one genuinely dangerous part, and the reason this is a script rather than
# a list of commands in a README.
#
# A syntax error in /etc/sudoers.d/ does not fail politely: sudo refuses to
# parse the whole directory and every sudo on the machine stops working,
# including the one you would use to fix it. On a server you only reach over
# SSH that is an unrecoverable mistake.
#
# So the rule is written to a temporary file, checked with `visudo -c`, and
# only installed into /etc/sudoers.d/ once it has passed. A bad rule leaves the
# system exactly as it was.
# ------------------------------------------------------------------ #

set -euo pipefail

SUDOERS=/etc/sudoers.d/nginx-domains
ROOT="${NGINX_DOMAINS_ROOT:-/opt/nginx-domains}"

log()  { printf '  %s\n' "$*"; }
ok()   { printf '  ok    %s\n' "$*"; }
did()  { printf '  DID   %s\n' "$*"; }
err()  { printf '  ERROR %s\n' "$*" >&2; }
step() { printf '\n== %s ==\n' "$*"; }

if [ "$(id -u)" -ne 0 ]; then
  err "must run as root:  sudo $0"
  exit 1
fi

# ------------------------- 1. the runner user ------------------------- #

step "the runner user"

RUNNER_USER="${1:-${RUNNER_USER:-}}"

if [ -z "$RUNNER_USER" ]; then
  # The runner installs itself as a systemd unit named actions.runner.<...>.
  # `systemctl show -p User` reports the account it executes as, which is the
  # account that needs every grant below - not the person running this script.
  RUNNER_USER="$(systemctl show 'actions.runner.*' -p User --value 2>/dev/null | grep -v '^$' | head -1 || true)"
fi

if [ -z "$RUNNER_USER" ]; then
  err "could not work out which user the GitHub Actions runner runs as."
  err ""
  err "Look for it with one of:"
  err "  systemctl list-units 'actions.runner.*'"
  err "  ps -o user= -C Runner.Listener | sort -u"
  err ""
  err "Then pass it in:  sudo $0 <user>"
  exit 1
fi

if ! id -u "$RUNNER_USER" >/dev/null 2>&1; then
  err "user '$RUNNER_USER' does not exist on this machine."
  exit 1
fi

RUNNER_GROUP="$(id -gn "$RUNNER_USER")"
ok "runner user is $RUNNER_USER:$RUNNER_GROUP"

# --------------------------- 2. the packages --------------------------- #

step "packages"

# python3-certbot-nginx is a SEPARATE package from certbot and is the single
# most common thing missing. Without it `certbot --nginx` cannot write the 443
# block, and the error it gives does not mention apt.
NEEDED=()
for pkg in nginx certbot python3-certbot-nginx jq curl; do
  if dpkg -s "$pkg" >/dev/null 2>&1; then
    ok "$pkg"
  else
    NEEDED+=("$pkg")
  fi
done

if [ "${#NEEDED[@]}" -gt 0 ]; then
  log "installing: ${NEEDED[*]}"
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y "${NEEDED[@]}"
  did "installed ${NEEDED[*]}"
fi

# ------------------------- 3. the directory tree ------------------------- #

step "$ROOT"

# Owned by the runner user so the workflow can replace domains/ without sudo.
# 750 so no other account on the machine can read or list it.
for d in "$ROOT" "$ROOT/domains" "$ROOT/backup"; do
  if [ -d "$d" ]; then ok "$d exists"; else mkdir -p "$d"; did "created $d"; fi
done

chown -R "$RUNNER_USER:$RUNNER_GROUP" "$ROOT"
chmod 750 "$ROOT" "$ROOT/domains"
chmod 700 "$ROOT/backup"
ok "owned by $RUNNER_USER, modes set"

# ---------------------------- 4. the firewall ---------------------------- #

step "ports 80 and 443"

# Port 80 must stay open even after everything redirects to 443: it is how
# Let's Encrypt validates, on first issue AND on every renewal. Closing it is
# the classic way a working setup silently stops renewing three months later.
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q '^Status: active'; then
  for port in 80 443; do
    if ufw status | grep -qE "^${port}(/tcp)?[[:space:]]+ALLOW"; then
      ok "ufw already allows $port"
    else
      ufw allow "$port/tcp" >/dev/null
      did "ufw allow $port/tcp"
    fi
  done
else
  log "ufw is not active - nothing to open here."
  log "If something else filters inbound traffic, 80 and 443 must reach this host."
fi

# ---------------------------- 5. the sudoers rule ---------------------------- #

step "sudo rule"

# Both systemctl paths are listed because sudo matches on the literal path and
# Ubuntu has moved it between releases. The one that does not exist simply
# never matches, so listing both is harmless and saves a per-release edit.
NGINX_BIN="$(command -v nginx || echo /usr/sbin/nginx)"

TMP_SUDOERS="$(mktemp)"
chmod 600 "$TMP_SUDOERS"
cat > "$TMP_SUDOERS" <<EOF
# /etc/sudoers.d/nginx-domains
#
# Written by nginx-domains/install-server.sh. Re-run that script to change it;
# editing this file by hand is fine but use \`visudo -f\` so a typo cannot
# break sudo for the whole machine.
#
# Lets the GitHub Actions runner publish nginx configuration without a
# password, and nothing else. NOPASSWD is required rather than convenient: the
# job has no TTY and calls \`sudo -n\`, so a password prompt is an immediate
# failure.
#
# NOTE on how much this actually restricts: by default the workflow also
# overwrites these two scripts on every run, so anyone who can push to the
# deploy branch can make them do anything as root. The rule narrows WHICH
# command runs, not what it does. Set the repository variable
# NGINX_SYNC_SCRIPT to false, and reinstall the scripts as root-owned, to make
# the restriction real.

Cmnd_Alias NGINX_DEPLOY = $ROOT/deploy-nginx-domains.sh
Cmnd_Alias NGINX_SSL    = $ROOT/setup-ssl.sh
Cmnd_Alias NGINX_CHECK  = $NGINX_BIN -t
Cmnd_Alias NGINX_RELOAD = /bin/systemctl reload nginx, \\
                          /usr/bin/systemctl reload nginx

$RUNNER_USER ALL=(root) NOPASSWD: NGINX_DEPLOY, NGINX_SSL, NGINX_CHECK, NGINX_RELOAD

# Do not add a wildcard. A rule ending in * lets any argument through, which is
# a well-worn way of turning a narrow grant into a root shell.
EOF

# The check that makes this safe. visudo -c parses the file exactly as sudo
# would; if it is wrong, nothing is installed and the system is untouched.
if ! visudo -c -f "$TMP_SUDOERS" >/dev/null 2>&1; then
  err "the generated sudoers rule does not parse. NOT installing it."
  err "sudo on this machine is unchanged. The rejected file was:"
  sed 's/^/    /' "$TMP_SUDOERS" >&2
  rm -f "$TMP_SUDOERS"
  exit 1
fi

if [ -f "$SUDOERS" ] && cmp -s "$TMP_SUDOERS" "$SUDOERS"; then
  ok "$SUDOERS already correct"
  rm -f "$TMP_SUDOERS"
else
  install -o root -g root -m 0440 "$TMP_SUDOERS" "$SUDOERS"
  rm -f "$TMP_SUDOERS"
  did "installed $SUDOERS"
fi

# ------------------------------ 6. verify ------------------------------ #
#
# As the runner user, because `sudo -l` answers differently per account and
# that difference is exactly the failure this catches.

step "verify"

failed=0

if sudo -n -l -U "$RUNNER_USER" >/dev/null 2>&1; then
  ok "$RUNNER_USER has sudo entries:"
  sudo -l -U "$RUNNER_USER" 2>/dev/null | sed -n '/may run/,$p' | sed 's/^/        /'
else
  err "sudo -l reports nothing for $RUNNER_USER"
  failed=1
fi

if sudo -u "$RUNNER_USER" test -w "$ROOT"; then
  ok "$RUNNER_USER can write $ROOT"
else
  err "$RUNNER_USER cannot write $ROOT"
  failed=1
fi

# Plain `command -v`, not `sudo -u ... bash -lc`. A login shell re-reads the
# user's profile and builds a PATH the runner service never sees, so it answers
# a question nobody asked. These all install into /usr/bin or /usr/sbin, which
# is on every PATH that matters here.
for c in nginx certbot jq curl; do
  if command -v "$c" >/dev/null 2>&1; then
    ok "$c is installed ($(command -v "$c"))"
  else
    err "$c is not on PATH even though the package is installed."
    failed=1
  fi
done

if certbot plugins --non-interactive 2>/dev/null | grep -q '^\* nginx$'; then
  ok "certbot's nginx plugin is available"
else
  err "certbot's nginx plugin is missing - install python3-certbot-nginx"
  failed=1
fi

if nginx -t >/dev/null 2>&1; then
  ok "the current nginx configuration is valid"
else
  err "nginx -t already fails, BEFORE this system has deployed anything."
  err "Fix that first - a deploy would roll back and blame itself. Run: nginx -t"
  failed=1
fi

# ------------------------------ 7. summary ------------------------------ #

printf '\n'
if [ "$failed" -eq 0 ]; then
  printf 'Server is ready. Push to the deploy branch, or dry-run it now:\n\n'
  printf '    sudo -u %s %s/deploy-nginx-domains.sh --dry-run\n\n' \
    "$RUNNER_USER" "$ROOT"
  printf 'The dry run needs %s/domains to be populated, which the\n' "$ROOT"
  printf 'workflow does on its first successful run.\n'
else
  printf 'Setup finished with problems - see the ERROR lines above.\n'
  exit 1
fi
