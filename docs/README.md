# DaasaVaani documentation

## Start here

1. [Root AI instructions](../AGENTS.md): repository workflow and completion gates.
2. [Requirements](requirements.md): approved product scope and stable IDs.
3. [AI development guide](ai-development.md): working method/current repository state.
4. [Current design decisions](design-decisions.md) and
   [Shared specification](https://github.com/DaasaVaani/shared/blob/main/docs/implementation-specification.md):
   current selected directions, contracts, limits and remaining readiness gates.
5. [Architecture](architecture.md), [contract checklist](https://github.com/DaasaVaani/shared/blob/main/docs/data-contracts.md)
   and [algorithm analysis](algorithm-analysis-tasks.md): ownership, exact obligations
   and outstanding proof/fixture work.
6. [Roadmap](implementation-roadmap.md) and [testing/release](testing-and-release.md):
   implementation prerequisites and full finalization/push validation.

Staged implementation is authorized. The current prelaunch reader and fixture features are not
full production design closure or release readiness. Consult the roadmap for
actual coverage and remaining gates; guides do not prove provider permission.
The approved [lyric identity and optional media contract](https://github.com/DaasaVaani/shared/blob/main/docs/lyric-identity.md)
defines video-independent identity and legacy compatibility.
The [real lyric preview](lyric-preview.md) reads the reviewed text-only publication
separately from fixture content, with typed local favorites/lists and preserving
legacy adapters. Its limited in-memory content lifecycle does not establish
production offline/full-personal conformance.

## Owners

| Repository | Owns |
| --- | --- |
| [Website](https://github.com/DaasaVaani/DaasaVaani.github.io) | React static PWA/root Pages and product requirements |
| [Android](https://github.com/DaasaVaani/AndroidApp) | Native Kotlin app/core and APK releases |
| [Shared](https://github.com/DaasaVaani/shared) | Contracts/settings/fixtures, UI catalogs/generator/committed resources |
| [Library](https://github.com/DaasaVaani/library) | Reviewed sources/assets/registries, local ingestion and publisher |

Consumers independently pin Shared and query published Library artifacts.
Website has no library source directory. Its settings directory owns web settings;
portable configuration stays in Shared. Reviewed owner-text import/publication
is authorized in Library; further reinterpretation or inferred mappings are not.
Actual Node/React and Kotlin/Compose fixture tooling is documented in the testing guide.

## Community and operations

[Contributing](CONTRIBUTING.md) | [Security](SECURITY.md) |
[Code of Conduct](CODE_OF_CONDUCT.md) | [Support](SUPPORT.md) |
[Maintenance](maintenance.md) |
[Content/provider policy](https://github.com/DaasaVaani/library/blob/main/docs/content-rights.md)

## Documentation ownership

- Current guides contain only current approved rules, current limitations and
  unresolved work. Update them alongside changes, including commands and links.
- [HISTORY.md](../HISTORY.md) is the sole archive for past decisions, alternatives,
  chronology, dated observations and completed validation records. Archive before
  removing; preserve every still-current approved detail in its owning guide.
- AGENTS is the single root instruction entrypoint; do not add a parallel
  copilot-instructions file. GitHub issue/PR templates remain in .github.
- Do not duplicate normative tables across repositories; link the owning guide
  and record compatibility impacts. Requirements are not silently changed to fit code.
