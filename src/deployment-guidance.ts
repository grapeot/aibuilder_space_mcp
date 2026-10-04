/** The final asynchronous deployment contract, not backend-version detection. */
export const deploymentLifecycle = {
  acceptance_http_status: 202,
  acceptance_meaning: "The task was accepted, not completed. Do not report deployment success yet.",
  inline_logs: "streaming_logs is null in POST and status responses; this is expected, not a failure.",
  deprecated_request_field: "streaming_log_timeout_seconds is accepted but ignored; omit it in new requests.",
  status_endpoint: "GET /v1/deployments/{service_name}",
  pending_states: ["queued", "deploying"],
  diagnostic_states: ["ERROR", "UNHEALTHY", "DEGRADED"],
  polling: "Poll status about every 5–10 seconds. If still pending after 20 minutes, report the unresolved state and inspect logs; do not automatically redeploy.",
  completion: "After HEALTHY, verify the public URL responds before reporting success. SLEEPING is not a build failure; check reachability and wake-up behavior.",
  logs: {
    build: "GET /v1/deployments/{service_name}/logs?log_type=build&timeout=5",
    runtime: "GET /v1/deployments/{service_name}/logs?log_type=runtime&timeout=5",
    behavior: "Logs are fetched from Koyeb on demand, not cached in the platform database. Each request collects a bounded window and returns JSON, not an HTTP streaming connection.",
    unavailable: "Empty logs or a not-yet-available deployment ID are inconclusive; use status and retry later. Authentication, ownership and missing-service errors must be handled separately.",
  },
  retry_policy: "Do not repeat POST merely because logs are null, provisioning is pending, or the request timed out. For an ambiguous POST result, query the known service_name first. Redeploy only for an intentional new attempt.",
};

export function renderDeploymentAssistance(): string {
  return `### Step 4: Deployment Assistance

Once the repository, service name, branch and permission to deploy are confirmed:

1. Call POST /v1/deployments using the API base URL and Bearer AI_BUILDER_TOKEN. A 202 response means only that the task was accepted; it is not proof of a completed deployment.
2. Return promptly to monitoring. The POST does not wait for build logs. The streaming_logs field is null by design; do not infer a bad repository or branch from it. Omit the deprecated streaming_log_timeout_seconds field in new requests.
3. Poll ${deploymentLifecycle.status_endpoint} about every 5–10 seconds while status is queued or deploying. If still pending after 20 minutes, report the unresolved state and inspect logs instead of submitting another deployment.
4. Fetch build logs when investigating builds: ${deploymentLifecycle.logs.build}. For application startup or runtime issues, use ${deploymentLifecycle.logs.runtime}; add stream=stderr when useful. The default log_type is runtime, so request build explicitly for Docker/build failures.
5. Logs come directly from Koyeb and are not retained in the platform database. Each logs request returns JSON after a bounded collection window. Empty logs or an unavailable deployment ID do not establish failure; check status and retry later. Handle authentication, ownership and missing-service errors separately.
6. On ERROR, UNHEALTHY or DEGRADED, inspect logs and explain the evidence before proposing a fix. After HEALTHY, verify the public URL responds before reporting success. SLEEPING is not a build failure; check reachability and wake-up behavior.
7. If the POST result is ambiguous because of a connection timeout, query the known service_name first. Do not repeat POST just because logs are null or status is pending. Redeploy only for an intentional new attempt.
`;
}

/** Keep remote preparation instructions, but own the deployment lifecycle section.
 * This also corrects a still-cached remote guide's obsolete inline-log advice.
 */
export function applyDeploymentContract(guide: string): string {
  guide = guide.replaceAll(
    "Values submitted to `POST /v1/deployments` may appear in deployment logs or audit records.",
    "Values submitted to `POST /v1/deployments` are forwarded to Koyeb; new environment dumps are not written to platform deployment audit records.",
  ).replaceAll(
    "Values may be retained in AI Builder deployment audit data.",
    "Koyeb receives and holds the configured runtime environment.",
  );
  const lines = guide.split(/\r?\n/);
  const start = lines.findIndex(line => /^### Step 4: Deployment Assistance\s*$/.test(line));
  const section = renderDeploymentAssistance().trimEnd();
  if (start === -1) {
    return `${guide.trimEnd()}\n\n${section}\n`;
  }
  let end = start + 1;
  while (end < lines.length && !/^#{1,3}\s/.test(lines[end])) {
    end += 1;
  }
  return [...lines.slice(0, start), section, "", ...lines.slice(end)].join("\n");
}
