# Nginx domain deployment

Every nginx virtual host on the Ubuntu server lives in [domains/](domains/).
Push to the `nginx-domain-live` branch and GitHub Actions points DNS at the
server, deploys the vhosts, validates them, reloads nginx, and gets a
certificate — or rolls back and fails the build.

```
git push origin nginx-domain-live
  └─ GitHub notifies the SELF-HOSTED runner, which IS the server
       │
       ├─ 1. setup-cloudflare-dns.sh
       │       └─ create the A records, or report they already exist
       │
       ├─ 2. sudo deploy-nginx-domains.sh
       │       ├─ back up  /etc/nginx/conf.d/*.conf
       │       ├─ sync     domains/*.conf → conf.d/managed-*.conf
       │       ├─ nginx -t ─ fails → restore backup, no reload, exit 1
       │       └─         ─ passes → systemctl reload nginx
       │
       └─ 3. sudo setup-ssl.sh
               └─ certbot --nginx: issue, write the 443 block, redirect
```

The order matters: a domain cannot get a certificate until it resolves *and*
answers on port 80, so DNS comes first and TLS comes last.

**There is no SSH.** The job runs on the self-hosted runner — the same one
every other deploy in this repository uses — which polls GitHub outbound and
does the work locally. Nothing about this server has to be reachable from the
internet in order to *deploy*. Being **reached**, and getting a certificate,
are separate matters: see section 9.

```text
repository/
├── .github/workflows/
│   └── deploy-nginx-domains.yml          runs on the self-hosted runner
└── nginx-domains/
    ├── setup-cloudflare-dns.sh           A records, runs on the runner
    ├── deploy-nginx-domains.sh           backup → sync → nginx -t → reload
    ├── setup-ssl.sh                      certbot issuance and renewal
    ├── README.md                         this file
    └── domains/
        ├── 00-upgrade-map.conf           shared $connection_upgrade map
        ├── smart-biz.ajtechhub.com.conf
        ├── smart-biz-api.ajtechhub.com.conf
        ├── smart-biz-admin.ajtechhub.com.conf
        ├── smart-biz-super-admin.ajtechhub.com.conf
        ├── smart-biz-white.ajtechhub.com.conf
        ├── smart-biz-black.ajtechhub.com.conf
        └── smart-biz-decor-framing.ajtechhub.com.conf
```

```text
server/
├── /opt/nginx-domains/
│   ├── deploy-nginx-domains.sh           installed by the workflow
│   ├── setup-ssl.sh                      installed by the workflow
│   │                                     (setup-cloudflare-dns.sh is NOT
│   │                                      copied here - it runs on the runner)
│   ├── domains/                          replaced wholesale on each deploy
│   └── backup/2026-09-18_12-05-31/       newest 30 kept
│                                         ↓
├── /etc/nginx/conf.d/managed-*.conf      port 80 + proxy, from git
│                                         then certbot adds 443 + redirect
└── /etc/letsencrypt/live/<domain>/       certbot's certificates
```

---

## 1. What "managed" means

`/etc/nginx/conf.d` is shared with the distribution package, certbot, and
whatever an operator wrote there by hand. This system claims **one** namespace
in it:

| In git | On the server |
| --- | --- |
| `domains/smart-biz.ajtechhub.com.conf` | `/etc/nginx/conf.d/managed-smart-biz.ajtechhub.com.conf` |
| `domains/smart-biz-api.ajtechhub.com.conf` | `/etc/nginx/conf.d/managed-smart-biz-api.ajtechhub.com.conf` |
| *(nothing)* | `/etc/nginx/conf.d/default.conf` — **never touched** |

The `managed-` prefix is added by the deploy script, not stored in git, so a
new file cannot be created without the ownership marker.

The rule is mechanical and needs no state file:

- a `managed-*.conf` whose source is gone from `domains/` is **deleted**;
- a file in `conf.d` **without** the prefix is invisible in both directions —
  never deployed, never deleted, never read.

> **Do not hand-create `managed-*.conf` files on the server.** That name is
> claimed by this system, and the next deploy will delete anything wearing it
> that has no matching file in git.

---

## 2. One-time server installation

Run once, as a user with sudo. The self-hosted runner must already be installed
and online on this server - it is the same one your other deploys use.

