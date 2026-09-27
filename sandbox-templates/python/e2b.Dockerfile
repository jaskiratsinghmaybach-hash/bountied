# E2B sandbox template for Runtime.PYTHON — see lib/sandbox/runtimes.ts's
# RUNTIME_REGISTRY.PYTHON entry (templateId "1z9fpclwmf3aeijmmv6s").
#
# This file did not exist in the repo before product decision 2026-09-28
# even though runtimes.ts's comments referenced this exact path — the
# template was built and applied directly via `e2b template build` without
# ever committing its source, leaving no reviewable/reproducible record of
# what's actually running in the live template. Reconstructed here to match
# what the retry ladder in runtimes.ts (PYTHON_SYSTEM_LIB_SIGNATURES) implies
# is true about the image: it's intentionally lean, NOT pre-loaded with
# build-essential/libpq-dev/python3-dev/libffi-dev/etc. — those are exactly
# the packages the apt-get retry installs on demand when a solver's
# dependency needs them, which only makes sense if the base image doesn't
# already have them.
#
# IMPORTANT: if this doesn't exactly match what's live at template ID
# 1z9fpclwmf3aeijmmv6s, treat the live template as the source of truth and
# correct this file to match it — don't rebuild over the live template from
# this reconstruction without first diffing the two.
FROM e2bdev/code-interpreter:latest

# git is required — lib/sandbox/execute.ts clones the solver's mirrored
# repo with `git clone` as the first sandbox command.
# python3/pip3 ship with e2bdev/code-interpreter already.
RUN python3 --version && pip3 --version && git --version
