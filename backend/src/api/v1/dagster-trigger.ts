import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../../utils/auth.js";

const LAUNCH_BODY = JSON.stringify({
  query: "mutation { launchPipelineExecution(executionParams: { selector: { pipelineName: \"__ASSET_JOB\", repositoryName: \"__repository__\", repositoryLocationName: \"dagster_project\" }, runConfigData: \"{}\" }) { __typename ... on LaunchPipelineRunSuccess { run { id status } } ... on PythonError { message } } }",
});

export async function dagsterTriggerRoutes(app: FastifyInstance) {
  app.post("/api/v1/dagster/trigger", { preHandler: [requireAdmin] }, async (_request, reply) => {
    const dagsterUrl = process.env.DAGSTER_URL || "http://dagster:3000";

    try {
      const launchResp = await fetch(dagsterUrl + "/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: LAUNCH_BODY,
        signal: AbortSignal.timeout(10_000),
      });

      if (!launchResp.ok) {
        return reply.status(502).send({ ok: false, error: "Dagster returned " + launchResp.status });
      }

      const launchResult = await launchResp.json() as any;
      const result = launchResult?.data?.launchPipelineExecution;

      if (result?.__typename === "PythonError") {
        return { ok: false, error: result.message };
      }

      if (result?.__typename === "LaunchRunSuccess") {
        return {
          ok: true,
          data: {
            message: "Сбор данных запущен в Dagster",
            runId: result.run.id,
            status: result.run.status,
            dagsterUrl: dagsterUrl,
          },
        };
      }

      return { ok: false, error: "Unexpected response from Dagster: " + JSON.stringify(result) };
    } catch (err: any) {
      if (err.name === "TimeoutError") {
        return reply.status(504).send({ ok: false, error: "Dagster не отвечает (timeout)" });
      }
      return reply.status(500).send({ ok: false, error: "Ошибка подключения к Dagster: " + err.message });
    }
  });
}