```bash
# the account the runner executes as; everything below is granted to it
RUNNER_USER=$(systemctl show 'actions.runner.*' -p User --value | head -1)
echo "runner user: ${RUNNER_USER:?could not detect - set it by hand}"

# nginx, certbot, and certbot's nginx PLUGIN - a separate package, and the
# most common thing missing. Without it `certbot --nginx` cannot write the 443
# block. curl is used by the reachability pre-check.
sudo apt-get update
sudo apt-get install -y nginx certbot python3-certbot-nginx curl

# jq, for the Cloudflare step. Not on a stock Ubuntu server.
sudo apt-get install -y jq


# the directory tree
sudo mkdir -p /opt/nginx-domains/domains
sudo mkdir -p /opt/nginx-domains/backup

# owned by the runner user so CI can write domains/ without sudo; 750 so the
# rest of the machine's accounts cannot read or list it.
sudo chown -R "$RUNNER_USER:$RUNNER_USER" /opt/nginx-domains
sudo chmod 750 /opt/nginx-domains
sudo chmod 750 /opt/nginx-domains/domains
sudo chmod 700 /opt/nginx-domains/backup

# Nothing to create for TLS: certbot's nginx plugin validates by temporarily
# rewriting the server block, so there is no webroot, and certificates live
# under /etc/letsencrypt, which certbot creates and owns.

# port 80 must stay open to the internet even after everything redirects to
# 443 - it is how Let's Encrypt validates, including on every renewal.
sudo ufw allow 80/tcp && sudo ufw allow 443/tcp   # if ufw is in use
```

### The runner user

There is no deploy key. The self-hosted runner already runs on this server as
some user — find out which, because that is the account everything below is
granted to:

```bash
systemctl show 'actions.runner.*' -p User --value | head -1
# or, if the runner was set up under a login shell:
ps -o user= -C Runner.Listener | sort -u
```

Call it `$RUNNER_USER` and give it the deploy directory:

```bash
sudo chown -R "$RUNNER_USER:$RUNNER_USER" /opt/nginx-domains
```

It also needs `jq`, which the Cloudflare step uses and a stock Ubuntu server
does not have:

```bash
sudo apt-get install -y jq
```

Everything else it needs comes from the one sudoers rule in section 3.


### Expected permissions

| Path | Owner | Mode | Why |
| --- | --- | --- | --- |
| `/opt/nginx-domains` | runner user | `750` | CI writes here without sudo |
| `/opt/nginx-domains/domains` | runner user | `750` | replaced wholesale on each deploy |
| `/opt/nginx-domains/domains/*.conf` | runner user | `644` | |
| `/opt/nginx-domains/deploy-nginx-domains.sh` | runner user | `750` | run as root via sudo |
| `/opt/nginx-domains/setup-ssl.sh` | runner user | `750` | run as root via sudo |
| `/opt/nginx-domains/backup` | runner user | `700` | |
| `/etc/nginx/conf.d/managed-*.conf` | `root:root` | `644` | nginx reads config as root, then drops privileges; workers must not be able to rewrite it |
| `/etc/letsencrypt/**` | `root:root` | certbot's own | do not chmod it; certbot manages these and checks them |

Verify:

```bash
ls -ld /opt/nginx-domains /opt/nginx-domains/{domains,backup}
ls -l  /opt/nginx-domains/deploy-nginx-domains.sh
ls -l  /etc/nginx/conf.d/
```

---

## 3. Sudoers

The runner user needs root only to write `/etc/nginx/conf.d` and reload nginx.
Never give it `ALL=(ALL) NOPASSWD: ALL`.

```bash
sudo visudo -f /etc/sudoers.d/nginx-domains
sudo chmod 440 /etc/sudoers.d/nginx-domains
```

```sudoers
# /etc/sudoers.d/nginx-domains
#
# Lets the runner user publish nginx configuration without a password, and
# nothing else. NOPASSWD is required, not a convenience: the GitHub job runs
# with no TTY and calls `sudo -n`, so a password prompt is an immediate failure
# rather than a hang.
#
# Replace $RUNNER_USER with the account the self-hosted runner runs as.
# Find it with: systemctl show 'actions.runner.*' -p User --value

Cmnd_Alias NGINX_DEPLOY = /opt/nginx-domains/deploy-nginx-domains.sh
Cmnd_Alias NGINX_SSL    = /opt/nginx-domains/setup-ssl.sh
Cmnd_Alias NGINX_CHECK  = /usr/sbin/nginx -t
Cmnd_Alias NGINX_RELOAD = /bin/systemctl reload nginx, \
                          /usr/bin/systemctl reload nginx

$RUNNER_USER ALL=(root) NOPASSWD: NGINX_DEPLOY, NGINX_SSL, NGINX_CHECK, NGINX_RELOAD

# Do not add a wildcard. `/opt/nginx-domains/deploy-nginx-domains.sh *` would
# let any argument through, and a sudo rule ending in * is a classic way to
# turn a narrow grant into a shell.
```

