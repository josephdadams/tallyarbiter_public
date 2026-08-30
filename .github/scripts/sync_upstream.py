#!/usr/bin/env python3
"""Keep the website in step with the TallyArbiter repo.

Two jobs, deliberately treated differently:

  * The released version is mechanical, so it is rewritten in place.
  * The source-type count is editorial — whether a new type belongs under an
    existing manufacturer card or needs a new one is a judgement call — so a
    change is only ever *reported*, never applied. A wrong page would be worse
    than a stale one.

Writes its findings to $GITHUB_OUTPUT when running under Actions. No third
party dependencies; standard library only.
"""

import json
import os
import re
import sys
import urllib.error
import urllib.request

UPSTREAM = "josephdadams/TallyArbiter"
PAGE = "index.html"
SKIP_FILES = {"_Source.ts", "_Template.ts"}
# Not a real switcher — it is the built-in test generator.
SKIP_IDS = {"TESTMODE"}

REGISTER_RE = re.compile(
    r"@RegisterTallyInput\(\s*'([^']+)'\s*,\s*'((?:[^'\\]|\\.)*)'"
)

token = os.environ.get("GH_TOKEN", "")

ISSUE_BODY = """\
`src/sources` in [josephdadams/TallyArbiter](https://github.com/josephdadams/TallyArbiter/tree/HEAD/src/sources)
now registers **{actual}** selectable source types. The Supported gear section of
`index.html` declares **{declared}**.

This is reported rather than corrected automatically, because placing a new
type under the right manufacturer card is a judgement call, and a confidently
wrong page is worse than a stale one.

### To fix

1. Update the affected `<span>N types</span>` badge, or add a new `.system` card.
2. Update the `<h2>` in `#supported` — it spells the total out in words.
3. Update `...and N more` in the arbitration diagram: that is the total minus
   the three sources drawn.

The per-card badges must sum to the total. The sync script uses that sum to
decide whether the page is current, so this issue stops recurring once they
agree again.

### Currently registered upstream

{listing}

<sub>Filed automatically by `.github/workflows/deploy.yml`.</sub>
"""


def _get(url, as_json=True):
    req = urllib.request.Request(url)
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("User-Agent", "tallyarbiter-site-sync")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(req, timeout=30) as resp:
        raw = resp.read().decode("utf-8", "replace")
    return json.loads(raw) if as_json else raw


def latest_version():
    """Newest published release, as (display, full) e.g. ('3.4', '3.4.1')."""
    tag = _get(f"https://api.github.com/repos/{UPSTREAM}/releases/latest")["tag_name"]
    full = tag.lstrip("vV").strip()
    if not re.fullmatch(r"\d+(\.\d+)*", full):
        raise ValueError(f"unexpected release tag format: {tag!r}")
    parts = full.split(".")
    return ".".join(parts[:2]), full


def registered_source_types():
    """Every selectable source type the upstream code registers."""
    listing = _get(f"https://api.github.com/repos/{UPSTREAM}/contents/src/sources")
    found = {}
    for entry in listing:
        name = entry.get("name", "")
        if not name.endswith(".ts") or name in SKIP_FILES:
            continue
        body = _get(entry["download_url"], as_json=False)
        for type_id, label in REGISTER_RE.findall(body):
            if type_id in SKIP_IDS:
                continue
            found[type_id] = label.replace("\\'", "'")
    if not found:
        raise ValueError("no source types found — has the registration API changed?")
    return found


def declared_on_page(html):
    """What the page currently claims, summed from the per-card badges."""
    counts = re.findall(r"<span>(\d+) types?</span>", html)
    return sum(int(n) for n in counts)


def set_output(**pairs):
    path = os.environ.get("GITHUB_OUTPUT")
    if not path:
        for key, value in pairs.items():
            print(f"  {key}={value}")
        return
    with open(path, "a") as handle:
        for key, value in pairs.items():
            text = str(value)
            if "\n" in text:
                handle.write(f"{key}<<__EOF__\n{text}\n__EOF__\n")
            else:
                handle.write(f"{key}={text}\n")


def main():
    try:
        display, full = latest_version()
        types = registered_source_types()
    except (urllib.error.URLError, urllib.error.HTTPError, ValueError, KeyError) as exc:
        print(f"::error::could not read {UPSTREAM}: {exc}")
        return 1

    html = original = open(PAGE, encoding="utf-8").read()

    # --- version: rewritten in place ------------------------------------
    html, pill = re.subn(
        r"(<b>v)\d+(?:\.\d+)*(</b>)", rf"\g<1>{display}\g<2>", html
    )
    html, ld = re.subn(
        r'("softwareVersion":\s*")[^"]*(")', rf"\g<1>{full}\g<2>", html
    )
    if pill != 1 or ld != 1:
        print(f"::error::expected one version pill and one JSON-LD field, "
              f"found {pill} and {ld} — has index.html changed shape?")
        return 1

    changed = html != original
    if changed:
        open(PAGE, "w", encoding="utf-8").write(html)

    # --- source types: reported only ------------------------------------
    actual = len(types)
    declared = declared_on_page(original)
    drifted = actual != declared

    listing = "\n".join(f"- {label}" for label in sorted(types.values()))

    # Write the report body to a file so the workflow can hand it straight to
    # `gh issue create --body-file`, avoiding a heredoc nested inside YAML.
    if drifted:
        with open("drift-issue.md", "w", encoding="utf-8") as handle:
            handle.write(ISSUE_BODY.format(
                actual=actual, declared=declared, listing=listing))

    print(f"upstream release : {full} (pill shows v{display})")
    print(f"version updated  : {changed}")
    print(f"source types     : {actual} registered, {declared} declared on the page")
    print(f"drifted          : {drifted}")

    set_output(
        version_full=full,
        version_display=display,
        version_changed=str(changed).lower(),
        types_actual=actual,
        types_declared=declared,
        types_drifted=str(drifted).lower(),
        types_listing=listing,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
