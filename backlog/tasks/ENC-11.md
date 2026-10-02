---
id: "ENC-11"
title: "Every tool's intake is tested against a real protected file in one table"
status: "open"
priority: "P3"
epic: "robustness"
horizon: "later"
order: 5
depends_on: ["ENC-06", "ENC-08"]
---

# ENC-11 · Every tool's intake is tested against a real protected file in one table

*Plan section 8.* The test that would have caught Split's and Edit Pages' blank output.

## Brief
- `src/test/cross-tool/encryptedIntake.test.*`: each tool's intake against needs-password, owner-only and plain; protected inputs reach the state and never produce an output file. One row per tool, so a tool added later has to add its row.

## Acceptance
- Goes red if any listed tool's intake is reverted to `ignoreEncryption` with no gate.