Both `systemctl` paths are listed because sudo matches on the literal path and
Ubuntu has moved it between releases; the one that does not exist simply never
matches. Confirm yours with `command -v systemctl` and `command -v nginx`.

Check the rule parses and is what you meant:

```bash
sudo visudo -c -f /etc/sudoers.d/nginx-domains
sudo -l -U "$RUNNER_USER"
```

`NGINX_CHECK` and `NGINX_RELOAD` are not used by the deploy script — it already
runs as root — but they let an operator diagnose and recover without a full
root shell.

### The honest caveat

By default the workflow also **overwrites the deploy script** on every run.
Anyone who can push to `nginx-domain-live` can therefore put arbitrary commands
in them and have the server run them as root. The sudo rule narrows *what
command runs*; it does not narrow *what that command does*. In practice push
access to this branch is root on this server, guarded by GitHub branch
protection rather than by sudo.

To close that gap, set the repository variable `NGINX_SYNC_SCRIPT` to `false`
and pin the script:

```bash
# install the script by hand, root-owned and not writable by the runner user
sudo install -o root -g root -m 0755 \
  nginx-domains/deploy-nginx-domains.sh /opt/nginx-domains/deploy-nginx-domains.sh
```

Then CI syncs only `domains/`, and you can pin the exact bytes sudo will run:

```sudoers
# sudo refuses if the script's hash changes, so an attacker who can write the
# file still cannot get it executed as root.
Cmnd_Alias NGINX_DEPLOY = sha256:<paste `sha256sum` output, base64 or hex> \
                          /opt/nginx-domains/deploy-nginx-domains.sh
```

The cost is that changing the script becomes a manual root action. That is the
trade; pick deliberately.

---

## 4. GitHub secrets and variables

**Settings → Secrets and variables → Actions → Secrets**

| Secret | Required | Value |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | for DNS | a **scoped** token: Zone / DNS / Edit, one zone |
| `CLOUDFLARE_ZONE_ID` | no | looked up from the zone name if absent |

That is the whole list. The job runs **on** the server, so there is nothing to
authenticate to and no deploy key to manage.

> **These secrets are no longer used** and can be deleted unless something else
> in the repository wants them: `NGINX_SERVER_HOST`, `NGINX_SERVER_USER`,
> `NGINX_SERVER_SSH_KEY`, `NGINX_SERVER_PORT`, `NGINX_SERVER_KNOWN_HOSTS`.
>
> An unused deploy key is not harmless — it is a credential nobody rotates and
> nobody would notice being used.

| Variable | Default | Effect |
| --- | --- | --- |
| `NGINX_SYNC_SCRIPT` | `true` | `false` stops CI updating the two scripts on the server |
| `NGINX_AUTO_SSL` | `true` | `false` stops CI issuing and renewing certificates |
| `NGINX_AUTO_DNS` | `true` | `false` stops CI creating Cloudflare records |
| `NGINX_SERVER_IP` | *auto-detected* | the public IPv4 the A records point at. **Leave it unset**: the runner asks the internet what this host's public address is, which beats a value typed by hand. Read from either tab |
| `CLOUDFLARE_ZONE` | `ajtechhub.com` | the zone the token may edit |
| `NGINX_DOMAINS_ROOT` | `/opt/nginx-domains` | where the system lives |

Nothing else is passed to the server, and the script logs filenames and counts
only — never file contents, never its environment, and it never enables
`set -x`.

---

## 5. First deploy

```bash
git checkout -b nginx-domain-live
git add nginx-domains .github/workflows/deploy-nginx-domains.yml
git commit -m "nginx: add automated domain deployment"
git push -u origin nginx-domain-live
```

