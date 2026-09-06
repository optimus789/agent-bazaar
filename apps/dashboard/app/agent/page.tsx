import { AgentView } from './agent-view';

export default function AgentPage() {
  return (
    <div className="flex flex-col gap-4">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">Buyer agent — decision log</h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--ink-2)]">
          Every tool call the procurement agent makes — discovery, ranking, payment, feedback — streamed live as it happens.
        </p>
      </section>
      <AgentView />
    </div>
  );
}
