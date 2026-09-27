# E2B sandbox template for Runtime.NODE — see lib/sandbox/runtimes.ts's
# RUNTIME_REGISTRY.NODE entry for how this template ID is wired in.
#
# Only Debian-based base images are supported by E2B. Using the same
# e2bdev/code-interpreter base the Python template builds from (see
# sandbox-templates/python/e2b.Dockerfile) keeps both templates on a
# consistent, already-hardened base rather than introducing a second base
# image lineage for no reason.
#
# git is required — lib/sandbox/execute.ts clones the solver's mirrored
# repo with `git clone` as the very first sandbox command, for every
# runtime, not just Node.
FROM e2bdev/code-interpreter:latest

# Node 20 LTS via NodeSource — the E2B base image doesn't ship Node.
# Pinned to the 20.x line (not `latest`) so a template rebuild doesn't
# silently jump major versions under solvers' feet; bump this deliberately
# alongside RUNTIME_VERSION_DEFAULTS.node in lib/problems/manifest-template.ts
# when it's time to move to 22.x.
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# npm ships with the nodejs package above. Kept explicit here as a sanity
# check that the install above actually produced a working npm — if this
# RUN fails, the template build fails loudly instead of shipping a broken
# image.
RUN npm --version