Watch it in the Actions tab. The **Issue or renew certificates** step runs
after the deploy, so the first push does both: the domains go live on HTTP and
their certificates are requested in the same run. Domains whose DNS is not
pointed here yet are reported as warnings and stay on plain HTTP until
the next run.

The **Preview what will change** step prints the full plan — what will be deployed, what will be removed, and how many unmanaged
files are being left alone — *before* the step that changes anything.

---

## 6. Adding, changing and removing a domain

**Add.** Create `nginx-domains/domains/<fqdn>.conf`, point DNS at the server,
commit, push to `nginx-domain-live`. The script discovers it by glob — there is
no list of filenames anywhere to update.

Start from the closest existing file rather than from the snippet in this
README: `smart-biz-white.…` for a Next.js app, `smart-biz-admin.…` for an
Angular console served by its own container.

```bash
cp nginx-domains/domains/smart-biz-white.ajtechhub.com.conf \
   nginx-domains/domains/smart-biz-shop.ajtechhub.com.conf
# edit server_name, proxy_pass and the two log paths, then:
git add nginx-domains/domains/smart-biz-shop.ajtechhub.com.conf
git commit -m "nginx: add smart-biz-shop.ajtechhub.com"
git push
```

The certificate follows automatically — `setup-ssl.sh` runs after the deploy
and picks the new `server_name` up. Point DNS at the server before pushing, or
the domain stays on plain HTTP until the next run.

**Change.** Edit the file and push. The deployed copy is replaced and nginx
reloads.

**Remove.** `git rm` the file and push. The matching `managed-*.conf` is deleted
from the server and nginx reloads without it. Unmanaged files are untouched.

```bash
git rm nginx-domains/domains/smart-biz-shop.ajtechhub.com.conf
git commit -m "nginx: retire smart-biz-shop.ajtechhub.com"
git push
```

**Rename** is a delete plus an add in one commit. The script removes before it
copies, so there is no instant where two server blocks claim the same
`server_name`.

Filenames must be `[A-Za-z0-9][A-Za-z0-9._-]*.conf`, must not be empty, and must
not start with `managed-`. The workflow rejects violations before anything
leaves the runner.

### Port map

Every host on the platform sits under the `smart-biz` prefix, so the family is
obvious from a DNS zone listing and a new service has one naming decision
rather than a debate. `smart-biz.ajtechhub.com` is the root of it — the public
product site — and everything else is `smart-biz-<service>`.

| Domain | Upstream | Port | Source of truth |
| --- | --- | --- | --- |
| `smart-biz.ajtechhub.com` | Next.js — technology site | 4700 | `deploy/aj-smart-biz-technology/.env` |
| `smart-biz-api.ajtechhub.com` | NestJS — backend API | 4000 | `deploy/aj-smart-biz-backend/.env` |
| `smart-biz-admin.ajtechhub.com` | Angular — company admin console | 4300 | `deploy/aj-smart-biz-admin/.env` |
| `smart-biz-super-admin.ajtechhub.com` | Angular — super admin console | 4200 | `deploy/aj-smart-biz-supper-admin/.env` |
| `smart-biz-white.ajtechhub.com` | Next.js — informational theme | 4400 | `deploy/aj-smart-biz-white-theme/.env` |
| `smart-biz-black.ajtechhub.com` | Next.js — salon theme | 4500 | `deploy/aj-smart-biz-black-theme/.env` |
| `smart-biz-decor-framing.ajtechhub.com` | Next.js — decor & framing theme | 4600 | `deploy/aj-smart-biz-decor-framing/.env` |

A `proxy_pass` port and the matching `HOST_PORT` in that `.env` are two halves
of one mapping. Change them together.

All seven need an A (or AAAA) record pointing at the server before they resolve.
A wildcard `*.ajtechhub.com` covers the whole family and every future
`smart-biz-*` host in one record — at the cost that any typo'd host name also
lands on this server and gets whatever the default server block answers with.

Two names differ from their service directory on purpose:

- `smart-biz-api`, not `aj-api` — an earlier draft of this directory used
  `aj-api.ajtechhub.com`. Nothing in the repository referred to it (the
  consoles reach the API through the `aj-smart-biz-backend` container name, not
  a public host), so the rename is free. If an external client has already been
  given the old name, add it to `server_name` in that file alongside the new
  one rather than deleting it, and retire it once the client has moved.
