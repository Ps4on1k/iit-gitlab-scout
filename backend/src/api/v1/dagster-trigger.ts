import type { FastifyInstance } from "fastify";

const DAGSTER_URL = "http://dagster:3001";
const REPO_LOCATION = "dagster_project";
const REPO = "dagster_project.repo";

export async function dagsterTriggerRoutes(app: FastifyInstance) {
  app.post("/api/v1/dagster/trigger", async () => {
    const runConfigData = {
      operations: {
        gitlab_commits: { config: {} },
      },
    };

    const mutation = `
      mutation LaunchRun($executionParams: ExecutionParams!, $runConfigData: RunConfigData) {
        launchPipelineExecution(executionParams: $executionParams, runConfigData: $runConfigData) {
          __typename
          ... on LaunchRunSuccess {
            run {
              runId
              status
              assetSelection {
                path
              }
            }
          }
          ... on UnexpectedPythonError {
            message
            stack
          }
          ... on PythonError {
            message
            stack
          }
        }
      }
    `;

    try {
      const response = await fetch(`${DAGSTER_URL}/graphql`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: mutation,
          variables: {
            executionParams: {
              mode: "default",
              executionMetadata: { tags: [{ key: "trigger", value: "api" }] },
              runConfigData: JSON.stringify(runConfigData),
              selector: {
                repositoryLocationName: REPO_LOCATION,
                repositoryName: REPO,
                pipelineName: "__ASSET_JOB",
                assetSelection: [{ path: ["gitlab_commits"] }],
                assetCheckSelection: [],
              },
            },
            runConfigData: JSON.stringify(runConfigData),
          },
        }),
      });

      const data = (await response.json()) as any;
      const launch = data?.data?.launchPipelineExecution;

      if (launch?.__typename === "LaunchRunSuccess") {
        return { ok: true, runId: launch.run.runId, status: launch.run.status };
      }

      return { ok: false, error: launch ? JSON.stringify(launch).slice(0, 200) : "No response" };
    } catch (error: any) {
      return { ok: false, error: error.message || "Failed to trigger Dagster" };
    }
  });
}
