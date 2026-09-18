#!/usr/bin/env bash
# ------------------------------------------------------------------ #
# deploy-nginx-domains.sh - publish every *.conf in /opt/nginx-domains/domains
# into /etc/nginx/conf.d, validate, and reload nginx only if it validates.
#
# Installed at /opt/nginx-domains/deploy-nginx-domains.sh and run by the
# GitHub Actions workflow .github/workflows/deploy-nginx-domains.yml as:
#
#     sudo -n /opt/nginx-domains/deploy-nginx-domains.sh
#
# It is also fine to run by hand. It is idempotent: running it twice in a row
# does exactly the same thing twice, and the second run is a no-op reload.
#
# --------------------- how "managed" is decided ---------------------- #
#
# /etc/nginx/conf.d is a shared directory. Distribution packages drop files
# there, certbot writes there, and an operator may have hand-written something
# there years ago. A deploy that treated that directory as "mine" and emptied
# it before copying would take the whole server down the first time it ran.
#
# So this script owns exactly one thing: files in /etc/nginx/conf.d whose name
# starts with `managed-`. Nothing else in that directory is ever read, written,
# moved or deleted.
#
#     domains/smart-biz.ajtechhub.com.conf
#         -> /etc/nginx/conf.d/managed-smart-biz.ajtechhub.com.conf
#
# The prefix is added by this script, not stored in the repository, so the
# repository keeps clean filenames and the ownership marker cannot be forgotten
# on a new file. The rule is mechanical and needs no state file:
#
#   * a managed-*.conf in /etc/nginx/conf.d whose source no longer exists in
#     domains/ is deleted - that is how deleting a .conf from git removes the
#     domain from the server;
#   * a file in /etc/nginx/conf.d without the prefix is invisible to this
#     script, in both directions. It is neither deployed nor deleted, and a
#     `default.conf` or a certbot file survives every deploy untouched.
#
# The one thing that follows from this: do NOT hand-create files named
# `managed-*.conf` in /etc/nginx/conf.d. Anything with that name is claimed by
# this script and will be deleted on the next deploy if the repository has no
# matching source.
#
# ------------------------- failure behaviour ------------------------- #
#
# Before anything is changed, every *.conf currently in /etc/nginx/conf.d is
# copied into /opt/nginx-domains/backup/<timestamp>/. Then the changes are
# applied to disk and `nginx -t` runs.
#
# If `nginx -t` fails, nginx is NOT reloaded - the running server is still
# serving the old configuration from memory and never saw the broken one - and
# the managed files on disk are restored from that backup, so disk and memory
# agree again. The script then exits 1 and the GitHub job goes red.
#
# If `nginx -t` passes, `systemctl reload nginx` sends SIGHUP: nginx starts new
# workers with the new configuration and lets the old workers finish the
# requests they are already serving. No connection is dropped and there is no
# window in which the site is down.
#
# ------------------------------ secrets ------------------------------ #
#
# This script prints filenames, counts and nginx's own output. It never prints
# file contents, never echoes its environment, and never enables `set -x`.
# Nginx configuration should not contain secrets in the first place - if a
# config needs a credential, put it in a file outside this repository and
# `include` it - but even so, nothing here would surface one in a CI log.
# ------------------------------------------------------------------ #

set -euo pipefail

# --------------------------- configuration --------------------------- #
# Overridable by environment only so the script can be exercised against a
# scratch directory in a test. In production every one of these is the default.

ROOT="${NGINX_DOMAINS_ROOT:-/opt/nginx-domains}"
SRC_DIR="$ROOT/domains"
BACKUP_ROOT="$ROOT/backup"
TARGET_DIR="${NGINX_CONF_D:-/etc/nginx/conf.d}"
LOCK_FILE="${NGINX_DOMAINS_LOCK:-$ROOT/.deploy.lock}"

# The ownership marker. Changing this orphans every file deployed under the old
# prefix - they stop being managed and stop being deleted - so do not.
PREFIX="managed-"

# Backups are small text files, but one per deploy adds up over a year.
KEEP_BACKUPS="${KEEP_BACKUPS:-30}"

# An empty domains/ means "delete every managed config", which is a legitimate
# thing to want and also exactly what a half-failed file copy looks like. So it
# is refused unless someone says out loud that they meant it.
ALLOW_EMPTY="${ALLOW_EMPTY:-0}"