- `smart-biz-super-admin`, not `supper` — the service directory is
  `aj-smart-biz-supper-admin`, a typo that is now load-bearing in image tags.
  A public host name is forever and visible, so this one is spelled correctly.
  Nothing matches the directory name against the domain.

### Tenant themes on customer domains

The three theme hosts are the platform's own address for a tenant site —
somewhere to preview a theme and hand a demo link to a prospect. A live tenant
arrives on its own domain, and that goes in `server_name` on the **existing**
file rather than into a new one:

```nginx
server_name smart-biz-white.ajtechhub.com www.acme.example acme.example;
```

One upstream, one place to change when the port moves. Nothing else to do for
TLS: `setup-ssl.sh` reads the deployed `server_name` lines, so the customer
domain is picked up on the next run and gets its own certificate. Point the
customer's DNS at this server *before* pushing, or the first run will skip it
and the domain stays on plain HTTP until you run it again.

A tenant that should *not* be reachable at the platform address gets a file of
its own instead.

---

## 7. Testing

**Before pushing**, from a checkout:

```bash
bash -n nginx-domains/deploy-nginx-domains.sh        # script parses
```

**On the server**, without changing anything — this needs no sudo:

```bash
/opt/nginx-domains/deploy-nginx-domains.sh --dry-run
```

It prints the plan and exits. Run it any time to see what a deploy *would* do.

**A real deploy, by hand:**

```bash
sudo -n /opt/nginx-domains/deploy-nginx-domains.sh
echo "exit: $?"      # 0 = deployed and reloaded, 1 = rejected and rolled back
```

**Verify the result:**

```bash
sudo nginx -t                                  # the whole tree is valid
ls -l /etc/nginx/conf.d/                       # managed- files plus your own
systemctl is-active nginx                      # active
# every managed host, straight from the deployed files - no list to keep in
# step with the directory
for h in $(sudo grep -h '^\s*server_name' /etc/nginx/conf.d/managed-*.conf \
             | tr -d ';' | awk '{$1=""; print}'); do
  printf '%-40s %s\n' "$h" "$(curl -s -o /dev/null -w '%{http_code}' \
    -H "Host: $h" http://127.0.0.1/)"
done
```

A `502` from those means nginx is fine and the upstream container is not
listening — check the port map above against `docker ps` and `ss -lntp`.

**Certificates:**

```bash
sudo -n /opt/nginx-domains/setup-ssl.sh --dry-run   # rehearse; issues nothing
sudo certbot certificates                           # what exists, when it expires

# did certbot actually write TLS into the deployed files? every managed config
# should show a 443 listen line once its certificate is in place
grep -c 'listen 443' /etc/nginx/conf.d/managed-*.conf

# end to end, through the public name
curl -sSI https://smart-biz.ajtechhub.com | head -1
curl -sI  http://smart-biz.ajtechhub.com | head -2   # expect 301 to https
```

A managed config with no `listen 443` is a domain certbot skipped — re-run
`setup-ssl.sh` and read why.

**Prove the rollback works** (safe: it ends with the server exactly as it
started):

```bash
# a deliberately broken file
echo 'server { listen 80; server_name broken.test;' \
  | sudo tee /opt/nginx-domains/domains/zz-broken.conf

sudo -n /opt/nginx-domains/deploy-nginx-domains.sh   # exits 1, restores, no reload
sudo rm /opt/nginx-domains/domains/zz-broken.conf
sudo -n /opt/nginx-domains/deploy-nginx-domains.sh   # back to green
```

**Prove unmanaged files are safe:**

```bash
echo '# not ours' | sudo tee /etc/nginx/conf.d/zz-operator-note.conf
sudo -n /opt/nginx-domains/deploy-nginx-domains.sh
cat /etc/nginx/conf.d/zz-operator-note.conf     # still there, unchanged
sudo rm /etc/nginx/conf.d/zz-operator-note.conf
```

**Check the runner user can do what CI will ask of it.** Run this *as the
runner user*, not as yourself — `sudo -l` answers differently per account, and
that difference is the whole failure mode:

```bash
sudo -u "$RUNNER_USER" -H bash -c '
  sudo -n /opt/nginx-domains/deploy-nginx-domains.sh --dry-run &&
  command -v jq >/dev/null && echo "jq ok" &&
  test -w /opt/nginx-domains && echo "deploy dir writable"
'
```

---

## 8. Rollback

### The automatic one

