import { createFileRoute } from "@tanstack/react-router";

type ParkedSessionSearch = {
  readonly title?: string;
  readonly project?: string;
  readonly cwd?: string;
  readonly branch?: string;
};

function parseParkedSessionSearch(search: Record<string, unknown>): ParkedSessionSearch {
  const value = (key: keyof ParkedSessionSearch): string | undefined =>
    typeof search[key] === "string" && search[key] ? search[key] : undefined;
  const title = value("title");
  const project = value("project");
  const cwd = value("cwd");
  const branch = value("branch");

  return {
    ...(title ? { title } : {}),
    ...(project ? { project } : {}),
    ...(cwd ? { cwd } : {}),
    ...(branch ? { branch } : {}),
  };
}

function ParkedSessionPage() {
  const search = Route.useSearch();

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-6 text-foreground">
      <section className="w-full max-w-xl space-y-6 text-center">
        <img
          src="/apple-touch-icon.png"
          alt="T3 Code"
          className="mx-auto size-16 rounded-2xl shadow-sm"
        />
        <p className="text-lg font-medium">session parked</p>
        {search.title || search.project || search.cwd || search.branch ? (
          <dl className="space-y-2 text-left text-sm text-muted-foreground">
            {search.title ? (
              <div className="flex gap-3">
                <dt className="w-20 shrink-0 font-medium text-foreground">Title</dt>
                <dd className="min-w-0 break-words">{search.title}</dd>
              </div>
            ) : null}
            {search.project ? (
              <div className="flex gap-3">
                <dt className="w-20 shrink-0 font-medium text-foreground">Project</dt>
                <dd className="min-w-0 break-words">{search.project}</dd>
              </div>
            ) : null}
            {search.cwd ? (
              <div className="flex gap-3">
                <dt className="w-20 shrink-0 font-medium text-foreground">Directory</dt>
                <dd className="min-w-0 break-all font-mono text-xs">{search.cwd}</dd>
              </div>
            ) : null}
            {search.branch ? (
              <div className="flex gap-3">
                <dt className="w-20 shrink-0 font-medium text-foreground">Branch</dt>
                <dd className="min-w-0 break-words">{search.branch}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}
      </section>
    </main>
  );
}

export const Route = createFileRoute("/$environmentId/$threadId/p")({
  component: ParkedSessionPage,
  validateSearch: parseParkedSessionSearch,
  head: () => ({
    meta: [{ name: "title", content: "Session parked" }],
  }),
});