# Show what would happen and touch nothing. `--dry-run` sets this too.
DRY_RUN="${DRY_RUN:-0}"

# ------------------------------ logging ------------------------------ #

log()  { printf '%s [ info] %s\n' "$(date '+%Y-%m-%d %H:%M:%S %z')" "$*"; }
warn() { printf '%s [ warn] %s\n' "$(date '+%Y-%m-%d %H:%M:%S %z')" "$*" >&2; }
err()  { printf '%s [ERROR] %s\n' "$(date '+%Y-%m-%d %H:%M:%S %z')" "$*" >&2; }

# ----------------------------- arguments ----------------------------- #

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --allow-empty) ALLOW_EMPTY=1 ;;
    -h|--help)
      sed -n '2,10p' "$0"
      printf '\n%s\n' "Usage: deploy-nginx-domains.sh [--dry-run] [--allow-empty]"
      printf '%s\n' "  --dry-run      report the plan and exit without touching anything"
      printf '%s\n' "  --allow-empty  permit a deploy from an empty domains/ directory"
      exit 0
      ;;
    *)
      err "unknown argument: $arg (try --help)"
      exit 2
      ;;
  esac
done

# -------------------------- preflight checks -------------------------- #
#
# Requirements 3 and 4. Every check below fails before a single file has been
# touched, so a failed preflight leaves the server byte-for-byte as it was.

if [ "$DRY_RUN" != "1" ] && [ "$(id -u)" -ne 0 ]; then
  err "must run as root - it writes to $TARGET_DIR. Run: sudo -n $0"
  exit 1
fi

if [ ! -d "$SRC_DIR" ]; then
  err "source directory $SRC_DIR does not exist."
  err "Create it and let the GitHub workflow populate it:  sudo mkdir -p $SRC_DIR"
  exit 1
fi

if ! command -v nginx >/dev/null 2>&1; then
  err "nginx is not installed (no 'nginx' on PATH)."
  err "Install it with:  sudo apt-get install -y nginx"
  exit 1
fi

if [ ! -d "$TARGET_DIR" ]; then
  err "$TARGET_DIR does not exist. Is nginx really installed on this host?"
  exit 1
fi

if ! command -v systemctl >/dev/null 2>&1; then
  err "systemctl not found - this script reloads nginx through systemd."
  exit 1
fi

# Two deploys at once would interleave their backup-apply-test-restore
# sequences and could restore each other's half-finished state. Only one gets
# the lock; the other fails fast rather than queueing behind a slot it may
# never get. `flock` ships in util-linux and is on every Ubuntu server.
if command -v flock >/dev/null 2>&1; then
  exec {LOCK_FD}>"$LOCK_FILE"
  if ! flock -n "$LOCK_FD"; then
    err "another deploy is already running (lock: $LOCK_FILE)."
    exit 1
  fi
else
  warn "flock not available - running without a concurrency lock."
fi

log "nginx deployment starting"
log "  source   $SRC_DIR"
log "  target   $TARGET_DIR (files named ${PREFIX}*.conf)"
log "  backups  $BACKUP_ROOT"
if [ "$DRY_RUN" = "1" ]; then
  log "  mode     DRY RUN - nothing will be changed"
fi

# -------------------------- work out the plan -------------------------- #

# nullglob: an empty domains/ must expand to nothing rather than to the literal
# string "$SRC_DIR/*.conf", which would then be treated as a filename.
shopt -s nullglob

declare -a SOURCES=()
declare -a WANTED=()        # the managed- names those sources map to