If `nginx -t` fails, it has already happened: the managed files are restored
from the backup taken seconds earlier, nginx is **not** reloaded, and the job
fails. The running server never saw the broken configuration — it is still
serving the old one out of memory, and no request was dropped.

The same rollback fires if the script is interrupted between the first write and
the reload.

### Rolling back a deploy that *was* valid but wrong

The right fix is `git revert` and push — it keeps git and the server in step:

```bash
git revert <bad-commit>
git push origin nginx-domain-live
```

### Restoring by hand, when you cannot wait for CI

Every deploy leaves a timestamped snapshot of the **whole** `conf.d` directory:

```bash
ls -1 /opt/nginx-domains/backup/
# 2026-09-18_11-42-07
# 2026-09-18_12-05-31   <- newest, taken just before the last deploy
```

```bash
B=/opt/nginx-domains/backup/2026-09-18_11-42-07

# see what changed first
sudo diff -ru "$B" /etc/nginx/conf.d | head -50

# restore only the managed files; leave everything else alone
sudo rm -f /etc/nginx/conf.d/managed-*.conf
sudo install -o root -g root -m 0644 "$B"/managed-*.conf /etc/nginx/conf.d/

sudo nginx -t && sudo systemctl reload nginx
```

> Then fix git to match. A hand-restored server is one push away from being
> overwritten by whatever is on `nginx-domain-live`.

Certificates survive a rollback untouched — they live under `/etc/letsencrypt`,
which this system never writes to. But note that the backup in
`/opt/nginx-domains/backup/` captures the deployed files **as certbot left
them**, so a restored file still has its 443 block. That is usually what you
want. If you restore a file from before a certificate existed, run
`setup-ssl.sh` afterwards to put TLS back.

The newest 30 backups are kept and older ones pruned after each successful
deploy. Change with `KEEP_BACKUPS=60 sudo -n ...`.

### If nginx is down rather than merely wrong

`reload` cannot take nginx down — it only swaps workers on a configuration that
already passed `nginx -t`. If nginx is not running, something else stopped it:

```bash
sudo systemctl status nginx --no-pager -l
sudo journalctl -u nginx -n 50 --no-pager
sudo nginx -t                       # names the file and line
sudo systemctl start nginx
```

---

## 9. Cloudflare DNS

Every domain needs an A record pointing at the server before anything else can
work. `setup-cloudflare-dns.sh` creates them, and the workflow runs it **first**
— before the deploy, long before certbot.

```
DNS (Cloudflare)  →  deploy the vhost  →  certbot issues and installs
```

That order is load-bearing. Let's Encrypt validates a domain by resolving it
and connecting to it, so no A record means no certificate means no HTTPS.
Getting it backwards is the most common reason a new domain comes up on plain
HTTP and stays there.

It runs on the GitHub runner, not the server — it only talks to the Cloudflare
API over HTTPS.

### What it does per domain

| Situation | What happens |
| --- | --- |
| No A record | **created**, pointing at `NGINX_SERVER_IP` |
| A record, correct IP | **`already created`** — reported, left alone |
| A record, different IP | **updated** to the right IP (`--no-update` reports instead) |
| A `CNAME` on the same name | **refused** — DNS forbids an A beside a CNAME, and deleting someone's CNAME is not an automatic decision |
| An `AAAA` on the name | warned — IPv6 clients prefer it, so a stale one silently overrides everything |
| Domain outside the zone | skipped — a tenant's own domain lives in their Cloudflare account |

**It never deletes.** Removing a `.conf` from git takes the vhost off the
server and leaves the record pointing at a host that no longer answers for that
name. That is recoverable; an automatic delete is not.

### The API token

Create a **scoped** token, not the Global API Key:

> Cloudflare dashboard → My Profile → API Tokens → **Create Token** → Custom token
> - **Permissions:** `Zone` · `DNS` · `Edit`
> - **Zone Resources:** Include · Specific zone · `ajtechhub.com`

Put it in the repository secret `CLOUDFLARE_API_TOKEN`.

The Global API Key can do anything to any zone *and* to the account, cannot be
scoped, and cannot be revoked individually. A token limited to DNS edits on one
zone is the difference between a leaked secret being an incident and being a
catastrophe. Never paste either into a chat, an issue, or a commit.

### The server IP

Set `NGINX_SERVER_IP` to the server's **public** IPv4. On the server:

```bash
curl -s ifconfig.me; echo
```

It is read from the **Variables** tab first and the **Secrets** tab second, so
either works. Prefer the variable: GitHub masks secret values in logs, so an IP
set as a secret makes the DNS step print `created A -> ***` — exactly the line
you want to read when a record looks wrong. A server's public address is in DNS
by definition and is not a secret.

The script refuses a hostname and refuses a private or loopback address —
Cloudflare would accept `192.168.x.x` happily and nothing on the internet would
ever reach it.

### Proxy status: off by default

Records are created **DNS-only** (grey cloud), deliberately. Proxying puts
Cloudflare between the browser and this server, which changes how TLS
terminates and how Let's Encrypt validates.

Get certificates working end to end first. Then turn the proxy on per record in
the dashboard **and** set SSL/TLS mode to **Full (strict)** — the only mode
where the origin certificate still means anything. `Flexible` re-encrypts
nothing and will produce a redirect loop against the HTTP→HTTPS redirect
certbot adds.

`--proxied` creates records with the proxy on if you want it from the start.

### Running it by hand

```bash
export CLOUDFLARE_API_TOKEN=...          # never commit this
export SERVER_IP=203.0.113.10

./nginx-domains/setup-cloudflare-dns.sh --dry-run   # report, change nothing
./nginx-domains/setup-cloudflare-dns.sh             # create and correct
./nginx-domains/setup-cloudflare-dns.sh --no-update # never change an existing IP
```

Needs `curl` and `jq`. Both are on the GitHub runner already.

### Turning it off

Set `NGINX_AUTO_DNS` to `false`. The step is skipped and you manage records by
hand; everything downstream still works, provided DNS resolves by the time
certbot runs.

---

## 10. TLS

**The domain files in git contain no TLS.** No 443 block, no `ssl_certificate`,
no redirect — just the domain on port 80 and the app it proxies to. certbot
writes everything else.

```bash
sudo -n /opt/nginx-domains/setup-ssl.sh
```

It runs automatically after every deploy, so adding a `.conf` and pushing is
all it takes to get HTTPS.

### How the two halves fit together

| Owns | What |
| --- | --- |
| **git** | the domain, the proxy, the headers, the timeouts |
| **certbot** | the certificate, the 443 block, the cipher list, the redirect |

`certbot --nginx` reads the deployed server block, clones it into a 443 block
with the certificate lines, and rewrites the port 80 block as a redirect.
Nothing in this repository needs to know the current recommended cipher list or
where certificates live — certbot does, and keeps it current through its own
package updates.

### Why it runs on every deploy, not just the first

Because a deploy undoes certbot's work, by design.

`deploy-nginx-domains.sh` replaces `managed-<domain>.conf` with the file from
git — and that file is the port 80 proxy, without TLS. So every deploy strips
the 443 block certbot added, and `setup-ssl.sh` puts it back immediately
afterwards.

That is not a workaround. It is what keeps git authoritative for the proxy
while certbot stays authoritative for TLS. Teaching the deploy to *preserve*
certbot's edits would mean a deployed file that no commit describes, and no way
to tell a deliberate edit from a stale one.

> **The cost, stated plainly:** between the deploy's reload and `setup-ssl.sh`
> finishing, a domain is served on plain HTTP and its HTTPS port has no server
> block. That window is seconds per domain, and only on redeploys — never on a
> first deploy, where there was no HTTPS to lose.
>
> If that window matters more than the simplicity does, the other arrangement
> is to write the 443 block into the domain files in git and use
> `certbot certonly` instead, so nothing is ever removed. That trades the
> window for hand-maintained TLS config in seven files.

So: **do not hand-write TLS into a domain file, and do not copy certbot's
additions back into git.** Change the proxy; let certbot own the certificate
half.

### One certificate per domain

`--cert-name <domain>` pins each lineage, so `/etc/letsencrypt/live/<domain>/`
is predictable and certbot never invents a `-0001` suffix. A domain whose DNS
is not pointed yet fails on its own instead of taking the others with it, and
adding or removing a domain does not re-issue everything.

### Rate limits

Let's Encrypt allows 50 certificates per registered domain per week and 5
failed validations per hostname per hour. Two things make those hard to hit:

- **Reachability is checked first.** The script confirms the name resolves and
  that something answers HTTP on port 80 before calling certbot at all. A
  domain that is not pointed here is skipped, not validated and failed.
