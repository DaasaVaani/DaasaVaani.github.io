# Repository maintenance

## Current operating policy

Normal main protection in every repository requires PRs/named existing checks,
no admin exemption, no mandatory second reviewer, no force pushes/deletion.
There is a temporary owner-authorized repository-admin direct-main exemption;
**remove it and verify normal policy before release**. It does not authorize a
publisher bot, bypass validation or permit force/deletion. Verify live GitHub
configuration before acting; dated API observations belong in [HISTORY.md](../HISTORY.md).

| Repository | Managed PR/check ruleset | No-bypass force/delete guard | Required check |
| --- | --- | --- | --- |
| Website | 25497312 | 25525161 | Workflow lint |
| Shared | 25526641 | 25526636 | Bootstrap files and YAML syntax |
| AndroidApp | 25526642 | 25526638 | Bootstrap files and YAML syntax |
| Library | 25526643 | 25526637 | Bootstrap files and YAML syntax |

Temporary bypass is repository-admin role5, always mode, on PR/check rules only.
Force/delete guards have no bypass. Website's configured approval parameters need
review against the intended no-mandatory-second-reviewer release policy.
Until final release, the owner authorizes implementation pushes only to `main`
using this existing repository-admin permission. Do not create or push validation
branches for new work. Fetch before integration, preserve unrelated work and
independently pinned Shared revisions, run the full applicable local build/test/
lint/device suites on the final change set, and push only a fast-forward update.
Verify the exact remote SHA and hosted main checks after each push; a failed,
cancelled or missing required run blocks further publication until resolved.
Do not disable protections, force-push, waive tests or infer production activation.
Source review and post-merge-only real-content generation remain unchanged.

Only `main` can deploy; a manual main run additionally
requires the explicit `deploy_main=true` recovery input. Both lint and the complete
web build/test job must pass in the same workflow before upload/deployment.
Validation branches cannot deploy even if that input is supplied.

For an authorized missing-main-trigger recovery, run
`gh workflow run validate.yml --ref main -f deploy_main=true` from Website.
Verify the resulting exact head SHA, both required job conclusions, deployment
and live HTTPS output; dispatch itself is not a pass. This grants no permission
to deploy an old artifact, omit a check or publish unvalidated content.
Existing implementation branches may remain as references; their deletion needs
separate authorization. Never treat the admin exception as permission to omit a
check or as release authorization. Before final release, end the temporary
main-only workflow, remove the admin exception and verify the normal PR/check
policy against live configuration.

## Access and automation review

- Review organization/repository access, owner2FA/recovery, deletion/visibility,
  token/OAuth expiration/approvals and least-privilege Actions permissions live.
- Require existing checks only, not fictional app validation. Verify private
  vulnerability reporting, secret scanning/push protection/dependency alerts.
- Pin Actions to immutable commits, enforce pins when workflows support them,
  review outside contributions and never expose secrets to untrusted PR jobs.
- Keep Pages environment/source permissions deliberate and deployment allowlists
  limited to validated public output. Website deploys the explicitly labeled
  fixture-only Vite output only after workflow lint and the full web suites pass
  in the same workflow. Its CI publisher checkout uses the validated tooling pin;
  this is not production Library publication.
- Source/API credentials remain local; signing keys outside repository/CI/logs.
  Preserve unsigned CI -> local verification/signing -> protected APK publication.
- Complete provider clarification before first API ingestion; no invented legal
  exemption or per-item rights gate.

## Finalization, pushing and releases

Use [full validation policy](testing-and-release.md). Incremental checks may be
focused; finalization/confirmation and every push require full applicable builds
and all suites. Documentation-only work has the all-available-bootstrap exception
while app tooling is absent. Missing/failing/skipped required code checks block.
Passing tests does not authorize pushing or override rules.

Before release verify compatible publication/client versions, root/App Links and
service-worker behavior, actual storage/host capacity, signed APK provenance,
rollback/recovery, supported-platform/security expectations and secure key backup.
Never restore an unprotected main or equate recovery snapshots with current policy.

## Dependencies and recurring maintenance

- Review weekly dependency proposals, licenses/security/compatibility and exact
  workflow-linter version/checksum updates; no blind automatic merges.
- Maintain native lockfiles/version catalogs as tooling exists. No fabricated
  commands, assumed installs or parallel pin generation.
- Review failures, pending work, alerts and incoming reports; periodically check
  access/Actions settings, documentation/links and unresolved drafts.
- After incidents rotate affected secrets, verify scope and controls, archive
  sanitized lessons in HISTORY. No response-time/release-date promises.
- Update current README/requirements/design/contracts/algorithm/tasks/commands
  alongside changes; archive replaced decisions and dated records only in HISTORY.
