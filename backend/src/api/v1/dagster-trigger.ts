import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../../utils/auth.js";

const ASSETS_QUERY = JSON.stringify({
  query: "query { repositoryOrError(repositorySelector: { repositoryName: \"dagster_project\", repositoryLocation: \"dagster_project\" }) { ... on Repository { assetNodes { key { path } } } } }",
});

export async function dagsterTriggerRoutes(app: FastifyInstance) {
  app.post("/api/v1/dagster/trigger", { preHandler: [requireAdmin] }, async (_request, reply) => {
    const dagsterUrl = process.env.DAGSTER_URL || "http://dagster:3000";

    try {
      const resp = await fetch(dagsterUrl + "/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: ASSETS_QUERY,
        signal: AbortSignal.timeout(10_000),
      });

      if (!resp.ok) {
        return reply.status(502).send({ ok: false, error: "Dagster returned " + resp.status });
      }

      const repo = await resp.json() as any;
      const assetKeys = (repo?.data?.repositoryOrError?.assetNodes || []).map(function(a: any) {
        return { path: a.key.path };
      });

      if (assetKeys.length === 0) {
        return { ok: false, error: "No assets found in Dagster repository" };
      }

      const launchBody = JSON.stringify({
        query: "mutation LaunchAsset($assetKeys: [AssetKeyInput!]!) { launchAssetMaterialization(assetKeys: $assetKeys, dryRun: false) { __typename ... on LaunchBackfillRunCreated { backfillId } ... on PythonError { message } } }",
        variables: { assetKeys: assetKeys },
      });

      const launchResp = await fetch(dagsterUrl + "/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: launchBody,
        signal: AbortSignal.timeout(10_000),
      });

      if (!launchResp.ok) {
        return reply.status(502).send({ ok: false, error: "Dagster launch returned " + launchResp.status });
      }

      const launchResult = await launchResp.json() as any;
      const result = launchResult?.data?.launchAssetMaterialization;

      if (result?.__typename === "PythonError") {
        return { ok: false, error: result.message };
      }

      return {
        ok: true,
        data: {
          message: "Запущена материализация всех ассетов в Dagster",
          assets: assetKeys.length,
          backfillId: result?.backfillId || null,
          dagsterUrl: dagsterUrl,
        },
      };
    } catch (err: any) {
      if (err.name === "TimeoutError") {
        return reply.status(504).send({ ok: false, error: "Dagster не отвечает (timeout)" });
      }
      return reply.status(500).send({ ok: false, error: "Ошибка подключения к Dagster: " + err.message });
    }
  });
}