- **`--keep-until-expiring`.** A certificate with more than 30 days left is
  kept. The run after every deploy re-installs the config but asks Let's
  Encrypt for nothing.

```bash
sudo -n /opt/nginx-domains/setup-ssl.sh --staging    # untrusted certs, high limits
sudo -n /opt/nginx-domains/setup-ssl.sh --dry-run    # rehearse only
sudo -n /opt/nginx-domains/setup-ssl.sh --force      # renew early; do not loop
```

### Port 80 must stay open

Even after everything redirects to 443. It is how Let's Encrypt validates — on
first issue **and on every renewal**. Closing it is the most common way a
working setup silently stops renewing three months later.

### Renewal

certbot's timer renews in place. `setup-ssl.sh` installs a deploy hook at
`/etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh` that runs `nginx -t`
and reloads — without it a certificate renews on disk while nginx keeps serving
the expired one from memory. The hook fires only on an actual renewal, not on
the twice-daily no-op checks.

```bash
sudo certbot certificates                    # what exists and when it expires
systemctl list-timers | grep certbot         # that renewal is scheduled
sudo certbot renew --dry-run                 # rehearse the whole renewal
```

### HSTS

certbot does not add it and neither does this system. It is worth turning on
once everything is settled, but it is not reversible from the server side — a
browser that sees it refuses plain HTTP for that host for the full `max-age`.
Be especially careful on the theme hosts: the header applies to every name in
`server_name`, so a customer domain inherits the same commitment.

### Turning the automation off

Set the repository variable `NGINX_AUTO_SSL` to `false`. The workflow stops
running `setup-ssl.sh`; the script still works by hand.

---

## 11. Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `sudo: a password is required` | sudoers rule missing, or the runner user is not the one named in it | `sudo -l -U $RUNNER_USER`; check the paths in `/etc/sudoers.d/nginx-domains` |
| `cannot write to /opt/nginx-domains` | wrong owner | `sudo chown -R $RUNNER_USER:$RUNNER_USER /opt/nginx-domains` |
| `jq is not installed on this runner` | stock Ubuntu has no jq | `sudo apt-get install -y jq` |
| `Could not work out this host's public IPv4` | runner has no outbound internet | fix that first — it also stops Cloudflare and Let's Encrypt working — or set `NGINX_SERVER_IP` |
| Job never starts, stays queued | the self-hosted runner is offline | `systemctl status 'actions.runner.*'` on the server |
| `/opt/nginx-domains does not exist` | section 2 was not run | run it |
| `cannot write to /opt/nginx-domains` | wrong owner | `sudo chown -R deploy:deploy /opt/nginx-domains` |
| `another deploy is already running` | two pushes overlapped | re-run the job; the lock clears when the first finishes |
| `contains no *.conf files` | every config was deleted, or the copy half-failed | intentional? run on the server with `--allow-empty` |
| `duplicate ... "$connection_upgrade"` | two files define the map | there must be exactly one `00-upgrade-map.conf` |
| Deploy is green, site returns 502 | nginx is fine, the upstream is not listening | check the port map in section 6 against `ss -lntp` |
| Site is on HTTP only after a deploy | `setup-ssl.sh` did not run or was skipped | check the **Issue or renew certificates** step; `NGINX_AUTO_SSL` may be `false` |
| `certbot's nginx plugin is not installed` | `python3-certbot-nginx` missing | `sudo apt-get install -y python3-certbot-nginx` |
| `::warning::<host> skipped - not reachable` | DNS not pointed here, or port 80 closed | add the A record, open 80, re-run. The check is deliberate — it saves a failed validation |
| `Could not automatically find a matching server block` | certbot cannot see the `server_name` | the deploy must run first; check the name in the deployed file matches exactly |
| `too many certificates already issued` | Let's Encrypt weekly limit hit | wait it out; use `--staging` for testing. Do not loop `--force` |
| Certificate expired although renewal ran | the deploy hook is missing | re-run `setup-ssl.sh`; it reinstalls `/etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh` |
| Renewal fails after months of working | port 80 was closed at some point | reopen it; validation needs it on every renewal, not only the first |

Read the job log top to bottom: the **Preview what will change** step shows the
plan, and the **Deploy and reload nginx** step shows what the server actually
did, timestamped line by line.
