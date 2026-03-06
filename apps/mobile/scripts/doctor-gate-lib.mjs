const duplicateIssueMarker = "Check that no duplicate dependencies are installed";
const blockRegex = /Found duplicates for ([^:]+):([\s\S]*?)(?=\nFound duplicates for |\n\s*\d+ checks failed|\n?$)/g;

function fail(status, output, reason) {
  return {
    ok: false,
    exitCode: status ?? 1,
    stdout: "",
    stderr: `${output}\n${reason}\n`,
  };
}

export function evaluateDoctorResult({ status, output }) {
  if (status === 0) {
    return {
      ok: true,
      exitCode: 0,
      stdout: output,
      stderr: "",
    };
  }

  if (!output.includes(duplicateIssueMarker)) {
    return fail(
      status,
      output,
      "[doctor-gate] expo-doctor failed for a reason other than duplicate native dependencies."
    );
  }

  if (output.includes("app config fields that may not be synced")) {
    return fail(
      status,
      output,
      "[doctor-gate] app config sync check is unexpectedly enabled; this repo intentionally manages native folders directly."
    );
  }

  const blocks = [];
  for (const match of output.matchAll(blockRegex)) {
    blocks.push({ pkg: match[1].trim(), body: match[2] });
  }

  if (blocks.length === 0) {
    return fail(
      status,
      output,
      "[doctor-gate] duplicate check failed but no duplicate package block was found."
    );
  }

  for (const { pkg, body } of blocks) {
    if (!body.includes(".bun/")) {
      return fail(
        status,
        output,
        `[doctor-gate] duplicate block for ${pkg} does not reference Bun store paths; treating as real issue.`
      );
    }

    const versionRegex = new RegExp(
      `${pkg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}@(\\d+\\.\\d+\\.\\d+(?:[-A-Za-z0-9.]+)?)`,
      "g"
    );
    const versions = new Set();
    for (const vm of body.matchAll(versionRegex)) {
      versions.add(vm[1]);
    }

    if (versions.size === 0) {
      return fail(
        status,
        output,
        `[doctor-gate] could not parse versions for duplicated package ${pkg}; refusing to continue.`
      );
    }

    if (versions.size !== 1) {
      return fail(
        status,
        output,
        `[doctor-gate] duplicated package ${pkg} has multiple versions (${[...versions].join(", ")}).`
      );
    }
  }

  return {
    ok: true,
    exitCode: 0,
    stdout:
      output +
      "\n[doctor-gate] expo-doctor reported Bun-store duplicate paths only (same-version expo core modules). Gate accepted.\n",
    stderr: "",
  };
}