for src in "$SRC_DIR"/*.conf; do
  base="$(basename -- "$src")"

  # Skip anything that is not a plain readable file: a dangling symlink, a
  # directory someone created by accident, a socket.
  if [ ! -f "$src" ] || [ ! -r "$src" ]; then
    warn "skipping $base - not a readable regular file."
    continue
  fi

  # An empty file is almost always a failed copy rather than an intentionally
  # blank server block, and it would deploy silently and do nothing.
  if [ ! -s "$src" ]; then
    err "$base is empty. Refusing to deploy a truncated file."
    exit 1
  fi

  # The name becomes a filename in /etc/nginx/conf.d. Anything outside this
  # character set - a space, a quote, a path separator - has no business being
  # a domain config name, and is rejected rather than quoted around.
  if [[ ! "$base" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*\.conf$ ]]; then
    err "$base has an unsafe name. Use letters, digits, dot, dash, underscore."
    exit 1
  fi

  # Guards against managed-managed-foo.conf if someone adds the prefix by hand
  # in the repository. Such a file would never match its own source name and
  # would be deleted and recreated on every single deploy.
  if [[ "$base" == "$PREFIX"* ]]; then
    err "$base already starts with '$PREFIX'. The prefix is added by this"
    err "script - name the file in the repository without it."
    exit 1
  fi

  SOURCES+=("$src")
  WANTED+=("$PREFIX$base")
done

if [ "${#SOURCES[@]}" -eq 0 ] && [ "$ALLOW_EMPTY" != "1" ]; then
  err "$SRC_DIR contains no *.conf files."
  err "If you really meant to remove every managed config, re-run with --allow-empty."
  exit 1
fi

# What is currently deployed, so we can work out what to remove.
declare -a CURRENT=()
for cur in "$TARGET_DIR"/"$PREFIX"*.conf; do
  CURRENT+=("$(basename -- "$cur")")
done

# Present on the server but no longer in the repository - the .conf was deleted
# from git, so the domain comes off the server.
declare -a TO_REMOVE=()
for cur in ${CURRENT[@]+"${CURRENT[@]}"}; do
  found=0
  for want in ${WANTED[@]+"${WANTED[@]}"}; do
    if [ "$cur" = "$want" ]; then found=1; break; fi
  done
  if [ "$found" -eq 0 ]; then TO_REMOVE+=("$cur"); fi
done

log "plan: ${#SOURCES[@]} config(s) to deploy, ${#TO_REMOVE[@]} to remove, ${#CURRENT[@]} currently managed"
for want in ${WANTED[@]+"${WANTED[@]}"};    do log "  deploy  $want"; done
for gone in ${TO_REMOVE[@]+"${TO_REMOVE[@]}"}; do log "  remove  $gone"; done

# Count the files that are NOT ours, purely so the log makes the safety
# property visible: this number is identical before and after every deploy.
untouched=0
for f in "$TARGET_DIR"/*.conf; do
  case "$(basename -- "$f")" in
    "$PREFIX"*) ;;
    *) untouched=$((untouched + 1)) ;;
  esac
done
log "  leaving $untouched unmanaged file(s) in $TARGET_DIR untouched"

if [ "$DRY_RUN" = "1" ]; then
  log "dry run complete - nothing was changed."
  exit 0
fi

# ------------------------------- backup ------------------------------- #
#
# Requirements 5 and 6. Everything in the directory is backed up, not only the
# managed files, so a backup doubles as a full record of what the server looked
# like at that moment. Only the managed files are ever restored from it.

STAMP="$(date '+%Y-%m-%d_%H-%M-%S')"
BACKUP_DIR="$BACKUP_ROOT/$STAMP"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_ROOT" "$BACKUP_DIR"

backed_up=0
for f in "$TARGET_DIR"/*.conf; do
  cp -a -- "$f" "$BACKUP_DIR/"
  backed_up=$((backed_up + 1))
done
log "backed up $backed_up file(s) to $BACKUP_DIR"

# -------------------------- restore machinery -------------------------- #

APPLIED=0     # set once the first change has been written to $TARGET_DIR
COMMITTED=0   # set once the outcome is final - reloaded, or already rolled back

restore_from_backup() {
  warn "restoring managed configuration from $BACKUP_DIR"

  # Drop everything we own right now, whatever state it is in...
  for f in "$TARGET_DIR"/"$PREFIX"*.conf; do
    rm -f -- "$f"
  done

  # ...and put back exactly the managed files the backup captured. Unmanaged
  # files are deliberately not restored: this script never modified them, so
  # restoring them could only undo somebody else's legitimate concurrent edit.
  local restored=0
  for f in "$BACKUP_DIR"/"$PREFIX"*.conf; do
    install -m 0644 -o root -g root -- "$f" "$TARGET_DIR/$(basename -- "$f")"
    restored=$((restored + 1))
  done

  warn "restored $restored managed file(s); nginx was NOT reloaded and is still"
  warn "serving the configuration it had before this deploy started."

  if nginx -t >/dev/null 2>&1; then
    warn "the restored configuration validates - the server is back to a known-good state."
  else
    err "the RESTORED configuration does not validate either, which means something"
    err "was already broken on disk before this deploy. Do NOT reload nginx."
    err "Investigate with:  sudo nginx -t   and   ls -l $BACKUP_ROOT"
  fi
}

# If the script dies between the first write and the reload - a full disk, an
# operator pressing ctrl-c, a bug - the trap puts the managed files back. The
# guard flags keep it from firing on a clean exit, or on a preflight failure
# that never touched anything.
on_exit() {
  rc=$?
  if [ "$APPLIED" -eq 1 ] && [ "$COMMITTED" -eq 0 ]; then
    err "deployment did not complete (exit $rc) - rolling back."
    restore_from_backup || true
  fi
  exit $rc
}
trap on_exit EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# -------------------------------- apply -------------------------------- #

APPLIED=1

# Removals first, so that a rename - delete the old name, add a new one - can
# never leave two server blocks claiming the same server_name at the instant
# `nginx -t` looks at the directory.
for gone in ${TO_REMOVE[@]+"${TO_REMOVE[@]}"}; do
  rm -f -- "$TARGET_DIR/$gone"
  log "removed  $gone"
done

# `install` writes owner, group and mode in the same operation as the copy, so
# there is never an instant where the file exists with the wrong permissions.
#
# 0644 root:root is what nginx expects: the master process starts as root and
# reads the configuration before dropping privileges, and the unprivileged
# workers must not be able to rewrite the config they were started from.
for i in ${!SOURCES[@]}; do
  install -m 0644 -o root -g root -- "${SOURCES[$i]}" "$TARGET_DIR/${WANTED[$i]}"
  log "deployed ${WANTED[$i]}"
done

# ------------------------------- validate ------------------------------- #
#
# Requirement 10. This is the whole reason for the backup above: `nginx -t`
# parses the real configuration tree, so the new files must already be in place
# before it can judge them - and therefore there must be a way back.

log "validating with: nginx -t"
if ! nginx_output="$(nginx -t 2>&1)"; then
  err "nginx rejected the new configuration. NOT reloading."
  err "----- nginx -t output -----"
  printf '%s\n' "$nginx_output" >&2
  err "---------------------------"
  restore_from_backup
  COMMITTED=1   # the rollback has already run; stop the EXIT trap repeating it
  err "deployment failed. The live site is unchanged. Fix the .conf and push again."
  exit 1
fi

while IFS= read -r line; do log "  nginx: $line"; done <<< "$nginx_output"

# -------------------------------- reload -------------------------------- #
#
# Requirements 12 and 14. `reload` is SIGHUP, not a restart: nginx starts new
# workers on the new configuration while the existing workers drain the
# requests they are mid-way through. No listening socket is ever closed, so no
# connection is refused and there is no downtime.

log "reloading nginx"
if ! systemctl reload nginx; then
  err "nginx -t passed but 'systemctl reload nginx' failed. The configuration on"
  err "disk is the new one; the running process is still on the old one."
  err "Check:  sudo systemctl status nginx --no-pager -l"
  exit 1
fi

COMMITTED=1

# ---------------------------- prune old backups ---------------------------- #
#
# Oldest first. The timestamp format sorts lexicographically, which is exactly
# why it is YYYY-MM-DD_HH-MM-SS and not anything friendlier to read.

if [ "$KEEP_BACKUPS" -gt 0 ]; then
  mapfile -t all_backups < <(find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort)
  excess=$(( ${#all_backups[@]} - KEEP_BACKUPS ))
  if [ "$excess" -gt 0 ]; then
    for ((i = 0; i < excess; i++)); do
      rm -rf -- "${BACKUP_ROOT:?}/${all_backups[$i]}"
    done
    log "pruned $excess old backup(s), keeping the newest $KEEP_BACKUPS"
  fi
fi

# -------------------------------- summary -------------------------------- #

log "deployment successful"
log "  deployed  ${#SOURCES[@]} config(s)"
log "  removed   ${#TO_REMOVE[@]} config(s)"
log "  untouched $untouched unmanaged file(s)"
log "  backup    $BACKUP_DIR"
for want in ${WANTED[@]+"${WANTED[@]}"}; do log "  live: $want"; done

exit 0
